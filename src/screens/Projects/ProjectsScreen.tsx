import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Modal, Pressable, RefreshControl, TextInput, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Plus, DotsThreeVertical, FolderDashed,
  PencilSimple, Copy, GitBranch, DownloadSimple, Trash,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { Btn } from '../../components/v2/primitives';
import PressableScale from '../../components/ui/PressableScale';
import workspaceService, { WorkspaceMeta } from '../../services/workspaceService';
import { SessionMeta } from '../../types/agentSession';
import { useAgentSession } from '../../contexts/AgentSessionContext';
import { useWorkspaceStore } from '../../contexts/WorkspaceStoreContext';
import { HamburgerButton } from '../../components/AppTopBar';
import ComputeStatusButton from '../../components/ComputeStatusButton';
import PcWorkspaceSheet from '../../components/PcWorkspaceSheet';
import { useDaemonStatus } from '../../hooks/useDaemonStatus';
import { Desktop } from 'phosphor-react-native';
import { useAppAlert } from '../../hooks/useAppAlert';
import ChatComposer from '../../components/agent/ChatComposer';
import { pickAttachments, pickFromCamera, Attachment } from '../../services/attachmentPicker';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

const C = v2.colors;

// updatedAt(ISO) → 상대 시간 한국어
function relTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  if (day < 14) return '지난주';
  return `${Math.floor(day / 7)}주 전`;
}

