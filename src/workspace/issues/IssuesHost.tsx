// IssuesHost — `Tasks`(이슈) 장소. 셸(RootNavigator ShellLayout)에 1회 마운트, issuesUi.openIssues() 로 연다(사이드바 Tasks 행).
//
// PC 의 Tasks 화면(codingpt_pc/src/js/issues-view.js)과 같은 것을 폰 손에 맞게 옮겼다:
//  · 자체 이슈 + 외부 서비스 이슈(GitHub…)를 **한 목록**에서 보고 출처·워크스페이스로 거른다.
//  · 보기 3종 — 목록(상태별 묶음) · 보드(상태 열, 카드를 길게 누르면 상태를 옮긴다) · 표(머리를 눌러 정렬).
//  · 이슈를 누르면 상세(제목·속성·본문·첨부·이 이슈로 시작). 본문은 마크다운 그대로 쓰고 도구 줄이 기호를 넣어 준다.
// 진행 현황·자동화의 형제 층이다(모달 아님) — 메인 칼럼에서 워크스페이스 위를 덮는다. 보는 범위는 고른 PC 하나.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, Linking, Keyboard, Platform, KeyboardAvoidingView, AppState } from 'react-native';
import ReAnimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SidebarSimple, ArrowsClockwise, Plus, CaretLeft, CaretDown, MagnifyingGlass, ListBullets, Kanban, Table, Check, X,
  TextHOne, TextHTwo, TextHThree, TextB, TextItalic, TextStrikethrough, Code, ListNumbers, ListChecks, Quotes, CodeBlock, Minus, LinkSimple, ImageSquare,
  ArrowSquareOut, File as FileIcon, Trash, Eye, PencilSimple, ArrowUp, ArrowDown,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { PressableRow, IconButton, Button, Sheet, Seg, EmptyState, PressableScale } from '../../components/ui';
import { showAppAlert } from '../../components/AppAlert';
import { useDrawer } from '../../contexts/DrawerContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';
import AgentGlyph from '../orch/AgentGlyph';
import AgentLogo from '../AgentLogo';
import ChatMarkdown from '../chat/ChatMarkdown';
import { agentDisplayName } from '../chat/composer';
import { pickFromGallery, pickAnyFiles, type Attachment } from '../../services/attachmentPicker';
import { uploadAttachmentNamed } from '../../services/attachmentUpload';
import {
  createIssue, updateIssue, deleteIssue, startIssue, attachIssue, detachIssue,
  type Issue, type IssueStatus, type IssuePriority, type IssueMode, type IssueAttachment,
} from '../../services/issueService';
import { openTasksDashboard, openTaskTerminal } from '../tasks/tasksUi';
import { useIssuesOpen, closeIssues, setIssuesBackHandler } from './issuesUi';
import { useIssueBucket, refreshIssues, patchIssue } from './useIssues';
import { STATUSES, filterIssues, groupByStatus, sortIssues, sortTable, sourceOptions, toggleLinePrefix, toggleWrap, insertBlock } from './issuesModel';
import { createAutosaver, normFields, displayTitle, workspaceOptions, SAVE_DELAY_EXT_MS, type Autosaver, type SaveFields, type SaveKey, type SaveStatus } from './issuesAutosave';
import { saverRpc, finalizeSave, resumeDraft, writeDraft, lingering, dropLingering } from './issueSave';

const t = i18n.t;
const ST_TEXT: Record<string, string> = { todo: '할 일', in_progress: '진행 중', in_review: '리뷰 중', done: '완료' };
const PRI_TEXT: Record<string, string> = { none: '없음', low: '낮음', medium: '보통', high: '높음', urgent: '긴급' };
const SRC_TEXT: Record<string, string> = { all: '전체 출처', codingpt: 'CodingPT', github: 'GitHub', gitlab: 'GitLab', linear: 'Linear', jira: 'Jira', notion: 'Notion' };
const MODE_TEXT: Record<string, string> = { task: '새 작업(전용 브랜치)', terminal: '새 터미널(이 폴더)', orch: '오케스트레이션' };
const ERR_TEXT: Record<string, string> = { GH_AUTH: 'GitHub 로그인이 필요해요(gh auth login)', GH_MISSING: 'gh 가 설치되어 있지 않아요', ISSUES_DISABLED: '이 저장소는 이슈를 쓰지 않아요',
  NOT_GITHUB: 'GitHub 저장소가 아니에요', DAEMON_OFFLINE: 'PC 가 연결되어 있지 않아요', START_FAILED: '시작하지 못했어요', TOO_LARGE: '파일이 너무 커요' };
