import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator, BackHandler, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/native';
import {
  CaretRight, CaretDown, Code, GraduationCap, Cloud, Laptop, PencilSimple,
  Plus, Desktop, GithubLogo, FolderSimple, ChatCircleDots,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useUser } from '../contexts/UserContext';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { useWorkspaceStore, RecentSession } from '../contexts/WorkspaceStoreContext';
import { daemonRootOf, daemonProjectId, projectIdForWorkspace } from '../services/ideSource';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useCloudHandoff } from '../hooks/useCloudHandoff';
import daemonService from '../services/daemonService';
import ComputeStatusButton from '../components/ComputeStatusButton';
import PressableScale from '../components/ui/PressableScale';
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
import RepoPickerSheet from '../components/RepoPickerSheet';
import ClaudeLoginSheet from '../components/ClaudeLoginSheet';
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
  const { alert, confirm } = useAppAlert();
  const { localOnline, hasCloudRunner, activeRunnerKind } = useDaemonStatus();
  const handoff = useCloudHandoff();
  // 로컬 워크스페이스 진입 전 활성 러너를 로컬로 되돌린다(클라우드 활성 상태에서 로컬 폴더 열면 "폴더 없음" 방지).
  const ensureLocalActive = useCallback(async () => {
    if (hasCloudRunner && activeRunnerKind !== 'local') {
      await daemonService.activateRunner({ kind: 'local' }).catch(() => { /* 로컬 러너 없으면 무시 */ });
    }
  }, [hasCloudRunner, activeRunnerKind]);
  const {
    activeWorkspace, activeSessionId, activeSessionTitle, loadingSession, messages, input, setInput, running,
    send, openSession, newSession, leaveSession, pendingPermission, resolvePermission,
    pendingProposal, clearProposal,
  } = useAgentSession();
  const {
    workspaces, recentSessions, ensureChatWorkspace, reload: reloadWorkspaceStore,
  } = useWorkspaceStore();
  // IDE 프로젝트 소스(시드용) — IdeProjectContext 가 활성 코딩 워크스페이스를 프리로드/캐시한다.
  const { openIde: openIdeOverlay, project: ideProject, contents: ideContents, projectId: ideProjectId, ready: ideReady } = useIdeProject();

  const [busy, setBusy] = useState(false);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [draft, setDraft] = useState('');              // 채팅 랜딩 컴포저 입력
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [wsSheet, setWsSheet] = useState(false);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [composerH, setComposerH] = useState(0);
  // 코딩 워크스페이스 수동 생성 — 설명 입력 모달 → 이름 추천 시트
  const [newWsDraft, setNewWsDraft] = useState<string | null>(null); // null=닫힘
  const [nameStep, setNameStep] = useState<null | { description: string; candidates: string[] | null }>(null);

  const inChat = !!(activeWorkspace && activeSessionId);
  const isChatWs = activeWorkspace?.kind === 'chat';

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

  // 채팅 뷰 헤더: 새 채팅 → 랜딩 복귀(새 세션은 다음 입력에서 시작)
  const newChat = useCallback(() => { leaveSession(); }, [leaveSession]);

  // ── 허브(랜딩) 액션 ──
  // 내 PC 연결 → 온보딩/페어링(§2). GitHub에서 열기 → 레포 피커(§1 세 번째 갈래).
  const connectPc = useCallback(() => { navigation.navigate('LocalAgent'); }, [navigation]);
  const openGithub = useCallback(() => { setShowRepoPicker(true); }, []);
  // clone 완료 후 진입 — openWorkspace(local)와 동일하게 데몬 세션(채팅)으로 연다. IDE는 헤더 한 탭.
  const openRepoWorkspace = useCallback(async (localPath: string, name: string) => {
    if (busy) return;
    setBusy(true);
    try { await newSession({ id: daemonProjectId(localPath), name, kind: 'project' }); void reloadWorkspaceStore(true); }
    catch (_) { alert({ title: '오류', message: '워크스페이스를 열 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, newSession, reloadWorkspaceStore, alert]);

  // 워크스페이스 카드 탭 → 진입(현재 화면이 세션 뷰로 전환됨, goHome 불필요).
  //  · 내 PC(local): 온라인이면 데몬 세션 시작, 오프라인이면 연결 유도. · 클라우드: 새 코딩 세션.
  const openWorkspace = useCallback(async (p: WorkspaceMeta) => {
    if (busy) return;
    if (p.compute === 'local') {
      if (!localOnline) {
        // PC 오프라인 → 클라우드에서 이어가기(마지막 저장 시점부터). PC 연결/페어링은 우상단 상태 버튼에서.
        const go = await confirm({ title: '내 PC가 오프라인이에요', message: '마지막 저장 시점부터 클라우드에서 이어서 작업할 수 있어요.', confirmText: '클라우드에서 계속', cancelText: '취소' });
        if (go) {
          try { await handoff.handoffToCloud(p, { skipCheckpoint: true }); }
          catch (e: any) { alert({ title: '핸드오프 실패', message: e?.message || '클라우드로 이어가지 못했어요.' }); }
        }
        return;
      }
      setBusy(true);
      try { await ensureLocalActive(); await newSession({ id: daemonProjectId(p.localPath || ''), name: p.name, kind: 'project', wsId: p.id, runnerKind: 'local' }); }
      catch (_) { alert({ title: '오류', message: '워크스페이스를 열 수 없습니다.' }); }
      finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try { await newSession({ id: p.id, name: p.name, kind: 'project' }); void reloadWorkspaceStore(true); }
    catch (_) { alert({ title: '오류', message: '워크스페이스를 열 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, localOnline, confirm, newSession, reloadWorkspaceStore, alert, handoff, ensureLocalActive]);

  // 최근 세션 카드 탭 → 이어받기(local 은 pc: id 로 열어야 --resume 경로).
  const enterRecent = useCallback(async (r: RecentSession) => {
    if (busy) return;
    setBusy(true);
    try {
      if (r.ws.compute === 'local') await ensureLocalActive(); // 로컬 이어받기는 활성 러너를 로컬로
      await openSession({ id: projectIdForWorkspace(r.ws), name: r.ws.name, kind: r.ws.kind, wsId: r.ws.id, runnerKind: r.ws.compute === 'local' ? 'local' : undefined }, r.sess.id);
    }
    catch (_) { alert({ title: '오류', message: '세션을 열 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, openSession, alert, ensureLocalActive]);

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
              {daemonRootOf(activeWorkspace.id) !== null
                ? <Laptop size={15} color={C.accent} weight="fill" />
                : <Cloud size={15} color={C.accent} weight="fill" />}
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

        <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? kbHeight : 0 }}>
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
              safeBottom={kbHeight === 0}
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
      {/* 헤더: 햄버거 + "홈" 타이틀 + 러너 상태(PC/클라우드) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 56 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <HamburgerButton />
          <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: C.text }}>홈</Text>
        </View>
        <View style={{ flex: 1 }} />
        <ComputeStatusButton />
      </View>

      <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? kbHeight : 0 }}>
        {/* ── 허브: 인사 + 만들기/연결 액션 + 워크스페이스 + 최근 세션 ── */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={chatRefreshing} onRefresh={() => { setChatRefreshing(true); reloadWorkspaceStore(true).finally(() => setChatRefreshing(false)); }} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
        >
          {/* 인사 */}
          <Text style={{ fontSize: 13, color: C.textDim }}>안녕하세요</Text>
          <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text, marginBottom: 16 }}>{nickname}님</Text>

          {/* 만들기/연결 — "어디서 작업할지" 세 갈래(와이어플로우 §1). 항상 노출(막다른 길 없음). */}
          <HubAction
            icon={<Plus size={20} color={C.accent} weight="bold" />}
            title="새로 만들기"
            subtitle="클라우드에 AI로 워크스페이스 생성"
            onPress={createNewWorkspace}
          />
          <HubAction
            icon={<Desktop size={20} color={C.accent} weight="fill" />}
            title="내 PC 연결"
            subtitle={localOnline ? 'PC 폴더로 바이브코딩 · 대화 이어받기' : 'PC 데몬을 연결하고 환경을 점검하세요'}
            onPress={connectPc}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
                <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: localOnline ? C.accent : C.textDim }} />
                <Text style={{ fontSize: 11, color: localOnline ? C.text2 : C.textDim, fontWeight: '600' }}>{localOnline ? '온라인' : '연결'}</Text>
              </View>
            }
          />
          <HubAction
            icon={<GithubLogo size={20} color={C.text2} weight="fill" />}
            title="GitHub에서 열기"
            subtitle="내 레포를 PC로 가져오기"
            onPress={openGithub}
          />

          {/* 워크스페이스 목록 */}
          {workspaces.length > 0 && (
            <>
              <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim, marginTop: 22, marginBottom: 6 }}>워크스페이스</Text>
              {workspaces.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => openWorkspace(p)}
                  android_ripple={{ color: C.elevated2 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderRadius: v2.radius.md }}
                >
                  <FolderSimple size={17} color={C.textDim} weight="fill" />
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1, fontFamily: v2.font.mono }} numberOfLines={1}>{p.name}</Text>
                    {p.compute === 'local' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
                        <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: localOnline ? C.accent : C.textDim }} />
                        <Text style={{ fontSize: 9.5, color: C.text2, fontWeight: '700' }}>내 PC</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
                        <Cloud size={9} color={C.textDim} weight="fill" />
                        <Text style={{ fontSize: 9.5, color: C.textDim, fontWeight: '700' }}>클라우드</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: C.textDim, fontSize: 11 }}>{relShort(p.updatedAt)}</Text>
                </Pressable>
              ))}
            </>
          )}

          {/* 최근 세션(채팅+코딩+내 PC 통합, 이어받기) */}
          {recentSessions.length > 0 && (
            <>
              <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim, marginTop: 20, marginBottom: 6 }}>최근 세션</Text>
              {recentSessions.slice(0, 8).map((r) => (
                <Pressable
                  key={`${r.ws.id}:${r.sess.id}`}
                  onPress={() => enterRecent(r)}
                  android_ripple={{ color: C.elevated2 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: v2.radius.md }}
                >
                  {r.ws.kind === 'chat'
                    ? <ChatCircleDots size={16} color={C.textDim} />
                    : (r.ws.compute === 'local' ? <Laptop size={16} color={C.textDim} weight="fill" /> : <FolderSimple size={16} color={C.textDim} />)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text2, fontSize: 13.5 }} numberOfLines={1}>{r.sess.title || (r.ws.kind === 'chat' ? '새 채팅' : '새 세션')}</Text>
                    <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{r.ws.name}{r.sess.updatedAt ? ` · ${relShort(r.sess.updatedAt)}` : ''}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* 완전 빈 상태 — 막다른 길 없이 위 액션으로 유도 */}
          {workspaces.length === 0 && recentSessions.length === 0 && (
            <Text style={{ color: C.textDim, fontSize: 13, lineHeight: 20, marginTop: 18, paddingHorizontal: 4 }}>
              아직 워크스페이스가 없어요.{'\n'}위에서 새로 만들거나 내 PC를 연결해 시작하세요.
            </Text>
          )}
        </ScrollView>

        {/* 하단 입력 — 채팅 시작 */}
        <ChatComposer
          value={draft}
          safeBottom={kbHeight === 0}
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
      <RepoPickerSheet visible={showRepoPicker} onClose={() => setShowRepoPicker(false)} onOpen={openRepoWorkspace} />

      {/* 클라우드 핸드오프 진행 오버레이(M5 Slice4) — "환경 깨우는 중…" */}
      {handoff.phase ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 999 }}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{handoff.message || '처리 중…'}</Text>
          <Text style={{ color: C.textDim, fontSize: 12.5 }}>클라우드로 이어가는 중이에요</Text>
        </View>
      ) : null}

      {/* 핸드오프 직후 클라우드 러너가 미로그인이면 BYO 로그인 유도(runnerId 지정) */}
      <ClaudeLoginSheet
        visible={!!handoff.pendingCloudLogin}
        onClose={handoff.clearCloudLogin}
        runnerId={handoff.pendingCloudLogin?.runnerId}
        targetKind="cloud"
        targetLabel="클라우드"
      />
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


// 허브 만들기/연결 액션 카드(아이콘 + 제목/부제 + 우측 배지/상태 + 셰브론). PressableScale 로 눌림 모션.
function HubAction({ icon, title, subtitle, onPress, right }: {
  icon: React.ReactNode; title: string; subtitle: string; onPress: () => void; right?: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: 10 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: C.textDim, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
      </View>
      {right}
      <CaretRight size={16} color={C.textDim} />
    </PressableScale>
  );
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