function ProjectRow({ p, expanded, sessions, onToggle, onAddSession, onOpenSession, onMenu }: {
  p: WorkspaceMeta;
  expanded: boolean;
  sessions: SessionMeta[] | undefined;   // undefined = 로딩 중
  onToggle: () => void;
  onAddSession: () => void;
  onOpenSession: (s: SessionMeta) => void;
  onMenu: () => void;
}) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 }}>
        <PressableScale onPress={onToggle} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontFamily: v2.font.mono, fontSize: 15, color: C.text, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{p.name}</Text>
            <Text style={{ fontSize: 11, color: C.textDim }}>{relTime(p.updatedAt)}</Text>
          </View>
          {!!p.description && <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 3 }} numberOfLines={1}>{p.description}</Text>}
        </PressableScale>
        {/* 우측 액션: 새 세션(+) · 메뉴(⋯). 확장은 행 클릭으로. */}
        <Pressable onPress={onAddSession} hitSlop={6} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={18} color={C.textDim} weight="bold" />
        </Pressable>
        <Pressable onPress={onMenu} hitSlop={6} style={{ width: 26, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <DotsThreeVertical size={18} color={C.textDim} weight="bold" />
        </Pressable>
      </View>

      {expanded && (
        <View style={{ paddingLeft: 4, paddingBottom: 12, gap: 2 }}>
          {sessions === undefined ? (
            <ActivityIndicator size="small" color={C.accent} style={{ alignSelf: 'flex-start', marginVertical: 6 }} />
          ) : sessions.length === 0 ? (
            <Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 8 }}>아직 세션이 없어요 · +로 새 세션을 시작하세요</Text>
          ) : (
            sessions.map((sess) => (
              <Pressable key={sess.id} onPress={() => onOpenSession(sess)} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: v2.radius.md }}>
                <Text style={{ flex: 1, color: C.text2, fontSize: 13.5, fontFamily: v2.font.sans }} numberOfLines={1}>{sess.title || '새 세션'}</Text>
                <Text style={{ color: C.textDim, fontSize: 11 }}>{relTime(sess.updatedAt)}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function ProjectsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { confirm, alert } = useAppAlert();
  const { openSession, newSession, send } = useAgentSession();
  // 워크스페이스/세션 = 스플래시 프리로드 스토어(목록·세션 재요청 X).
  const { workspaces, sessionsByWs, loading, reload } = useWorkspaceStore();
  const kbHeight = useKeyboardHeight();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetFor, setSheetFor] = useState<WorkspaceMeta | null>(null);
  const [renameFor, setRenameFor] = useState<WorkspaceMeta | null>(null);
  const [renameText, setRenameText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');                 // 하단 컴포저 입력(= 새 워크스페이스 자동 생성)
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // 워크스페이스 행 펼침 — 확장된 워크스페이스 id(세션은 프리로드되어 있음)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 내 PC 에 새 워크스페이스 만들기(결정적 스캐폴드) — PC 온라인일 때만 노출.
  const { localOnline } = useDaemonStatus();
  const [showPcSheet, setShowPcSheet] = useState(false);

  useFocusEffect(useCallback(() => { void reload(true); }, [reload]));

  const goHome = useCallback(() => navigation.navigate('Tabs', { screen: 'home' }), [navigation]);

  // ── 첨부(파일/카메라) — 채팅 컴포저와 동일 ──
  const mergeAttachments = useCallback((picked: Attachment[]) => {
    if (picked.length) setAttachments((cur) => {
      const names = new Set(cur.map((a) => a.name));
      return [...cur, ...picked.filter((p) => !names.has(p.name))];
    });
  }, []);
  const addAttachments = useCallback(async () => {
    try { mergeAttachments(await pickAttachments()); } catch (_) { alert({ title: '오류', message: '파일을 불러올 수 없습니다.' }); }
  }, [alert, mergeAttachments]);
  const addFromCamera = useCallback(async () => {
    try { mergeAttachments(await pickFromCamera()); } catch (e: any) { alert({ title: '오류', message: e?.message || '카메라를 사용할 수 없습니다.' }); }
  }, [alert, mergeAttachments]);
  const removeAttachment = useCallback((name: string) => setAttachments((cur) => cur.filter((a) => a.name !== name)), []);
  const buildAttachmentFiles = useCallback(
    () => attachments.map((a) => ({ path: `attachments/${a.name}`, content: a.base64, base64: true })),
    [attachments],
  );
  const attachmentPromptPrefix = useCallback(
    () => (attachments.length ? `첨부한 파일을 참고해줘:\n${attachments.map((a) => `- attachments/${a.name}`).join('\n')}\n\n` : ''),
    [attachments],
  );

  // ── 하단 입력 전송 → AI 추천 이름으로 새 워크스페이스 자동 생성 + 첫 코딩 턴(채팅 탭 흐름 미러) ──
  const createFromPrompt = useCallback(async () => {
    const t = draft.trim();
    if ((!t && attachments.length === 0) || busy) return;
    setBusy(true);
    try {
      const names = await workspaceService.suggestWorkspaceNames(t).catch(() => [] as string[]);
      const name = (names && names[0]) || (t ? t.slice(0, 24) : '새 워크스페이스');
      const { workspace } = await workspaceService.createWorkspace({ name, kind: 'project' });
      await newSession({ id: workspace.id, name: workspace.name, kind: 'project' }, name);
      setDraft('');
      const prompt = `${attachmentPromptPrefix()}${t}`.trim();
      const files = buildAttachmentFiles();
      setAttachments([]);
      void reload(true);
      await send(prompt, { displayText: t || '(첨부 파일)', files });
      goHome();
    } catch (_) { alert({ title: '오류', message: '워크스페이스를 만들 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [draft, attachments, busy, newSession, send, reload, goHome, alert, attachmentPromptPrefix, buildAttachmentFiles]);

  // 워크스페이스 행 클릭 = 세션 펼치기/접기(별도 토글 버튼 없음)
  const toggleExpand = useCallback((p: WorkspaceMeta) => {
    setExpandedId((cur) => (cur === p.id ? null : p.id));
  }, []);

  // 기존 세션 이어가기 → 메인 채팅
  const openWsSession = useCallback(async (p: WorkspaceMeta, sess: SessionMeta) => {
    try { await openSession({ id: p.id, name: p.name }, sess.id); goHome(); }
    catch (_) { alert({ title: '오류', message: '세션을 열 수 없습니다.' }); }
  }, [openSession, goHome, alert]);

  // 새 세션 시작 → 메인 채팅
  const addSession = useCallback(async (p: WorkspaceMeta) => {
    if (busy) return;
    setBusy(true);
    try { await newSession({ id: p.id, name: p.name }); goHome(); }
    catch (_) { alert({ title: '오류', message: '세션을 만들 수 없습니다.' }); }
    finally { setBusy(false); }
  }, [busy, newSession, goHome, alert]);

  const openRename = useCallback((p: WorkspaceMeta) => {
    setSheetFor(null);
    setRenameText(p.name);
    setRenameFor(p);
  }, []);

  const submitRename = useCallback(async () => {
    const p = renameFor;
    const name = renameText.trim();
    setRenameFor(null);
    if (!p || !name || name === p.name) return;
    try { await workspaceService.updateWorkspace(p.id, { name }); await reload(true); } catch (_) { alert({ title: '오류', message: '이름 변경에 실패했습니다.' }); }
  }, [renameFor, renameText, reload, alert]);

  const doDuplicate = useCallback(async (p: WorkspaceMeta) => {
    setSheetFor(null);
    try { await workspaceService.duplicateWorkspace(p.id); await reload(true); } catch (_) { alert({ title: '오류', message: '복제에 실패했습니다.' }); }
  }, [reload, alert]);

  const doDelete = useCallback(async (p: WorkspaceMeta) => {
    setSheetFor(null);
    const ok = await confirm({ title: '워크스페이스 삭제', message: `'${p.name}' 워크스페이스를 삭제할까요?\n이 작업은 되돌릴 수 없어요.`, confirmText: '삭제', danger: true });
    if (!ok) return;
    try { await workspaceService.deleteWorkspace(p.id); await reload(true); } catch (_) { alert({ title: '오류', message: '삭제에 실패했습니다.' }); }
  }, [reload, confirm, alert]);

  const Header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
      <HamburgerButton />
      <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: C.text }}>워크스페이스</Text>
      <View style={{ flex: 1 }} />
      {localOnline && (
        <Pressable
          onPress={() => setShowPcSheet(true)}
          android_ripple={{ color: C.elevated2 }}
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 }}
        >
          <Desktop size={13} color={C.text2} weight="fill" />
          <Plus size={13} color={C.text2} weight="bold" />
        </Pressable>
      )}
      <ComputeStatusButton />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.base }}>
      <View style={{ flex: 1, paddingBottom: Platform.OS === 'ios' ? kbHeight : 0 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(true).finally(() => setRefreshing(false)); }} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
          >
            {Header}
            {workspaces.length === 0 ? (
              // ── 빈 상태 (생성은 하단 입력으로) ──
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 }}>
                <View style={{ width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: C.borderControl, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <FolderDashed size={26} color={C.text3} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>아직 워크스페이스가 없어요</Text>
                <Text style={{ fontSize: 13.5, color: C.textDim, marginTop: 8, lineHeight: 21, textAlign: 'center' }}>
                  아래에 만들고 싶은 걸 말하면{'\n'}AI가 새 워크스페이스를 만들어요.
                </Text>
              </View>
            ) : (
              workspaces.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  expanded={expandedId === p.id}
                  sessions={sessionsByWs[p.id]}
                  onToggle={() => toggleExpand(p)}
                  onAddSession={() => addSession(p)}
                  onOpenSession={(s) => openWsSession(p, s)}
                  onMenu={() => setSheetFor(p)}
                />
              ))
            )}
          </ScrollView>
        )}

        {/* 하단 입력 — 새 워크스페이스 자동 생성 */}
        <ChatComposer
          value={draft}
          safeBottom={kbHeight === 0}
          onChange={setDraft}
          onSend={createFromPrompt}
          running={busy}
          placeholder="만들고 싶은 걸 말해보세요"
          sendLabel="만들기"
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          onAttach={addAttachments}
          onPickCamera={addFromCamera}
        />
      </View>

      {/* ── ⋯ 메뉴 바텀시트 (백드롭이 바텀네비까지 덮음) ── */}
      <Modal visible={!!sheetFor} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSheetFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={() => setSheetFor(null)} />
        {sheetFor && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.accent, fontSize: 18, fontWeight: '800' }}>{(sheetFor.name || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: v2.font.mono, fontSize: 14, fontWeight: '600', color: C.text }}>{sheetFor.name}</Text>
                <Text style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{relTime(sheetFor.updatedAt)}</Text>
              </View>
            </View>
            <View style={{ paddingTop: 4 }}>
              <SheetItem icon={<PencilSimple size={19} color={C.text2} />} label="이름 변경" onPress={() => openRename(sheetFor)} />
              <SheetItem icon={<Copy size={19} color={C.text2} />} label="복제" onPress={() => doDuplicate(sheetFor)} />
              <SheetItem icon={<GitBranch size={19} color={C.text2} />} label="Git 연결 · 내보내기" onPress={() => { setSheetFor(null); alert({ title: '준비 중', message: 'Git 연결·내보내기는 곧 제공됩니다.' }); }} />
              <SheetItem icon={<DownloadSimple size={19} color={C.text2} />} label="로컬로 받기" onPress={() => { setSheetFor(null); alert({ title: '준비 중', message: '로컬로 받기는 곧 제공됩니다.' }); }} />
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 }}>
                <SheetItem icon={<Trash size={19} color={C.error} />} label="삭제" danger onPress={() => doDelete(sheetFor)} />
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* ── 이름 변경 모달 (크로스플랫폼) ── */}
      <Modal visible={!!renameFor} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setRenameFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }} onPress={() => setRenameFor(null)}>
          <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.lg, padding: 18 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 }}>이름 변경</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              placeholder="워크스페이스 이름"
              placeholderTextColor={C.textDim}
              style={{ height: 42, paddingHorizontal: 12, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.surface, color: C.text, fontSize: 14, fontFamily: v2.font.sans }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Btn variant="ghost" sm onPress={() => setRenameFor(null)}>취소</Btn>
              <Btn variant="primary" sm onPress={submitRename}>저장</Btn>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 내 PC 에 새 워크스페이스(결정적 스캐폴드) */}
      <PcWorkspaceSheet visible={showPcSheet} onClose={() => setShowPcSheet(false)} />
    </SafeAreaView>
  );
}

// 주의: NativeWind 함수형 style 버그 → 일반 style + ripple.
function SheetItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6 }}>
      <View style={{ width: 22, alignItems: 'center', marginRight: 14 }}>{icon}</View>
      <Text style={{ color: danger ? C.error : C.text, fontSize: 14.5, fontFamily: v2.font.sans }}>{label}</Text>
    </Pressable>
  );
}