const errText = (code: unknown) => t(ERR_TEXT[String(code || '')] || '문제가 생겼어요. 다시 시도해 주세요');
const PRIS: IssuePriority[] = ['none', 'low', 'medium', 'high', 'urgent'];
const MODES: IssueMode[] = ['task', 'terminal', 'orch'];
const AGENTS = ['claude', 'codex', 'gemini'];
const IMG_RE = /\.(png|jpe?g|gif|webp|heic|svg)$/i;
type ViewKind = 'list' | 'board' | 'table';
type Pick = { title: string; value: string; options: { v: string; label: string }[]; onPick: (v: string) => void } | null;
/** 목록에 보일 제목 — 제목 없는 초안은 본문 첫 줄(없으면 "제목 없음"). */
const titleOf = (x: Issue) => displayTitle(x, t('제목 없음'));
const newAttId = () => Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export default function IssuesHost() {
  const C = v2.colors;
  const open = useIssuesOpen();
  const insets = useSafeAreaInsets();
  const S = useWorkspaceShell();
  const SRef = useRef(S); SRef.current = S;
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const host = Number(S.resolvedDeviceId()) || 0;
  const bucket = useIssueBucket(host || null);
  const wss = useMemo(() => (host ? S.workspacesForDevice(String(host)) : []).filter((w: any) => w.localPath), [S, host]);
  //  고르는 목록 = 그 PC 의 프로젝트 폴더마다 한 줄. VM 자리 폴더(~/.codingpt/vm/<os>/ws/…)·작업 폴더는 뺀다 —
  //  레코드를 그대로 늘어놓으면 같은 이름("codingpt")이 OS 수만큼 더 나온다(issuesAutosave.ts workspaceOptions 머리말).
  //  keep = 그 이슈에 이미 적힌 폴더(목록에 없어도 남긴다).
  const wsOpts = useCallback((keep: string) => workspaceOptions(wss.map((w: any) => ({ cwd: String(w.localPath), name: S.wsDisplayName(w) })), keep), [wss, S]);
  const wsName = useCallback((cwd: string) => (cwd ? wsOpts(cwd).find((x) => x.cwd === cwd)?.label || cwd.split('/').pop() || '' : ''), [wsOpts]);

  const [view, setView] = useState<ViewKind>('list');
  const [source, setSource] = useState('all');
  const [cwd, setCwd] = useState('');
  const [done, setDone] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: 'updatedAt', dir: -1 });
  const [pick, setPick] = useState<Pick>(null);
  const [sel, setSel] = useState<{ id: string | null } | null>(null);   // 상세 — id null = 새 이슈
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((c) => (c === m ? null : c)), 2400); }, []);

  useEffect(() => {
    if (!open || !host) return undefined;
    void refreshIssues(host);
    void resumeDraft(host, t('제목 없음'));   // 이슈가 못 된 초안(만들기가 실패한 채 앱이 꺼진 것)을 이어서 만든다
    const timer = setInterval(() => { void refreshIssues(host); }, 60000);
    return () => clearInterval(timer);
  }, [open, host]);

  // 하드웨어 뒤로 — 고르는 시트 → 상세 → 목록 → 워크스페이스 순으로 한 겹씩.
  useEffect(() => {
    if (!open) return undefined;
    setIssuesBackHandler(() => { if (pick) { setPick(null); return true; } if (sel) { setSel(null); return true; } closeIssues(); return true; });
    return () => setIssuesBackHandler(null);
  }, [open, pick, sel]);

  const all = bucket?.issues || [];
  const shown = useMemo(() => filterIssues(all, { source, cwd, q, done }), [all, source, cwd, q, done]);
  const sources = useMemo(() => sourceOptions(all, bucket?.sources || []), [all, bucket]);
  const ghCwds = useMemo(() => new Set((bucket?.sources || []).filter((x) => x.provider === 'github' && x.ok && x.cwd).map((x) => String(x.cwd))), [bucket]);

  const setStatus = useCallback(async (x: Issue, status: IssueStatus) => {
    if (x.status === status) return;
    patchIssue(host, { ...x, status });
    try { const r = await updateIssue(host, x.id, { status }); if (r?.issue) patchIssue(host, r.issue); } catch (e: any) { patchIssue(host, x); say(errText(e?.code)); }
  }, [host, say]);
  const onCardLong = useCallback((x: Issue) => {
    haptic.select();
    setPick({ title: t('상태'), value: x.status, options: STATUSES.map((v) => ({ v, label: t(ST_TEXT[v]) })), onPick: (v) => { void setStatus(x, v as IssueStatus); } });
  }, [setStatus]);

  if (!open) return null;
  const selIssue = sel && sel.id ? all.find((x) => x.id === sel.id) || null : null;
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      {!isWide || !dockedOpen ? (
        <IconButton onPress={isWide ? toggleDocked : openDrawer} accessibilityLabel="Tasks" size={38}><SidebarSimple size={20} color={C.text2} /></IconButton>
      ) : <View style={{ width: 6 }} />}
      <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>Tasks</Text>
      <IconButton onPress={() => { void refreshIssues(host, true); }} accessibilityLabel={t('새로고침')} size={38}><ArrowsClockwise size={19} color={C.text2} /></IconButton>
      <IconButton onPress={() => setSel({ id: null })} accessibilityLabel={t('새 이슈')} size={38}><Plus size={20} color={C.text2} /></IconButton>
    </View>
  );
  const chip = (label: string, onPress: () => void, on = false) => (
    <PressableScale onPress={onPress} scaleTo={0.97} accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: on ? C.selected : 'transparent' }}>
      <Text numberOfLines={1} style={{ maxWidth: 150, color: on ? C.text : C.text2, fontSize: v2.font.size.small }}>{label}</Text>
      {on ? null : <CaretDown size={11} color={C.textDim} />}
    </PressableScale>
  );
  const bar = (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' }}>
        <Seg<ViewKind> value={view} onChange={setView} options={[
          { v: 'list', label: t('목록'), icon: (c) => <ListBullets size={15} color={c} /> },
          { v: 'board', label: t('보드'), icon: (c) => <Kanban size={15} color={c} /> },
          { v: 'table', label: t('표'), icon: (c) => <Table size={15} color={c} /> }]} />
        {chip(t(SRC_TEXT[source] || source), () => setPick({ title: t('출처'), value: source, options: sources.map((v) => ({ v, label: t(SRC_TEXT[v] || v) })), onPick: setSource }))}
        {chip(cwd ? wsName(cwd) : t('전체 워크스페이스'), () => setPick({ title: t('워크스페이스'), value: cwd,
          options: [{ v: '', label: t('전체 워크스페이스') }, ...wsOpts(cwd).map((w) => ({ v: w.cwd, label: w.label }))], onPick: setCwd }))}
        <PressableScale onPress={() => setDone((v) => !v)} scaleTo={0.97} accessibilityRole="switch" accessibilityState={{ checked: done }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: done ? C.selected : 'transparent' }}>
          {done ? <Check size={12} color={C.text} weight="bold" /> : null}
          <Text style={{ color: done ? C.text : C.text2, fontSize: v2.font.size.small }}>{t('완료 포함')}</Text>
        </PressableScale>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 10, marginBottom: 8, paddingHorizontal: 10, height: 36, borderRadius: v2.radius.sm, backgroundColor: C.elevated2 }}>
        <MagnifyingGlass size={15} color={C.textDim} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('검색')} placeholderTextColor={C.textDim} autoCapitalize="none" autoCorrect={false}
          style={{ flex: 1, padding: 0, color: C.text, fontSize: v2.font.size.body }} />
        {q ? <IconButton onPress={() => setQ('')} accessibilityLabel={t('지우기')} size={28}><X size={13} color={C.textDim} /></IconButton> : null}
      </View>
    </View>
  );
  const rc = <RefreshControl refreshing={!!bucket?.loading && !!bucket?.at} onRefresh={() => { void refreshIssues(host, true); }} tintColor={C.textDim} />;
  const empty = !bucket || (!bucket.at && bucket.loading)
    ? <EmptyState centered title={t('불러오는 중…')} />
    //  구 PC 앱(이슈를 모르는 데몬)은 목록 조회를 BAD_PARAMS 로 거절한다 — 고장이 아니라 업데이트가 필요한 것이라고 말한다.
    : bucket.error === 'BAD_PARAMS' && !all.length ? <EmptyState centered title={t('PC 앱을 업데이트해 주세요')} />
    : bucket.error && !all.length ? <EmptyState centered title={errText(bucket.error)} action={{ label: t('새로고침'), onPress: () => { void refreshIssues(host, true); } }} />
      : <EmptyState centered title={t('이슈가 없어요')} sub={t('할 일을 적어 두고, 준비되면 에이전트에게 시작시키세요.')} action={{ label: t('새 이슈'), onPress: () => setSel({ id: null }) }} />;

  let body: React.ReactNode;
  if (!shown.length) body = <ScrollView refreshControl={rc} contentContainerStyle={{ flexGrow: 1 }}>{empty}</ScrollView>;
  else if (view === 'list') {
    body = (
      <ScrollView refreshControl={rc} contentContainerStyle={{ paddingBottom: 24 }}>
        {groupByStatus(shown).map((g) => (
          <View key={g.status}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>
              <StatusMark status={g.status} />
              <Text style={{ color: C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{t(ST_TEXT[g.status])}</Text>
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{g.items.length}</Text>
            </View>
            {g.items.map((x) => <IssueRow key={x.id} x={x} ws={wsName(x.cwd)} onPress={() => setSel({ id: x.id })} onLongPress={() => onCardLong(x)} />)}
          </View>
        ))}
      </ScrollView>
    );
  } else if (view === 'board') {
    body = (
      <ScrollView horizontal refreshControl={rc} contentContainerStyle={{ padding: 10, gap: 10 }}>
        {groupByStatus(shown, { order: STATUSES.filter((s) => done || s !== 'done'), keepEmpty: true }).map((g) => (
          <View key={g.status} style={{ width: 264, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <StatusMark status={g.status} />
              <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{t(ST_TEXT[g.status])}</Text>
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{g.items.length}</Text>
            </View>
            <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 8, gap: 8 }}>
              {g.items.map((x) => (
                <PressableScale key={x.id} scaleTo={0.98} onPress={() => setSel({ id: x.id })} onLongPress={() => onCardLong(x)} delayLongPress={280}
                  style={{ padding: 10, gap: 6, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{x.key}</Text>
                    {x.link ? <AgentLogo brand={x.link.agent || 'claude'} size={12} /> : null}
                    <View style={{ flex: 1 }} />
                    <PriChip p={x.priority} /><SrcChip x={x} />
                  </View>
                  <Text numberOfLines={3} style={{ color: x.title ? C.text : C.text3, fontSize: v2.font.size.small, lineHeight: 18 }}>{titleOf(x)}</Text>
                  {x.cwd ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{wsName(x.cwd)}</Text> : null}
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    );
  } else {
    const cols: { k: string; label: string; w: number }[] = [
      { k: 'key', label: '#', w: 64 }, { k: 'title', label: t('제목'), w: 240 }, { k: 'status', label: t('상태'), w: 92 }, { k: 'priority', label: t('우선순위'), w: 84 },
      { k: 'source', label: t('출처'), w: 92 }, { k: 'cwd', label: t('워크스페이스'), w: 130 }, { k: 'updatedAt', label: t('수정'), w: 96 }];
    const rows = sortTable(shown, sort.key, sort.dir);
    body = (
      <ScrollView refreshControl={rc}>
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
              {cols.map((c) => (
                <PressableRow key={c.k} onPress={() => setSort((s) => ({ key: c.k, dir: s.key === c.k ? -s.dir : 1 }))}
                  style={{ width: c.w, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10 }}>
                  <Text numberOfLines={1} style={{ color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{c.label}</Text>
                  {sort.key === c.k ? (sort.dir === 1 ? <ArrowUp size={10} color={C.text3} /> : <ArrowDown size={10} color={C.text3} />) : null}
                </PressableRow>
              ))}
            </View>
            {rows.map((x) => (
              <PressableRow key={x.id} onPress={() => setSel({ id: x.id })} onLongPress={() => onCardLong(x)} style={{ flexDirection: 'row', minHeight: 40, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Cell w={cols[0].w} mono dim>{x.key}</Cell>
                <Cell w={cols[1].w} dim={!x.title}>{titleOf(x)}</Cell>
                <View style={{ width: cols[2].w, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }}><StatusMark status={x.status} /><Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.caption }}>{t(ST_TEXT[x.status])}</Text></View>
                <View style={{ width: cols[3].w, paddingHorizontal: 10 }}><PriChip p={x.priority} /></View>
                <Cell w={cols[4].w} dim>{SRC_TEXT[x.source.provider] && x.source.provider !== 'all' ? SRC_TEXT[x.source.provider] : x.source.provider}</Cell>
                <Cell w={cols[5].w} dim>{wsName(x.cwd)}</Cell>
                <Cell w={cols[6].w} dim>{x.updatedAt ? new Date(x.updatedAt).toLocaleDateString() : ''}</Cell>
              </PressableRow>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    );
  }

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      paddingTop: insets.top, paddingBottom: insets.bottom, paddingRight: insets.right, paddingLeft: isWide && dockedOpen ? 0 : insets.left, backgroundColor: C.surface }}>
      {header}
      {bar}
      <View style={{ flex: 1, backgroundColor: C.base }}>{body}</View>
      {sel ? (
        <IssueDetail key={sel.id || 'new'} host={host} issue={selIssue} issues={all} wsOpts={wsOpts} defaultCwd={cwd || wsOpts('')[0]?.cwd || ''}
          ghCwds={ghCwds} onClose={() => setSel(null)} onPick={setPick} say={say}
          onStarted={(st) => {
            setSel(null);
            if (st.taskId) { openTasksDashboard({ taskId: st.taskId, host }); return; }
            const w = (wss as any[]).find((y) => y.localPath === st.cwd);
            if (w && st.tid != null) { closeIssues(); void openTaskTerminal(() => SRef.current, w.id, st.tid, false); }
          }} />
      ) : null}
      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick?.title} paddingHorizontal={8}>
        <ScrollView style={{ maxHeight: 420 }}>
          {(pick?.options || []).map((o) => (
            <PressableRow key={o.v || '_'} onPress={() => { const p = pick; setPick(null); p?.onPick(o.v); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.body }}>{o.label}</Text>
              {pick?.value === o.v ? <Check size={16} color={C.text2} weight="bold" /> : null}
            </PressableRow>
          ))}
        </ScrollView>
      </Sheet>
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 28 + insets.bottom, alignItems: 'center' }}>
          <ReAnimated.View entering={FadeInDown.duration(150)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: v2.radius.lg, backgroundColor: C.elevated2, elevation: 8 }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{toast}</Text>
          </ReAnimated.View>
        </View>
      ) : null}
    </View>
  );
}

function StatusMark({ status }: { status: string }) {
  const C = v2.colors;
  if (status === 'done') return <AgentGlyph glyph="done" />;
  if (status === 'in_progress') return <AgentGlyph glyph="working" />;
  //  할 일 = 빈 고리, 리뷰 중 = 반쯤 찬 고리(무채색 — 색은 진행·완료 신호에만).
  return <View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: C.text3, backgroundColor: status === 'in_review' ? C.text3 : 'transparent', opacity: status === 'in_review' ? 0.7 : 1 }} />;
}
function PriChip({ p }: { p: string }) {
  const C = v2.colors;
  if (!p || p === 'none') return null;
  const hot = p === 'urgent';
  return (
    <View style={{ paddingHorizontal: 5, minHeight: 17, justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: hot ? C.error : C.borderControl }}>
      <Text style={{ color: hot ? C.error : C.text3, fontSize: 10.5 }}>{t(PRI_TEXT[p] || p)}</Text>
    </View>
  );
}
function SrcChip({ x }: { x: Issue }) {
  const C = v2.colors;
  if (x.source.provider === 'codingpt') return null;
  return (
    <View style={{ paddingHorizontal: 5, minHeight: 17, justifyContent: 'center', borderRadius: 4, backgroundColor: C.elevated2 }}>
      <Text style={{ color: C.text3, fontSize: 10.5 }}>{SRC_TEXT[x.source.provider] || x.source.provider}</Text>
    </View>
  );
}
function Cell({ w, children, mono, dim }: { w: number; children: React.ReactNode; mono?: boolean; dim?: boolean }) {
  const C = v2.colors;
  return <Text numberOfLines={1} style={{ width: w, paddingHorizontal: 10, color: dim ? C.text3 : C.text, fontSize: v2.font.size.caption, fontFamily: mono ? v2.font.mono : v2.font.sans }}>{children}</Text>;
}
function IssueRow({ x, ws, onPress, onLongPress }: { x: Issue; ws: string; onPress: () => void; onLongPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableRow onPress={onPress} onLongPress={onLongPress} delayLongPress={280} style={{ paddingHorizontal: 14, paddingVertical: 9, gap: 4, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusMark status={x.status} />
        <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{x.key}</Text>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: x.title ? C.text : C.text3, fontSize: v2.font.size.body }}>{titleOf(x)}</Text>
        {x.link ? <AgentLogo brand={x.link.agent || 'claude'} size={13} /> : null}
      </View>
      {(x.priority && x.priority !== 'none') || x.labels.length || x.source.provider !== 'codingpt' || ws ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 21 }}>
          <PriChip p={x.priority} />
          {x.labels.slice(0, 3).map((l) => <Text key={l} numberOfLines={1} style={{ maxWidth: 90, color: C.text3, fontSize: 10.5 }}>{l}</Text>)}
          <SrcChip x={x} />
          <View style={{ flex: 1 }} />
          {ws ? <Text numberOfLines={1} style={{ maxWidth: 140, color: C.textDim, fontSize: v2.font.size.caption }}>{ws}</Text> : null}
        </View>
      ) : null}
    </PressableRow>
  );
}

// ── 상세(새로 만들기 겸용) ─────────────────────────────────────────────────────────
//  자동 저장이다(2026-10-08 사용자 요청) — 만들기·저장 버튼이 없다. 규칙은 issuesAutosave.ts(순수, PC 와 같은 것)가 쥔다:
//   새 이슈는 제목·본문에 뜻 있는 첫 입력이 들어올 때 진짜 이슈가 되고, 그 뒤로는 바뀐 칸만 조용히 저장된다.
//   뒤로 가는 것은 "그만 본다" 일 뿐이다 — 적은 것은 남는다. 지우려면 휴지통을 누른다.
const SAVE_TEXT: Record<SaveStatus, string> = { idle: '', dirty: '저장 중…', saving: '저장 중…', saved: '저장됨', error: '저장하지 못했어요 · 다시 시도 중' };
type WsOpt = { cwd: string; label: string };
function IssueDetail({ host, issue, issues, wsOpts, defaultCwd, ghCwds, onClose, onPick, say, onStarted }: {
  host: number; issue: Issue | null; issues: Issue[]; wsOpts: (keep: string) => WsOpt[]; defaultCwd: string; ghCwds: Set<string>;
  onClose: () => void; onPick: (p: Pick) => void; say: (m: string) => void; onStarted: (st: { taskId: string | null; tid: number | null; cwd: string }) => void;
}) {
  const C = v2.colors;
  const insets = useSafeAreaInsets();
  const ext = !!issue && issue.source.provider !== 'codingpt';
  //  처음 한 번 — 닫힌 뒤에도 저장이 덜 끝난 글이 있으면 이어받는다(같은 이슈를 둘이 저장하지 않게 옛 것은 거둔다).
  //  단, 새 초안을 **만드는 중**이면 그대로 둔다(거두고 이어받으면 같은 글의 이슈가 둘 생긴다 — 그 초안은 곧 목록에 나온다).
  const boot = useRef<{ base: SaveFields; init: SaveFields; carried: boolean } | null>(null);
  if (!boot.current) {
    const key = issue ? issue.id : 'new';
    let held = lingering.get(key) || null;
    if (!issue && held && held.saver.status() === 'saving') held = null;
    if (held) { held.saver.dispose(); lingering.delete(key); }
    const base = normFields(issue || { cwd: defaultCwd });
    const carry = held && held.host === host ? held.saver.fields() : null;
    boot.current = { base, init: carry ? normFields({ ...base, ...carry }) : base, carried: !!carry };
  }
  const init = boot.current.init;
  const [title, setTitle] = useState(init.title);
  const [body, setBody] = useState(init.body);
  const [status, setStatus] = useState<IssueStatus>(init.status as IssueStatus);
  const [priority, setPriority] = useState<IssuePriority>(init.priority as IssuePriority);
  const [cwd, setCwd] = useState(init.cwd);
  const [labels, setLabels] = useState(init.labels);
  const [curId, setCurId] = useState<string | null>(issue ? issue.id : null);
  const [saveState, setSaveState] = useState<SaveStatus>(issue ? 'saved' : 'idle');
  const [atts, setAtts] = useState<IssueAttachment[]>(issue ? issue.attachments || [] : []);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState<IssueMode>('task');
  const [agent, setAgent] = useState('claude');
  const selRef = useRef({ start: body.length, end: body.length });
  const [selProp, setSelProp] = useState<{ start: number; end: number } | undefined>(undefined);
  const bodyRef = useRef(body); bodyRef.current = body;
  const attsRef = useRef(atts); attsRef.current = atts;
  const attRev = useRef(issue ? issue.updatedAt || 0 : 0);   // 내가 아는 첨부 목록의 때 — 이보다 오래된 사본(늦게 온 목록)은 받지 않는다
  const seenImgs = useRef<Set<string>>(new Set((init.body.match(/\(att:([0-9a-z]+)\)/g) || []).map((m) => m.slice(5, -1))));
  const createdHere = useRef(false);
  const closed = useRef(false);
  const deleted = useRef(false);
  const flushSoon = useRef(false);            // 고르는 칸(상태·우선순위·워크스페이스)은 기다리지 않고 곧바로 저장
  const focus = useRef<Set<SaveKey>>(new Set());
  const live = useMemo(() => (curId ? issues.find((x) => x.id === curId) || null : null), [issues, curId]) || issue;

  const saverRef = useRef<Autosaver | null>(null);
  if (!saverRef.current) {
    const rpc = saverRpc(host, ext, t('제목 없음'), (x) => { if (!closed.current && x.id) setCurId(x.id); });
    const s: Autosaver = createAutosaver({
      id: issue ? issue.id : null, fields: boot.current.base, rev: issue ? issue.updatedAt : 0,
      keys: ext ? ['title', 'body', 'status', 'priority'] : undefined, delay: ext ? SAVE_DELAY_EXT_MS : undefined,
      create: rpc.create, update: rpc.update,
      onCreated: () => { createdHere.current = true; writeDraft(host, null); },
      onStatus: (st) => { if (closed.current) { if (st === 'saved') { s.dispose(); dropLingering(s); } return; } setSaveState(st); },
    });
    saverRef.current = s;
  }
  const saver = saverRef.current;

  // 칸이 바뀌면 자동 저장에 알린다(잠깐 멈추면 저장). 응답은 칸에 되쓰지 않는다 — 한글 조합이 깨질 일이 없다.
  useEffect(() => {
    //  외부 이슈는 제목을 비울 수 없다 — 비어 있는 동안은 제목을 보내지 않는다.
    saver.set({ ...(title.trim() || !ext ? { title } : {}), body, status, priority, cwd, labels });
    if (!saver.id()) writeDraft(host, saver.fields());
    if (flushSoon.current) { flushSoon.current = false; void saver.flush(); }
  }, [saver, host, ext, title, body, status, priority, cwd, labels]);

  // 다른 기기에서 고친 것 — 목록을 다시 읽을 때마다 받아, 내가 고치는 중이 아닌 칸만 따라간다.
  const applyRemote = useCallback((keys: SaveKey[]) => {
    if (!keys.length) return;
    const f = saver.fields();
    for (const k of keys) {
      if (k === 'title') setTitle(f.title);
      else if (k === 'body') setBody(f.body);
      else if (k === 'status') setStatus(f.status as IssueStatus);
      else if (k === 'priority') setPriority(f.priority as IssuePriority);
      else if (k === 'cwd') setCwd(f.cwd);
      else if (k === 'labels') setLabels(f.labels);
    }
  }, [saver]);
  useEffect(() => {
    if (!live || closed.current) return;
    if ((live.updatedAt || 0) > attRev.current) { attRev.current = live.updatedAt || 0; setAtts(live.attachments || []); }
    applyRemote(saver.mergeRemote(live, [...focus.current]));
  }, [live, saver, applyRemote]);
  const onFocusOf = (k: SaveKey) => () => { focus.current.add(k); };
  /** 칸에서 나왔다 — 곧바로 저장하고, 미뤄 둔 다른 기기의 변경을 따라간다. */
  const onBlurOf = (k: SaveKey) => () => { focus.current.delete(k); void saver.flush(); applyRemote(saver.mergeRemote(null, [...focus.current])); };
  const pickSet = <T,>(set: (v: T) => void) => (v: string) => { flushSoon.current = true; set(v as unknown as T); };

  // 앱이 뒤로 가면 곧바로 저장한다. 화면이 사라지면(뒤로·다른 화면) 남은 저장을 뒤에서 끝낸다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') void saver.flush(); });
    const seen = seenImgs.current;   // 같은 Set 을 제자리에서 채운다 — 닫힐 때도 이것이 최신이다
    return () => {
      sub.remove();
      closed.current = true;
      if (deleted.current) { saver.dispose(); return; }
      void finalizeSave({ host, saver, createdHere: createdHere.current, atts: attsRef.current, seenImgs: seen })
        .then((ok) => { if (!ok) say(t('저장하지 못했어요 · 다시 시도 중')); });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((r: { text: string; sel: { start: number; end: number } }) => {
    setBody(r.text); selRef.current = r.sel; setSelProp(r.sel);
    // 한 번 주입한 뒤에는 선택을 다시 손가락에 맡긴다(붙들어 두면 커서가 못 움직인다).
    setTimeout(() => setSelProp(undefined), 60);
  }, []);
  const line = (p: string) => apply(toggleLinePrefix(bodyRef.current, selRef.current, p));
  const wrap = (m: string) => apply(toggleWrap(bodyRef.current, selRef.current, m));
  const block = (b: string) => apply(insertBlock(bodyRef.current, selRef.current, b));
  const gotIssue = (x: Issue | null | undefined) => { if (!x) return; attRev.current = x.updatedAt || attRev.current; setAtts(x.attachments || []); patchIssue(host, x); };

  //  첨부는 이슈에 붙는다 — 새 이슈면 먼저 이슈를 만든다(적은 것이 없어도).
  const addFiles = useCallback(async (files: Attachment[]) => {
    if (!files.length) return;
    setBusy('attach');
    try {
      const id = await saver.ensureCreated();
      if (!id) { say(errText('DAEMON_OFFLINE')); return; }
      for (const f of files) {
        const path = await uploadAttachmentNamed(f.name, f.base64, host);
        const a = { id: newAttId(), path, name: f.name, image: IMG_RE.test(f.name) || /^image\//.test(f.mime) };
        gotIssue((await attachIssue(host, id, path, a.id, a.name))?.issue);
        //  이미지는 본문 안 그 자리에 적는다(PC 편집기는 그 자리에 그림을 그리고, 에이전트는 실제 경로로 받는다).
        if (a.image) { seenImgs.current.add(a.id); block(`![${a.name.replace(/[[\]]/g, '')}](att:${a.id})`); }
      }
    } catch (e: any) { say(errText(e?.code)); } finally { setBusy(''); }
  }, [host, saver, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const onAttach = () => onPick({ title: t('첨부'), value: '', options: [{ v: 'gallery', label: t('사진 보관함') }, { v: 'files', label: t('파일') }],
    onPick: (v) => { setTimeout(() => { (v === 'gallery' ? pickFromGallery() : pickAnyFiles()).then(addFiles).catch(() => {}); }, 350); } });
  const removeAtt = async (id: string) => {
    const at = saver.id();
    if (!at) return;
    try { gotIssue((await detachIssue(host, at, id))?.issue); } catch (e: any) { say(errText(e?.code)); return; }
    setBody((b) => b.replace(new RegExp(`!\\[[^\\]]*\\]\\(att:${id}\\)\\n?`, 'g'), ''));
  };

  const start = async () => {
    if (busy) return;
    const at = cwd || live?.cwd || '';
    if (!at) { say(t('어느 워크스페이스에서 시작할지 골라 주세요')); return; }
    setBusy('start');
    try {
      //  방금 고친 글로 시작해야 한다 — 먼저 끝까지 저장한다(화면은 그대로).
      const s1 = await saver.flush();
      if (!s1.ok || !s1.id) { say(errText('')); return; }
      const r = await startIssue(host, s1.id, mode, agent, at);
      if (r?.issue) patchIssue(host, r.issue);
      say(t('시작했어요'));
      if (r?.started) onStarted({ taskId: r.started.taskId, tid: r.started.tid, cwd: at });
    } catch (e: any) { say(errText(e?.code || 'START_FAILED')); } finally { setBusy(''); }
  };
  const remove = () => {
    const id = saver.id();
    if (!id) return;
    showAppAlert({ title: t('이 이슈를 삭제할까요?'), buttons: [
      { text: t('삭제'), style: 'destructive', onPress: () => {
        //  저장 중인 요청이 지운 뒤에 도착해 되살리지 않게, 먼저 끝낸다.
        void saver.flush().then(() => deleteIssue(host, id)).then(() => { deleted.current = true; patchIssue(host, null, id); say(t('삭제했어요')); onClose(); }).catch((e: any) => say(errText(e?.code)));
      } },
      { text: t('취소'), style: 'cancel' }] });
  };
  //  GitHub 로 올리기 — 밖에 글을 올리는 일이라 자동으로 하지 않는다(누를 때만). 올린 뒤 이 PC 의 초안은 지운다(첨부는 옮겨 붙인다).
  const toGithub = async () => {
    if (busy) return;
    if (!title.trim()) { say(t('제목')); return; }
    setBusy('gh');
    try {
      const s1 = await saver.flush();
      if (!s1.ok || !s1.id) { say(errText('')); return; }
      const f = saver.fields();
      const r = await createIssue(host, { ...f, status: f.status as IssueStatus, priority: f.priority as IssuePriority, provider: 'github' });
      if (!r?.issue) return;
      let out = r.issue;
      for (const a of attsRef.current) { try { const rr = a.path ? await attachIssue(host, out.id, a.path, a.id, a.name) : null; if (rr?.issue) out = rr.issue; } catch (_) { /* 본문은 남는다 */ } }
      patchIssue(host, out);
      await deleteIssue(host, s1.id);
      deleted.current = true; patchIssue(host, null, s1.id);
      say(t('이슈를 만들었어요'));
      void refreshIssues(host);
      onClose();
    } catch (e: any) { say(errText(e?.code)); } finally { setBusy(''); }
  };

  const prop = (label: string, value: string, onPress: (() => void) | null) => (
    <PressableRow onPress={onPress || undefined} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 14, gap: 10 }}>
      <Text style={{ width: 96, color: C.text3, fontSize: v2.font.size.small }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: onPress ? C.text : C.text3, fontSize: v2.font.size.body }}>{value}</Text>
      {onPress ? <CaretDown size={12} color={C.textDim} /> : null}
    </PressableRow>
  );
  const tool = (Icon: React.ComponentType<any>, label: string, fn: () => void) => (
    <IconButton key={label} onPress={fn} accessibilityLabel={label} size={36}><Icon size={17} color={C.text2} /></IconButton>
  );
  const files = atts.filter((a) => !a.image).map((a) => ({ id: a.id, name: a.name }));
  const opts = wsOpts(cwd);
  const canGh = !!curId && !ext && ghCwds.has(cwd);
  //  미리보기 — 본문의 첨부 그림 자리는 이름으로 보여 준다(그림 파일은 PC 에 있다).
  const previewText = body.replace(/!\[([^\]]*)\]\(att:[0-9a-f]+\)/g, (_m, n) => `\`[${t('이미지')}: ${n}]\``);
  return (
    <ReAnimated.View entering={FadeIn.duration(140)} style={{ position: 'absolute', top: insets.top, bottom: 0, left: 0, right: 0, backgroundColor: C.base }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
          <IconButton onPress={() => { Keyboard.dismiss(); onClose(); }} accessibilityLabel={t('닫기')} size={38}><CaretLeft size={20} color={C.text2} /></IconButton>
          {live ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, fontFamily: v2.font.mono }}>{live.key}</Text> : null}
          <View style={{ flex: 1 }} />
          {/* 저장 표시 — 작은 글자 하나(토스트를 띄우지 않는다). 실패만 한 단계 진하게. */}
          {SAVE_TEXT[saveState] ? <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{ marginRight: 6, color: saveState === 'error' ? C.text2 : C.textDim, fontSize: v2.font.size.caption }}>{t(SAVE_TEXT[saveState])}</Text> : null}
          {ext && issue?.source.url ? <IconButton onPress={() => { void Linking.openURL(String(issue.source.url)); }} accessibilityLabel={t('원본 열기')} size={38}><ArrowSquareOut size={18} color={C.text2} /></IconButton> : null}
          {curId && !ext ? <IconButton onPress={remove} accessibilityLabel={t('삭제')} size={38}><Trash size={18} color={C.text2} /></IconButton> : null}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}>
          <TextInput value={title} onChangeText={setTitle} onFocus={onFocusOf('title')} onBlur={onBlurOf('title')} placeholder={t('제목')} placeholderTextColor={C.textDim} autoFocus={!issue && !init.title} multiline
            style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, color: C.text, fontSize: 19, fontWeight: '600' }} />
          {prop(t('상태'), t(ST_TEXT[status]), () => onPick({ title: t('상태'), value: status, options: STATUSES.map((v) => ({ v, label: t(ST_TEXT[v]) })), onPick: pickSet(setStatus) }))}
          {prop(t('우선순위'), t(PRI_TEXT[priority]), () => onPick({ title: t('우선순위'), value: priority, options: PRIS.map((v) => ({ v, label: t(PRI_TEXT[v]) })), onPick: pickSet(setPriority) }))}
          {prop(t('워크스페이스'), cwd ? (opts.find((w) => w.cwd === cwd)?.label || cwd.split('/').pop() || cwd) : t('정하지 않음'),
            ext ? null : () => onPick({ title: t('워크스페이스'), value: cwd, options: [{ v: '', label: t('정하지 않음') }, ...opts.map((w) => ({ v: w.cwd, label: w.label }))], onPick: pickSet(setCwd) }))}
          {ext ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 14, gap: 10 }}>
              <Text style={{ width: 96, color: C.text3, fontSize: v2.font.size.small }}>{t('라벨')}</Text>
              <TextInput value={labels} onChangeText={setLabels} onFocus={onFocusOf('labels')} onBlur={onBlurOf('labels')} placeholder={t('쉼표로 구분')} placeholderTextColor={C.textDim} autoCapitalize="none"
                style={{ flex: 1, padding: 0, color: C.text, fontSize: v2.font.size.body }} />
            </View>
          )}

          {/* 본문 — 도구 줄(기호를 넣어 준다) + 글. 눈 버튼으로 다듬어진 모습을 본다. */}
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: 6, alignItems: 'center' }} style={{ flex: 1, opacity: preview ? 0.35 : 1 }} pointerEvents={preview ? 'none' : 'auto'}>
                {tool(TextHOne, t('제목 1'), () => line('# '))}
                {tool(TextHTwo, t('제목 2'), () => line('## '))}
                {tool(TextHThree, t('제목 3'), () => line('### '))}
                {tool(TextB, t('굵게'), () => wrap('**'))}
                {tool(TextItalic, t('기울임'), () => wrap('*'))}
                {tool(TextStrikethrough, t('취소선'), () => wrap('~~'))}
                {tool(Code, t('코드'), () => wrap('`'))}
                {tool(ListBullets, t('글머리 기호 목록'), () => line('- '))}
                {tool(ListNumbers, t('번호 목록'), () => line('1. '))}
                {tool(ListChecks, t('할 일 목록'), () => line('- [ ] '))}
                {tool(Quotes, t('인용'), () => line('> '))}
                {tool(CodeBlock, t('코드 블록'), () => block('```\n\n```'))}
                {tool(Minus, t('구분선'), () => block('---'))}
                {tool(LinkSimple, t('링크'), () => wrap('['))}
                {tool(ImageSquare, t('첨부'), onAttach)}
              </ScrollView>
              <IconButton onPress={() => { Keyboard.dismiss(); setPreview((v) => !v); }} accessibilityLabel={preview ? t('편집') : t('미리보기')} size={38}>
                {preview ? <PencilSimple size={17} color={C.text2} /> : <Eye size={17} color={C.text2} />}
              </IconButton>
            </View>
            {preview ? (
              <View style={{ minHeight: 220, paddingHorizontal: 14, paddingVertical: 10 }}>
                {body.trim() ? <ChatMarkdown text={previewText} /> : null}
              </View>
            ) : (
              <TextInput value={body} onChangeText={setBody} onFocus={onFocusOf('body')} onBlur={onBlurOf('body')} multiline textAlignVertical="top" autoCapitalize="sentences" selection={selProp}
                onSelectionChange={(e) => { selRef.current = e.nativeEvent.selection; }}
                style={{ minHeight: 220, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: v2.font.size.body, lineHeight: 22 }} />
            )}
          </View>
          {files.length || busy === 'attach' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 4 }}>
              {files.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 240, height: 30, paddingLeft: 8, paddingRight: 2, borderRadius: v2.radius.sm, backgroundColor: C.elevated2 }}>
                  <FileIcon size={13} color={C.text3} />
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text2, fontSize: v2.font.size.caption }}>{a.name}</Text>
                  <IconButton onPress={() => { void removeAtt(a.id); }} accessibilityLabel={t('첨부 빼기')} size={26}><X size={11} color={C.textDim} /></IconButton>
                </View>
              ))}
              {busy === 'attach' ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, alignSelf: 'center' }}>{t('올리는 중…')}</Text> : null}
            </View>
          ) : null}

          {/* 이슈가 생긴 뒤에(첫 입력) 나타난다 — 새 이슈의 빈 화면에는 시작할 것이 없다. */}
          {curId ? (
            <View style={{ marginTop: 18, marginHorizontal: 14, padding: 12, gap: 8, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
              <Text style={{ color: C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{t('이 이슈로 시작')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressableScale scaleTo={0.98} onPress={() => onPick({ title: t('이 이슈로 시작'), value: mode, options: MODES.map((v) => ({ v, label: t(MODE_TEXT[v]) })), onPick: (v) => setMode(v as IssueMode) })}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 10, gap: 6, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.small }}>{t(MODE_TEXT[mode])}</Text><CaretDown size={11} color={C.textDim} />
                </PressableScale>
                <PressableScale scaleTo={0.98} onPress={() => onPick({ title: t('에이전트'), value: agent, options: AGENTS.map((v) => ({ v, label: agentDisplayName(v) || v })), onPick: setAgent })}
                  style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 10, gap: 6, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}>
                  <AgentLogo brand={agent} size={14} /><Text style={{ color: C.text, fontSize: v2.font.size.small }}>{agentDisplayName(agent) || agent}</Text><CaretDown size={11} color={C.textDim} />
                </PressableScale>
              </View>
              <Button label={t('시작')} variant="primary" busy={busy === 'start'} disabled={!!busy} onPress={() => { void start(); }} />
              {live?.link ? (
                <Button label={t('진행 중인 일 보기')} variant="ghost" onPress={() => onStarted({ taskId: live.link?.taskId || null, tid: live.link?.tid ?? null, cwd: live.link?.cwd || live.cwd })} />
              ) : null}
              {canGh ? <Button label={t('GitHub 이슈로 만들기')} variant="ghost" busy={busy === 'gh'} disabled={!!busy} onPress={() => { void toGithub(); }} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ReAnimated.View>
  );
}
