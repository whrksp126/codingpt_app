import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator, BackHandler, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/native';
import {
  CaretRight, CaretDown, Code, GraduationCap, Cloud, PencilSimple,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useUser } from '../contexts/UserContext';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import { useAppAlert } from '../hooks/useAppAlert';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import { pickAttachments, pickFromCamera, Attachment } from '../services/attachmentPicker';
import { SessionMeta } from '../types/agentSession';
import { HamburgerButton } from '../components/AppTopBar';
import MessageList from '../components/agent/MessageList';
import ChatSkeleton from '../components/agent/ChatSkeleton';
import PermissionDiffModal from '../components/agent/PermissionDiffModal';
import ChatComposer from '../components/agent/ChatComposer';
import WorkspacePickerSheet from '../components/agent/WorkspacePickerSheet';
import LimitSheet from '../components/Billing/LimitSheet';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;

// 홈 = 일반 채팅이 기본. 입력은 전용 "채팅 워크스페이스"의 세션으로 들어간다.
// 코딩(바이브)은 워크스페이스 셀렉터/"+새 워크스페이스"로 명시적으로 진입(P2에서 AI 자동 제안 추가).
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const { user } = useUser();
  const { alert } = useAppAlert();
  const {
    activeWorkspace, activeSessionId, activeSessionTitle, loadingSession, messages, input, setInput, running,
    send, openSession, newSession, leaveSession, pendingPermission, resolvePermission,
    pendingProposal, clearProposal,
  } = useAgentSession();
  const {
    workspaces, chatWorkspace, sessionsByWs, ensureChatWorkspace, reload: reloadWorkspaceStore,
  } = useWorkspaceStore();
  // IDE 프로젝트 소스(시드용) — IdeProjectContext 가 활성 코딩 워크스페이스를 프리로드/캐시한다.
  const { openIde: openIdeOverlay, project: ideProject, contents: ideContents, projectId: ideProjectId, ready: ideReady } = useIdeProject();

  const [busy, setBusy] = useState(false);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [draft, setDraft] = useState('');              // 채팅 랜딩 컴포저 입력
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [wsSheet, setWsSheet] = useState(false);
  const [composerH, setComposerH] = useState(0);
  // 코딩 워크스페이스 수동 생성 — 설명 입력 모달 → 이름 추천 시트
  const [newWsDraft, setNewWsDraft] = useState<string | null>(null); // null=닫힘
  const [nameStep, setNameStep] = useState<null | { description: string; candidates: string[] | null }>(null);

  const inChat = !!(activeWorkspace && activeSessionId);
  const isChatWs = activeWorkspace?.kind === 'chat';

  // 채팅 히스토리 = 채팅 워크스페이스의 세션들(최신순).
  const chatSessions = useMemo(() => {
    if (!chatWorkspace) return [] as SessionMeta[];
    return [...(sessionsByWs[chatWorkspace.id] || [])]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 50);
  }, [chatWorkspace, sessionsByWs]);

  // 랜딩 포커스 시 채팅 히스토리/목록 조용히 갱신
  useFocusEffect(useCallback(() => { if (!inChat) void reloadWorkspaceStore(true); }, [reloadWorkspaceStore, inChat]));

  // 세션 전환 시 첨부 초기화
  useEffect(() => { setAttachments([]); }, [activeWorkspace?.id]);

  // 시드 파일 = IdeProjectContext 가 프리로드한 "현재 활성 코딩 ws" 소스. 채팅 ws/불일치면 비움.
  const wsFiles = useMemo(() => {
    if (!inChat || isChatWs || !ideProject || !ideReady || ideProjectId !== activeWorkspace?.id) return [];
    return ideProject.files.map((f) => ({ path: f.path, content: ideContents[f.path] ?? f.content }));
  }, [inChat, isChatWs, ideProject, ideReady, ideProjectId, ideContents, activeWorkspace?.id]);

  // 채팅/코딩 뷰에서 하드웨어 백 → 랜딩 복귀
  useEffect(() => {
    if (!inChat || !isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leaveSession(); return true; });
    return () => sub.remove();
  }, [inChat, isFocused, leaveSession]);

  const nickname = (user as any)?.nickname || (user as any)?.name || '코더';
  const isNew = chatSessions.length === 0 && workspaces.length === 0;

  // 기기 파일 첨부(이미지/PDF) — AI 참고용
  const mergeAttachments = useCallback((picked: Attachment[]) => {
    if (picked.length) setAttachments((cur) => {
      const names = new Set(cur.map((a) => a.name));
      return [...cur, ...picked.filter((p) => !names.has(p.name))];
    });
  }, []);
  const addAttachments = useCallback(async () => {
    try { mergeAttachments(await pickAttachments()); }
    catch (_) { alert({ title: '오류', message: '파일을 불러올 수 없습니다.' }); }
  }, [alert, mergeAttachments]);
  const addFromCamera = useCallback(async () => {
    try { mergeAttachments(await pickFromCamera()); }
    catch (e: any) { alert({ title: '오류', message: e?.message || '카메라를 사용할 수 없습니다.' }); }
  }, [alert, mergeAttachments]);
  const removeAttachment = useCallback((name: string) => {
    setAttachments((cur) => cur.filter((a) => a.name !== name));
  }, []);
  const buildAttachmentFiles = useCallback(
    () => attachments.map((a) => ({ path: `attachments/${a.name}`, content: a.base64, base64: true })),
    [attachments],
  );
  const attachmentPromptPrefix = useCallback(
    () => (attachments.length ? `첨부한 파일을 참고해줘:\n${attachments.map((a) => `- attachments/${a.name}`).join('\n')}\n\n` : ''),
    [attachments],
  );

  // ── 채팅: 랜딩 입력 전송 → 채팅 ws 보장 후 새 세션에서 일반 대화 ──
  const startChat = useCallback(async () => {
    const t = draft.trim();
    if ((!t && attachments.length === 0) || busy || running) return;
    setBusy(true);
    try {
      const chatWs = await ensureChatWorkspace();
      await newSession({ id: chatWs.id, name: chatWs.name, kind: 'chat' });
      setDraft('');
      const prompt = `${attachmentPromptPrefix()}${t}`.trim();
      const files = buildAttachmentFiles();
      setAttachments([]);
      await send(prompt, { displayText: t || '(첨부 파일)', files });
      void reloadWorkspaceStore(true);
    } catch (_) {
      alert({ title: '오류', message: '채팅을 시작할 수 없습니다.' });
    } finally { setBusy(false); }
  }, [draft, attachments, busy, running, ensureChatWorkspace, newSession, send, attachmentPromptPrefix, buildAttachmentFiles, reloadWorkspaceStore, alert]);

  // 채팅 히스토리 카드 → 이어가기
  const openChatSession = useCallback(async (sess: SessionMeta) => {
    if (busy || !chatWorkspace) return;
    setBusy(true);
    try { await openSession({ id: chatWorkspace.id, name: chatWorkspace.name, kind: 'chat' }, sess.id); }
    catch (_) { alert({ title: '오류', message: '대화를 열 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, chatWorkspace, openSession, alert]);

  // 채팅 뷰 헤더: 새 채팅 → 랜딩 복귀(새 세션은 다음 입력에서 시작)
  const newChat = useCallback(() => { leaveSession(); }, [leaveSession]);

  // ── 코딩: 워크스페이스 셀렉터에서 기존 코딩 ws 선택 → 새 세션 ──
  const pickWorkspace = useCallback(async (ws: WorkspaceMeta) => {
    setWsSheet(false);
    if (busy || ws.id === activeWorkspace?.id) return;
    setBusy(true);
    try { await newSession({ id: ws.id, name: ws.name, kind: 'project' }); void reloadWorkspaceStore(true); }
    catch (_) { alert({ title: '오류', message: '세션을 만들 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, activeWorkspace?.id, newSession, reloadWorkspaceStore, alert]);

  // + 새 워크스페이스 → 설명 입력 모달(코딩 ws 생성 흐름)
  const createNewWorkspace = useCallback(() => { setWsSheet(false); setNewWsDraft(''); }, []);

  // 설명 → 이름 후보 추천
  const submitDescription = useCallback(async (descRaw: string) => {
    const desc = descRaw.trim();
    if (!desc || busy) return;
    setNewWsDraft(null);
    setBusy(true);
    setNameStep({ description: desc, candidates: null });
    try {
      const names = await workspaceService.suggestWorkspaceNames(desc);
      setNameStep({ description: desc, candidates: names.length ? names : [desc.slice(0, 24)] });
    } catch (_) {
      setNameStep({ description: desc, candidates: [desc.slice(0, 24)] });
    } finally { setBusy(false); }
  }, [busy]);

  // 이름 선택 → 코딩 워크스페이스 생성 + 첫 코딩 턴
  const pickName = useCallback(async (name: string) => {
    const step = nameStep;
    if (!step || busy) return;
    setBusy(true);
    try {
      const { workspace } = await workspaceService.createWorkspace({ name, kind: 'project' });
      await newSession({ id: workspace.id, name: workspace.name, kind: 'project' }, name);
      setNameStep(null);
      void reloadWorkspaceStore(true);
      const prompt = `${attachmentPromptPrefix()}${step.description}`.trim();
      const files = buildAttachmentFiles();
      setAttachments([]);
      await send(prompt, { displayText: step.description, files });
    } catch (_) { alert({ title: '오류', message: '워크스페이스를 만들 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [nameStep, busy, newSession, send, reloadWorkspaceStore, attachmentPromptPrefix, buildAttachmentFiles, alert]);

  // AI 제안 수락 → (기존 ws 열기 | 새 코딩 ws 생성) + 코딩 세션으로 전환 + 첫 작업 전송
  const acceptProposal = useCallback(async () => {
    const p = pendingProposal;
    if (!p || busy) return;
    clearProposal();
    setBusy(true);
    try {
      let ref: { id: string; name: string; kind: 'project' } | null = null;
      if (p.existingWorkspaceId) {
        const ws = workspaces.find((w) => w.id === p.existingWorkspaceId);
        if (ws) ref = { id: ws.id, name: ws.name, kind: 'project' };
      }
      if (!ref) {
        const { workspace } = await workspaceService.createWorkspace({ name: p.name, description: p.description, stack: p.stack, kind: 'project' });
        ref = { id: workspace.id, name: workspace.name, kind: 'project' };
      }
      await newSession(ref, p.name);
      void reloadWorkspaceStore(true);
      await send(p.initialPrompt, { displayText: p.initialPrompt });
    } catch (_) { alert({ title: '오류', message: '워크스페이스를 시작할 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [pendingProposal, busy, workspaces, clearProposal, newSession, send, reloadWorkspaceStore, alert]);

  const openIde = useCallback(() => {
    if (!activeWorkspace) return;
    openIdeOverlay({ ide: { projectId: activeWorkspace.id, projectName: activeWorkspace.name } });
  }, [activeWorkspace, openIdeOverlay]);

  // 활성 채팅/코딩 뷰의 전송
  const sendChat = useCallback(() => {
    const raw = input.trim();
    if ((!raw && attachments.length === 0) || running) return;
    const prompt = `${attachmentPromptPrefix()}${raw}`.trim();
    const files = [...wsFiles, ...buildAttachmentFiles()];
    setInput('');
    setAttachments([]);
    void send(prompt, { displayText: raw || '(첨부 파일)', files });
  }, [input, running, attachments, wsFiles, buildAttachmentFiles, attachmentPromptPrefix, send, setInput]);

  // ── 채팅/코딩 화면 ──
  if (inChat && activeWorkspace) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.base }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <HamburgerButton />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onPress={() => setWsSheet(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' }}>
              <Cloud size={15} color={C.accent} weight="fill" />
              <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{activeWorkspace.name}</Text>
              <CaretDown size={12} color={C.textDim} weight="bold" />
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
              {running ? <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: C.accent }} /> : null}
              <Text style={{ flex: 1, color: running ? C.accent : C.textDim, fontSize: 11.5 }} numberOfLines={1}>{activeSessionTitle || '새 세션'}</Text>
            </View>
          </View>
          {/* 채팅 ws = 새 채팅 버튼 / 코딩 ws = 모바일 IDE 열기 */}
          {isChatWs ? (
            <Pressable onPress={newChat} hitSlop={8} style={{ width: 40, height: 34, borderRadius: 9, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <PencilSimple size={18} color={C.text2} weight="bold" />
            </Pressable>
          ) : (
            <Pressable onPress={openIde} hitSlop={8} style={{ width: 40, height: 34, borderRadius: 9, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Code size={18} color={C.text2} weight="bold" />
            </Pressable>
          )}
        </View>

        <LimitSheet />

        <View style={{ flex: 1, paddingBottom: kbHeight }}>
          {messages.length === 0 ? (
            loadingSession ? (
              <ChatSkeleton contentPadding={16} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                <Text style={{ color: C.text3, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                  {isChatWs ? '무엇이든 물어보세요.\n질문하면 AI가 답해드려요.' : '무엇을 만들어볼까요?\n메시지를 입력하면 에이전트가 작업을 시작해요.'}
                </Text>
              </View>
            )
          ) : (
            <MessageList messages={messages} onOpenFile={isChatWs ? undefined : openIde} contentPadding={16} bottomInset={composerH} />
          )}

          {/* AI 코딩 시작 제안 — 확인 카드(컴포저 바로 위) */}
          {pendingProposal ? (
            <View style={{ position: 'absolute', left: 12, right: 12, bottom: composerH + 8 }}>
              <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.accent, borderRadius: 14, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Code size={16} color={C.accent} weight="bold" />
                  <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>‘{pendingProposal.name}’ 만들기</Text>
                </View>
                {pendingProposal.description ? (
                  <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 18 }} numberOfLines={3}>{pendingProposal.description}</Text>
                ) : null}
                {pendingProposal.stack && pendingProposal.stack.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {pendingProposal.stack.map((stk) => (
                      <View key={stk} style={{ backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: C.text2, fontSize: 11 }}>{stk}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable onPress={clearProposal} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>취소</Text>
                  </Pressable>
                  <Pressable onPress={acceptProposal} disabled={busy} style={{ flex: 2, height: 42, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                    <Text style={{ color: '#06210f', fontSize: 13.5, fontWeight: '700' }}>워크스페이스 만들고 시작</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <View
            onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          >
            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={sendChat}
              running={running}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              onAttach={addAttachments}
              onPickCamera={addFromCamera}
            />
          </View>
        </View>

        <WorkspacePickerSheet visible={wsSheet} workspaces={workspaces} activeId={activeWorkspace.id} onPick={pickWorkspace} onCreateNew={createNewWorkspace} onClose={() => setWsSheet(false)} />
        {renderNameStep()}

        {isFocused ? (
          <PermissionDiffModal pending={pendingPermission} onApprove={() => resolvePermission('allow')} onReject={() => resolvePermission('deny')} />
        ) : null}
      </SafeAreaView>
    );
  }

  // ── 채팅 랜딩 (인사 + 채팅 히스토리 / 입력 하단) ──
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.base }}>
      {/* 헤더: 햄버거 + "채팅" 타이틀 (새 채팅은 아래 입력으로 자동 시작) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 56 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <HamburgerButton />
          <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: C.text }}>채팅</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingBottom: kbHeight }}>
        {isNew ? (
          // 첫 사용자 온보딩 빈 상태
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: C.text, textAlign: 'center' }}>무엇이든 물어보세요</Text>
            <Text style={{ fontSize: 14, color: C.textDim, marginTop: 10, textAlign: 'center', lineHeight: 21 }}>궁금한 걸 묻거나, 만들고 싶은 걸 말해보세요.{'\n'}AI가 답하고, 필요하면 함께 만들어요.</Text>
            <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'myLessons', params: { screen: 'MyLessonsScreen' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 22, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
              <GraduationCap size={16} color={C.accent} />
              <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>코딩이 처음이라면 · 입문 레슨</Text>
            </Pressable>
          </View>
        ) : chatSessions.length === 0 ? (
          // 채팅 기록 없음 — 아래 입력으로 시작 유도
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ color: C.text3, fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>아직 채팅이 없어요.{'\n'}아래에 입력하면 새 채팅이 시작돼요.</Text>
          </View>
        ) : (
          // 채팅 세션 목록(스크롤)
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={chatRefreshing} onRefresh={() => { setChatRefreshing(true); reloadWorkspaceStore(true).finally(() => setChatRefreshing(false)); }} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
          >
            <Text style={{ fontSize: 13, color: C.textDim }}>안녕하세요</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text, marginBottom: 18 }}>{nickname}님</Text>
            <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim, marginBottom: 8 }}>최근 채팅</Text>
            {chatSessions.map((sess) => (
              <Pressable
                key={sess.id}
                onPress={() => openChatSession(sess)}
                android_ripple={{ color: C.elevated2 }}
                style={{ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: 8 }}
              >
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{sess.title || '새 채팅'}</Text>
                <Text style={{ color: C.textDim, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{sess.updatedAt ? relShort(sess.updatedAt) : ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* 하단 입력 — 채팅 시작 */}
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={startChat}
          running={busy}
          placeholder="무엇이든 물어보세요"
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          onAttach={addAttachments}
          onPickCamera={addFromCamera}
        />
      </View>

      {/* 새 워크스페이스 설명 입력 모달 */}
      {newWsDraft !== null && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => !busy && setNewWsDraft(null)} />
          <View style={{ backgroundColor: C.elevated, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>새 워크스페이스 만들기</Text>
            <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 5 }}>무엇을 만들지 한 줄로 설명하면 AI가 이름을 추천하고 작업을 시작해요.</Text>
            <TextInput
              value={newWsDraft}
              onChangeText={setNewWsDraft}
              placeholder="예: 할 일 앱 만들어줘"
              placeholderTextColor={C.textDim}
              autoFocus
              onSubmitEditing={() => submitDescription(newWsDraft)}
              style={{ marginTop: 14, color: C.text, fontSize: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
            />
            <Pressable
              onPress={() => submitDescription(newWsDraft)}
              disabled={busy || !newWsDraft.trim()}
              style={{ marginTop: 12, height: 48, borderRadius: 12, backgroundColor: newWsDraft.trim() ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ color: newWsDraft.trim() ? '#06210f' : C.textDim, fontSize: 15, fontWeight: '700' }}>만들기</Text>
            </Pressable>
          </View>
        </View>
      )}

      {renderNameStep()}
    </SafeAreaView>
  );

  // 이름 후보 선택 시트 (채팅/랜딩 양쪽에서 렌더)
  function renderNameStep() {
    if (!nameStep) return null;
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={() => !busy && setNameStep(null)} />
        <View style={{ backgroundColor: C.elevated, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>워크스페이스 이름 고르기</Text>
          <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 5 }} numberOfLines={2}>“{nameStep.description}”</Text>
          <View style={{ marginTop: 16, gap: 8 }}>
            {nameStep.candidates === null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={{ color: C.text3, fontSize: 13 }}>이름을 추천하는 중…</Text>
              </View>
            ) : (
              nameStep.candidates.map((n) => (
                <Pressable key={n} onPress={() => pickName(n)} disabled={busy} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
                  <Cloud size={17} color={C.accent} weight="fill" />
                  <Text style={{ flex: 1, color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{n}</Text>
                  <CaretRight size={15} color={C.textDim} />
                </Pressable>
              ))
            )}
          </View>
        </View>
      </View>
    );
  }
}


function relShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const min = Math.floor((Date.now() - d) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  return `${Math.floor(day / 7)}주 전`;
}
