// TaskDetail — 작업 상세(설계 §6.2/§6.4): run 비교 칩 → 선택 run 의 요약·PR·행동 → diff 리뷰.
//
// 규칙(모두 설계 정본):
//  · 주 행동은 결정표(§6.7 B) 하나로 정한다 — tasksModel.primaryActionFor. 나머지는 `…` 시트.
//  · 라이브 상태가 working 이거나 run.op 가 있으면 커밋·푸시·PR·머지·폐기를 막는다(§6.0, 데몬도 거부한다).
//  · 변이는 비동기 op: `{accepted, opId}` 뒤 시트가 "진행 중…" 을 그리고 run.lastOp(같은 opId)로 마감한다.
//    RPC 자체가 실패해도 호스트가 이미 끝냈을 수 있다 → "확인 중…" 후 목록 재조회로 실제 결과를 그린다(§3.2).
//  · 리뷰 코멘트는 review.submit 이 아니라 **그 run 의 터미널 입력**(chat.input)으로 돌아간다(§6.2).
//  · PR 상태는 상세가 열려 있는 동안 30s 폴링(§6.2). GitHub 웹에서 머지된 것도 데몬이 이 조회에서 감지한다.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import { DotsThree, CaretRight, CaretDown, CheckSquare, Square } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { showAppAlert } from '../../components/AppAlert';
import { openApprovalCard } from '../../components/approval/approvalUi';
import agentStateStore, { subscribeAgentState, getAgentStateVersion } from '../../services/agentStateStore';
import taskService, {
  TaskRpcError, type Task, type TaskLite, type RunLite, type TaskDiff, type MergeResult, type RunLastOp, type PrInfo,
} from '../../services/taskService';
import { tx } from '../../text';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import ReviewView, { createReview, type ReviewState } from '../ide/ReviewView';
import * as D from '../ide/diffParse';
import AgentLogo from '../AgentLogo';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, SheetFrame, StateDot, runStateLabel, taskStateLabel, checksLabel, type Tone } from './TaskCard';
import { primaryActionFor, runBusy, type LiveSnap } from './tasksModel';
import { findTask, getBucket, refreshHost, subscribeTasksChanged, useTasksVersion, waitForOp } from './useTasks';

const TX = tx(TASKS_TEXT);

type SheetKind = 'commit' | 'pr' | 'merge' | 'more' | null;
type OpUi = { status: 'running' | 'checking' | 'done' | 'error'; code?: string | null; lastOp?: RunLastOp | null; error?: string | null };

export default function TaskDetail({ host, taskId, initialRunId, initialView = 'summary', onOpenTerminal, approvalsFor }: {
  host: number;
  taskId: string;
  initialRunId?: string | null;
  /** 카드 [리뷰] 로 들어오면 곧장 diff 리뷰. */
  initialView?: 'summary' | 'review';
  onOpenTerminal: (run: RunLite) => void;
  /** 이 run 터미널의 대기 승인 id 들(셸 approvals) — [답하기]. */
  approvalsFor: (run: RunLite) => string[];
}) {
  const C = v2.colors;
  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  // 현황판 SafeAreaView 가 이미 하단 인셋만큼 띄워 두었다 — 키보드가 그보다 더 가린 만큼만.
  const kbPad = Math.max(0, kb - insets.bottom);
  useTasksVersion();
  useSyncExternalStore(subscribeAgentState, getAgentStateVersion);
  const lite: TaskLite | null = findTask(taskId, host)?.task || null;
  const [full, setFull] = useState<Task | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const task: TaskLite | null = lite || full;
  const bucket = getBucket(host);

  // task.get — 프롬프트 전문은 여기서만 온다(목록에는 없다). tasks.changed 가 이 작업을 말하면 다시.
  const loadFull = useCallback(() => {
    taskService.getTask(host, taskId).then((r) => { setFull(r.task); setLoadErr(null); })
      .catch((e: any) => setLoadErr(e instanceof TaskRpcError ? e.code : 'GH_ERROR'));
  }, [host, taskId]);
  useEffect(() => { loadFull(); }, [loadFull]);
  useEffect(() => subscribeTasksChanged((h, ids) => { if (h === host && (!ids.length || ids.includes(taskId))) loadFull(); }), [host, taskId, loadFull]);

  const runs = (task?.runs || []).slice().sort((a, b) => a.idx - b.idx);
  const [runId, setRunId] = useState<string | null>(initialRunId || null);
  useEffect(() => {
    if (runId && runs.some((r) => r.id === runId)) return;
    const pick = runs.find((r) => r.state === 'review_ready') || runs.find((r) => r.state !== 'discarded') || runs[0];
    if (pick) setRunId(pick.id);
  }, [runs.map((r) => r.id).join(','), runId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = runs.find((r) => r.id === runId) || null;

  const liveOf = (r: RunLite | null): LiveSnap | null => {
    if (!r || typeof r.tid !== 'number') return null;
    const s = agentStateStore.agentSnapOf(host, r.cwd, r.tid);
    return s && s.state !== 'gone' ? { state: s.state as LiveSnap['state'], at: s.at, since: s.since ?? null, agent: s.agent } : null;
  };
  const live = liveOf(run);
  const busy = runBusy(run, live);

  // ── PR 상태 30s 폴링(상세가 열린 동안, PR 이 있거나 만들 수 있는 run 만) ──
  const [prOverride, setPrOverride] = useState<Record<string, PrInfo | null>>({});
  const pr: PrInfo | null = run ? (run.id in prOverride ? prOverride[run.id] : run.pr) : null;
  const canPr = !!task?.repo?.github && !!bucket?.gh?.ghInstalled && !!bucket?.gh?.ghAuthed;
  useEffect(() => {
    if (!run || !canPr || run.state === 'discarded') return;
    let alive = true;
    const tick = () => {
      taskService.prStatus(host, taskId, run.id)
        .then((r) => { if (alive) setPrOverride((m) => ({ ...m, [run.id]: r.pr || null })); })
        .catch(() => { /* 폴링 실패는 조용히 — 마지막 값을 유지한다 */ });
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [host, taskId, run?.id, canPr]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 요약 ⇄ 리뷰 ──
  const [view, setView] = useState<'summary' | 'review'>(initialView);
  const [promptOpen, setPromptOpen] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [diffErr, setDiffErr] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const omittedLoaded = useRef<Set<string>>(new Set());

  const loadDiff = useCallback(async () => {
    if (!run) return;
    setDiffLoading(true); setDiffErr(null);
    try {
      const d = await taskService.getDiff(host, taskId, run.id);
      setDiff(d);
      omittedLoaded.current = new Set();
      setReview(createReview({
        reviewId: 'task:' + run.id,
        title: task?.title || '',
        files: d.files.map((f) => ({ path: f.path, diffText: f.diffText || '', truncated: !!f.truncated })),
      }));
    } catch (e: any) {
      setDiffErr(e instanceof TaskRpcError ? e.code : 'GH_ERROR');
    } finally {
      setDiffLoading(false);
    }
  }, [host, taskId, run?.id, task?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 run 으로 **바꿀 때만** 리뷰를 비우고 요약으로 — 첫 선택(마운트)은 initialView 를 존중한다.
  const prevRunRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRunRef.current;
    prevRunRef.current = run?.id || null;
    if (prev && prev !== run?.id) { setReview(null); setDiff(null); setView('summary'); }
  }, [run?.id]);
  useEffect(() => { if (view === 'review' && !review && !diffLoading && run) void loadDiff(); }, [view, run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전체 상한(400KB)을 넘어 diffText 가 빠진 파일은 그 파일로 넘어갈 때 개별 조회한다(§2.9 4).
  useEffect(() => {
    if (!review || !diff || !run) return;
    const f = diff.files[review.index];
    if (!f || !f.omitted || omittedLoaded.current.has(f.path)) return;
    omittedLoaded.current.add(f.path);
    taskService.getDiff(host, taskId, run.id, f.path).then((one) => {
      const got = one.files.find((x) => x.path === f.path);
      if (!got?.diffText) return;
      setReview((cur) => {
        if (!cur) return cur;
        const hunkList = D.parseHunks(got.diffText);
        return { ...cur, files: cur.files.map((x) => (x.path === f.path ? { ...x, diffText: got.diffText, truncated: !!got.truncated, hunkList, hunks: hunkList.length } : x)) };
      });
    }).catch(() => { /* 개별 조회 실패 — 빈 파일로 남긴다(목록은 그대로) */ });
  }, [review?.index, diff]); // eslint-disable-line react-hooks/exhaustive-deps

  const commentText = useMemo(() => (review ? D.serializeReviewComments({ comments: review.comments, decisions: review.decisions, note: review.note }, { title: task?.title || '' }) : ''), [review, task?.title]);
  const sendComments = useCallback(async () => {
    if (!review || !run || typeof run.tid !== 'number' || !commentText) return;
    setReview({ ...review, sending: true, error: null });
    try {
      await taskService.runInput(host, run.cwd, run.tid, commentText);
      setReview((cur) => (cur ? { ...cur, sending: false, comments: [], decisions: {}, note: '' } : cur));
    } catch (e: any) {
      setReview((cur) => (cur ? { ...cur, sending: false, error: taskErrorText(TX, e instanceof TaskRpcError ? e.code : 'GH_ERROR') } : cur));
    }
  }, [review, run, commentText, host]);

  // ── op(비동기 변이) ──
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [mergeMode, setMergeMode] = useState<'pr' | 'local'>('local');
  const [op, setOp] = useState<OpUi | null>(null);
  const runOp = useCallback(async (call: (opId: string) => Promise<unknown>, after?: (lo: RunLastOp | null) => boolean | void) => {
    if (!run) return;
    const opId = taskService.newOpId();
    setOp({ status: 'running' });
    try {
      await call(opId);
    } catch (e: any) {
      // 호스트가 이미 실행했을 수 있다(봉인 타임아웃 등) → 확인 중 → 목록 재조회로 lastOp 를 본다.
      setOp({ status: 'checking' });
      await refreshHost(host);
      const r = findTask(taskId, host)?.task.runs.find((x) => x.id === run.id);
      if (r?.lastOp?.opId === opId) {
        const lo = r.lastOp;
        if (after && after(lo) === true) return;
        setOp({ status: lo.ok ? 'done' : 'error', code: lo.code, lastOp: lo });
      } else if (r?.op?.opId === opId) {
        const lo = await waitForOp(host, taskId, run.id, opId);
        if (after && after(lo) === true) return;
        setOp({ status: lo?.ok ? 'done' : 'error', code: lo?.code || (lo ? null : 'TIMEOUT'), lastOp: lo });
      } else {
        setOp({ status: 'error', code: e instanceof TaskRpcError ? e.code : 'GH_ERROR' });
      }
      return;
    }
    void refreshHost(host);
    const lo = await waitForOp(host, taskId, run.id, opId);
    if (after && after(lo) === true) return;
    setOp({ status: lo?.ok ? 'done' : 'error', code: lo ? lo.code : 'TIMEOUT', lastOp: lo });
  }, [run, host, taskId]);

  // 성공하면 시트를 닫는다(결과 데이터가 있는 실패 — 충돌 목록·훅 stderr — 는 시트가 보여 준다).
  useEffect(() => {
    if (op?.status === 'done') {
      const res = op.lastOp?.result as MergeResult | undefined;
      if (res && (res as any).ok === false) return;
      setSheet(null); setOp(null);
    }
  }, [op]);
  const closeSheet = () => { setSheet(null); setOp(null); };

  // ── 폐기 — force 는 사용자 확인 뒤에만(§2.10) ──
  const discard = useCallback((whole: boolean) => {
    if (!run) return;
    const go = (force: boolean) => runOp(
      (opId) => taskService.discardTask(host, taskId, whole ? null : run.id, force, opId),
      (lo) => {
        const skipped = Array.isArray(lo?.result?.skipped) ? lo!.result.skipped : [];
        const code = lo && !lo.ok ? lo.code : skipped[0]?.code;
        if (!force && (code === 'UNCOMMITTED_CHANGES' || code === 'UNMERGED_COMMITS')) {
          setOp(null);
          showAppAlert({
            title: TX.discard,
            message: code === 'UNCOMMITTED_CHANGES' ? TX.discardConfirm(run.diff?.files || 0) : TX.discardUnmergedConfirm(run.commits?.ahead || 0),
            buttons: [
              { text: TX.discard, style: 'destructive', onPress: () => { void go(true); } },
              { text: TX.cancel, style: 'cancel' },
            ],
          });
          return true;
        }
        return false;
      },
    );
    if (whole) {
      showAppAlert({
        title: TX.discard, message: TX.discardAllConfirm,
        buttons: [{ text: TX.discard, style: 'destructive', onPress: () => { void go(false); } }, { text: TX.cancel, style: 'cancel' }],
      });
    } else void go(false);
  }, [run, host, taskId, runOp]);

  if (!task) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {loadErr ? <Text style={{ color: C.text2, fontSize: 13 }}>{taskErrorText(TX, loadErr)}</Text> : <ActivityIndicator color={C.text3} />}
      </View>
    );
  }

  const gh = bucket?.gh || null;
  const primary = primaryActionFor(task, gh, run ? { pr } : null);
  const ended = task.state !== 'open';
  const approvalIds = run ? approvalsFor(run) : [];

  const primaryBtn = (compact?: boolean) => {
    if (!run || run.state === 'discarded' || run.state === 'merged') return null;
    const disabled = busy;
    switch (primary.action) {
      case 'createPr': return <Btn small={compact} kind="primary" label={TX.createPr} disabled={disabled} onPress={() => setSheet('pr')} />;
      case 'mergePr': return <Btn small={compact} kind="primary" label={TX.mergePr} disabled={disabled || pr?.mergeable !== 'MERGEABLE'} onPress={() => { setMergeMode('pr'); setSheet('merge'); }} />;
      case 'ghLogin': return <Btn small={compact} kind="primary" label={TX.ghNotAuthed} onPress={() => showGhGuide('GH_NOT_AUTHED')} />;
      case 'mergeLocal': return <Btn small={compact} kind="primary" label={TX.mergeLocal} disabled={disabled} onPress={() => { setMergeMode('local'); setSheet('merge'); }} />;
      default: return null;
    }
  };
  const showGhGuide = (code: 'GH_MISSING' | 'GH_NOT_AUTHED') => {
    showAppAlert({
      title: code === 'GH_MISSING' ? TX.ghMissing : TX.ghNotAuthed,
      message: code === 'GH_MISSING' ? TX.ghMissingHint : TX.ghNotAuthedHint,
      buttons: [
        { text: TX.checkAgain, style: 'primary', onPress: () => { void taskService.ghStatus(host, true).finally(() => refreshHost(host)); } },
        ...(code === 'GH_MISSING' ? [{ text: TX.useLocalMerge, onPress: () => { setMergeMode('local'); setSheet('merge'); } }] : []),
        { text: TX.cancel, style: 'cancel' as const },
      ],
    });
  };
  const moreBtn = (
    <PressableScale scaleTo={0.92} onPress={() => setSheet('more')} accessibilityLabel={TX.detail}
      style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl }}>
      <DotsThree size={16} color={C.text2} weight="bold" />
    </PressableScale>
  );

  const runTone = (r: RunLite): Tone => {
    const l = liveOf(r);
    if (r.state === 'failed' || r.trustPending || (l && (l.state === 'permission' || l.state === 'needsInput'))) return r.state === 'failed' ? 'error' : 'warn';
    if (runBusy(r, l) || r.state === 'creating' || r.state === 'launching' || r.state === 'merging') return 'working';
    if (r.state === 'merged') return 'cta';
    return 'none';
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 머리 — 제목 / 상태 · base · 저장소 */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text numberOfLines={2} style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{task.title}</Text>
        <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginTop: 3 }}>
          {[taskStateLabel(TX, task.state), `${TX.base} ${task.base}`, task.repo?.name].filter(Boolean).join(' · ')}
        </Text>
        {/* 실행 칩 — 가로 스크롤, 선택 = elevated2(무채색). 상태 점만 색. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
          {runs.map((r) => {
            const on = r.id === runId;
            return (
              <PressableScale key={r.id} scaleTo={0.96} onPress={() => setRunId(r.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: on ? C.elevated2 : 'transparent', borderWidth: 1, borderColor: on ? C.textDim : C.border, opacity: r.state === 'discarded' ? 0.5 : 1 }}>
                <StateDot tone={runTone(r)} />
                <AgentLogo brand={r.agent} size={12} />
                <Text style={{ color: on ? C.text : C.text2, fontSize: 12 }}>{`${TX.runN(r.idx)} · ${r.agent}`}</Text>
                {task.winnerRunId === r.id ? <Text style={{ color: C.textDim, fontSize: 11 }}>{TX.winner}</Text> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
        {/* 요약 ⇄ 리뷰 */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {(['summary', 'review'] as const).map((v) => (
            <PressableScale key={v} scaleTo={0.96} onPress={() => setView(v)}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, backgroundColor: view === v ? C.elevated2 : 'transparent' }}>
              <Text style={{ color: view === v ? C.text : C.text3, fontSize: 12.5, fontWeight: '600' }}>
                {v === 'summary' ? TX.detail : run?.diff ? `${TX.review} · ${TX.filesSummary(run.diff.files)}` : TX.review}
              </Text>
            </PressableScale>
          ))}
        </View>
      </View>

      {view === 'review' ? (
        review ? (
          // ★ 현황판은 전체화면 Modal 이라 키보드가 창을 줄이지 않는다(iOS 는 원래, Android 는 targetSdk 35
          //   edge-to-edge 에서 Modal 창에 adjustResize 가 안 먹는다 — PaletteSheet 와 같은 사정). 인라인 코멘트
          //   입력칸·[저장]·[코멘트 보내기] 바가 키보드에 가리지 않게 가린 높이만큼 바닥을 올린다.
          <View style={{ flex: 1, paddingBottom: kbPad }}>
          <ReviewView
            mode="task"
            state={review}
            onChange={setReview}
            onSubmit={() => { void sendComments(); }}
            sendLabel={TX.sendComments}
            canSend={!!commentText}
            taskActions={<View style={{ flexDirection: 'row', gap: 6 }}>{primaryBtn(true)}{moreBtn}</View>}
          />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {diffLoading ? <ActivityIndicator color={C.text3} /> : null}
            {diffErr ? <Text style={{ color: C.text2, fontSize: 13 }}>{taskErrorText(TX, diffErr)}</Text> : null}
            {diffErr ? <Btn label={TX.checkAgain} onPress={() => { void loadDiff(); }} /> : null}
          </View>
        )
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 28 }}>
          {/* 프롬프트(접힘) */}
          <View>
            <PressableScale scaleTo={0.98} onPress={() => setPromptOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {promptOpen ? <CaretDown size={12} color={C.textDim} /> : <CaretRight size={12} color={C.textDim} />}
              <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700' }}>{TX.prompt}</Text>
            </PressableScale>
            {promptOpen ? (
              <Text selectable style={{ color: C.text2, fontSize: 12.5, lineHeight: 19, marginTop: 6 }}>{full?.prompt || ''}</Text>
            ) : null}
          </View>

          {run ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StateDot tone={runTone(run)} />
                <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>
                  {run.op ? TX.opInProgress : live?.state === 'working' ? TX.groupWorking : runStateLabel(TX, run.state)}
                </Text>
                <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono, textAlign: 'right' }}>{run.branch}</Text>
              </View>
              <Text style={{ color: C.text2, fontSize: 12.5 }}>
                {[
                  run.diff ? `${TX.filesSummary(run.diff.files)} ${TX.diffStat(run.diff.additions, run.diff.deletions)}` : null,
                  run.commits ? TX.commitsAhead(run.commits.ahead) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
              {run.trustPending ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.trustNeeded}</Text> : null}
              {run.error ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{taskErrorText(TX, run.error.code, { base: task.base })}</Text> : null}
              {run.state === 'running' && run.terminalAlive === false ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.terminalGone}</Text> : null}
              {run.agentGone ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.agentGone}</Text> : null}
              {task.state === 'merged' && run.id !== task.winnerRunId && run.state !== 'discarded' ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.keptDirty}</Text> : null}
              {run.lastOp && run.lastOp.ok === false ? <Text style={{ color: C.error, fontSize: 12.5 }}>{taskErrorText(TX, run.lastOp.code, { base: task.base })}</Text> : null}
              {busy ? <Text style={{ color: C.textDim, fontSize: 12 }}>{TX.agentBusy}</Text> : null}

              {/* PR 블록 — gh 안내가 이 자리에 온다(§6.7 A) */}
              {task.repo?.github ? (
                <View style={{ padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, gap: 6 }}>
                  {!gh || !gh.ghInstalled ? (
                    <>
                      <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.ghMissing}</Text>
                      <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.ghMissingHint}</Text>
                    </>
                  ) : !gh.ghAuthed ? (
                    <>
                      <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.ghNotAuthed}</Text>
                      <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.ghNotAuthedHint}</Text>
                      <View style={{ flexDirection: 'row' }}><Btn small label={TX.checkAgain} onPress={() => { void taskService.ghStatus(host, true).finally(() => refreshHost(host)); }} /></View>
                    </>
                  ) : !pr ? (
                    <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.noPr}</Text>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <StateDot tone={pr.state === 'closed' ? 'none' : pr.checks?.status === 'failing' ? 'error' : pr.mergeable === 'MERGEABLE' ? 'cta' : 'none'} />
                        <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{TX.prNumber(pr.number)}</Text>
                        {pr.isDraft ? <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.prDraft}</Text> : null}
                        <Text style={{ flex: 1, color: C.textDim, fontSize: 11.5 }}>
                          {pr.state === 'closed' ? TX.prClosed : pr.state === 'merged' ? TX.stateMerged : pr.mergeable === 'CONFLICTING' ? TX.prConflicting : pr.mergeable === 'MERGEABLE' ? TX.prMergeable : ''}
                        </Text>
                        <Btn small label={TX.openPr} onPress={() => { void Linking.openURL(pr.url).catch(() => {}); }} />
                      </View>
                      <Text style={{ color: C.text2, fontSize: 12 }}>{checksLabel(TX, pr)}</Text>
                      {(pr.checks?.items || []).slice(0, 20).map((it, i) => (
                        <View key={`${it.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <StateDot tone={it.status === 'failing' ? 'error' : it.status === 'passing' ? 'cta' : it.status === 'pending' ? 'working' : 'none'} />
                          <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: 11.5 }}>{it.name}</Text>
                          <Text style={{ color: C.textDim, fontSize: 11 }}>
                            {it.status === 'passing' ? TX.checkItemPassing : it.status === 'failing' ? TX.checkItemFailing : it.status === 'skipped' ? TX.checkItemSkipped : TX.checkItemPending}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ) : null}

              {/* 행동 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {approvalIds.length ? <Btn kind="primary" label={TX.answer} onPress={() => openApprovalCard(approvalIds[0])} /> : null}
                {run.trustPending ? <Btn kind="primary" label={TX.trustContinue} onPress={() => { void taskService.trustRun(host, taskId, run.id).catch(() => {}).finally(() => refreshHost(host)); }} /> : null}
                {run.state === 'failed' || run.agentGone || (run.state === 'running' && run.terminalAlive === false) || run.error?.code === 'OP_INTERRUPTED' ? (
                  <Btn kind="primary" label={run.agentGone ? TX.relaunchAgent : run.terminalAlive === false ? TX.reopenTerminal : TX.reopen}
                    onPress={() => { void runOp((opId) => taskService.reopenRun(host, taskId, run.id, opId)); }} />
                ) : null}
                {run.error?.code === 'PROMPT_NOT_DELIVERED' || run.state === 'failed' ? (
                  <Btn label={TX.resendPrompt} onPress={() => { void taskService.resendPrompt(host, taskId, run.id).catch(() => {}).finally(() => refreshHost(host)); }} />
                ) : null}
                {primaryBtn()}
                {run.state !== 'discarded' && run.state !== 'merged' ? <Btn label={TX.openTerminal} disabled={!run.workspaceId} onPress={() => onOpenTerminal(run)} /> : null}
                {run.state !== 'discarded' ? moreBtn : null}
              </View>
              {!run.workspaceId && run.state !== 'discarded' && run.state !== 'merged' ? <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.wsNotRegistered}</Text> : null}
              {op && !sheet ? <OpLine op={op} /> : null}
            </View>
          ) : null}
          {ended ? null : (
            <View style={{ flexDirection: 'row' }}>
              <Btn kind="danger" label={`${TX.discard} · ${TX.title}`} onPress={() => discard(true)} />
            </View>
          )}
        </ScrollView>
      )}

      {/* ── 시트들 ── */}
      {run ? (
        <>
          {/* ★ 시트는 **한 개의 SheetFrame(= 네이티브 Modal 1개)** 안에서 내용만 바꾼다. '…' → [커밋]/[로컬 머지] 를
              형제 Modal 교체로 하면 iOS 는 닫히는 모달 옆의 새 present 를 거부해 시트가 그냥 닫혀 버린다. */}
          <SheetFrame visible={!!sheet} onClose={closeSheet}
            title={sheet === 'commit' ? TX.commit : sheet === 'pr' ? TX.createPr
              : sheet === 'merge' ? (mergeMode === 'pr' ? (pr ? `${TX.mergePr} · ${TX.prNumber(pr.number)}` : TX.mergePr) : TX.mergeLocal) : undefined}>
          {sheet === 'more' ? (
            <View style={{ gap: 8 }}>
              <Btn label={TX.commit} disabled={busy} onPress={() => setSheet('commit')} />
              {task.repo?.github || task.repo?.remoteUrl ? <Btn label={TX.push} disabled={busy} onPress={() => { setSheet(null); void runOp((opId) => taskService.pushRun(host, taskId, run.id, opId)); }} /> : null}
              {primary.action !== 'mergeLocal' ? <Btn label={TX.mergeLocal} disabled={busy} onPress={() => { setMergeMode('local'); setSheet('merge'); }} /> : null}
              {pr ? <Btn label={TX.openPr} onPress={() => { void Linking.openURL(pr.url).catch(() => {}); }} /> : null}
              <Btn label={TX.checkChanges} onPress={() => { setSheet(null); setReview(null); setView('review'); void loadDiff(); void refreshHost(host); }} />
              <Btn label={TX.openTerminal} disabled={!run.workspaceId} onPress={() => { setSheet(null); onOpenTerminal(run); }} />
              <Btn kind="danger" label={TX.discard} disabled={busy} onPress={() => { setSheet(null); discard(false); }} />
            </View>
          ) : null}
          <CommitSheet visible={sheet === 'commit'} onClose={closeSheet} defaultMessage={task.title} op={op}
            onSubmit={(message, noVerify) => { void runOp((opId) => taskService.commitRun(host, taskId, run.id, message, noVerify, opId)); }} />
          <PrSheet visible={sheet === 'pr'} onClose={closeSheet} task={task} full={full} run={run} op={op}
            onSubmit={(p) => { void runOp((opId) => taskService.createPr(host, taskId, run.id, p, opId)); }} />
          <MergeSheet visible={sheet === 'merge'} onClose={closeSheet} mode={mergeMode} op={op} pr={pr}
            commitDefault={mergeMode === 'local' && run.dirty ? task.title : null}
            hasOthers={(task.runs || []).some((x) => x.id !== run.id && x.state !== 'discarded')}
            onOpenTerminal={() => { closeSheet(); onOpenTerminal(run); }}
            onSubmit={(method, discardOthers, force, commitMessage) => {
              void runOp((opId) => (mergeMode === 'pr'
                ? taskService.mergePr(host, taskId, run.id, method as 'merge' | 'squash' | 'rebase', discardOthers, force, opId)
                : taskService.mergeLocal(host, taskId, run.id, method as 'merge' | 'squash' | 'ff', discardOthers, opId, commitMessage)));
            }} />
          </SheetFrame>
        </>
      ) : null}
    </View>
  );
}

function OpLine({ op }: { op: OpUi }) {
  const C = v2.colors;
  if (op.status === 'running' || op.status === 'checking') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={C.text3} />
        <Text style={{ color: C.text2, fontSize: 12.5 }}>{op.status === 'running' ? TX.opInProgress : TX.checking}</Text>
      </View>
    );
  }
  if (op.status === 'error') return <Text style={{ color: C.error, fontSize: 12.5 }}>{taskErrorText(TX, op.code)}</Text>;
  return null;
}

function Field({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange: (s: string) => void; multiline?: boolean; placeholder?: string }) {
  const C = v2.colors;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700', marginBottom: 5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} placeholder={placeholder} placeholderTextColor={C.textDim}
        style={{ minHeight: multiline ? 80 : 38, maxHeight: 180, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, color: C.text, fontSize: 13.5, textAlignVertical: multiline ? 'top' : 'center' }} />
    </View>
  );
}
function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableScale scaleTo={0.98} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {on ? <CheckSquare size={18} color={C.text} weight="fill" /> : <Square size={18} color={C.text2} />}
      <Text style={{ color: C.text2, fontSize: 13 }}>{label}</Text>
    </PressableScale>
  );
}
function Choice({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {options.map((o) => (
        <PressableScale key={o.id} scaleTo={0.96} onPress={() => onChange(o.id)}
          style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: value === o.id ? C.textDim : C.borderControl, backgroundColor: value === o.id ? C.elevated2 : 'transparent' }}>
          <Text style={{ color: value === o.id ? C.text : C.text2, fontSize: 12.5 }}>{o.label}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

function CommitSheet({ visible, onClose, defaultMessage, op, onSubmit }: {
  visible: boolean; onClose: () => void; defaultMessage: string; op: OpUi | null; onSubmit: (message: string, noVerify: boolean) => void;
}) {
  const C = v2.colors;
  const [message, setMessage] = useState(defaultMessage);
  const [noVerify, setNoVerify] = useState(false);
  const [showTail, setShowTail] = useState(false);
  useEffect(() => { if (visible) { setMessage(defaultMessage); setNoVerify(false); setShowTail(false); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = op?.status === 'running' || op?.status === 'checking';
  const hookFailed = op?.status === 'error' && op.code === 'COMMIT_HOOK_FAILED';
  const tail = String(op?.lastOp?.result?.stderrTail || '');
  if (!visible) return null;
  return (
    <>
      <Field label={TX.commitMessage} value={message} onChange={setMessage} multiline />
      <Check label={TX.skipHooks} on={noVerify} onPress={() => setNoVerify((v) => !v)} />
      {op ? <OpLine op={op} /> : null}
      {hookFailed && tail ? (
        <View style={{ marginTop: 6 }}>
          <PressableScale scaleTo={0.98} onPress={() => setShowTail((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {showTail ? <CaretDown size={12} color={C.textDim} /> : <CaretRight size={12} color={C.textDim} />}
            <Text style={{ color: C.textDim, fontSize: 11.5 }}>stderr</Text>
          </PressableScale>
          {showTail ? (
            <ScrollView style={{ maxHeight: 160, marginTop: 4 }}>
              <Text selectable style={{ color: C.text2, fontSize: 11, fontFamily: v2.font.mono }}>{tail}</Text>
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn label={TX.cancel} onPress={onClose} />
        {hookFailed ? <Btn label={TX.retryCommitNoVerify} onPress={() => onSubmit(message.trim(), true)} disabled={running || !message.trim()} /> : null}
        <Btn kind="primary" label={TX.commit} busy={running} disabled={!message.trim()} onPress={() => onSubmit(message.trim(), noVerify)} />
      </View>
    </>
  );
}

function PrSheet({ visible, onClose, task, full, run, op, onSubmit }: {
  visible: boolean; onClose: () => void; task: TaskLite; full: Task | null; run: RunLite; op: OpUi | null;
  onSubmit: (p: { title: string; body?: string; draft?: boolean; push?: boolean; commitMessage?: string }) => void;
}) {
  const defaultBody = () => {
    const p = (full?.prompt || '').trim();
    const summary = p.length > 600 ? `${p.slice(0, 600)}…` : p;
    return `${summary}${summary ? '\n\n' : ''}Task ${task.id}`;
  };
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(defaultBody);
  const [commitMessage, setCommitMessage] = useState(task.title);
  const [draft, setDraft] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setTitle(task.title); setBody(defaultBody()); setCommitMessage(task.title); setDraft(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = op?.status === 'running' || op?.status === 'checking';
  if (!visible) return null;
  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        {/* dirty 면 커밋 메시지가 한 시트에 붙는다(폰에서 커밋·푸시·PR 한 번에 — §2.9 pr.create commitMessage) */}
        {run.dirty ? <Field label={TX.commitMessage} value={commitMessage} onChange={setCommitMessage} /> : null}
        <Field label={TX.prTitle} value={title} onChange={setTitle} />
        <Field label={TX.prBody} value={body} onChange={setBody} multiline />
        <Check label={TX.draftPr} on={draft} onPress={() => setDraft((v) => !v)} />
        {op ? <OpLine op={op} /> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn label={TX.cancel} onPress={onClose} />
        <Btn kind="primary" label={TX.createPr} busy={running} disabled={!title.trim() || (!!run.dirty && !commitMessage.trim())}
          onPress={() => onSubmit({ title: title.trim(), body, draft, push: true, ...(run.dirty ? { commitMessage: commitMessage.trim() } : {}) })} />
      </View>
    </>
  );
}

function MergeSheet({ visible, onClose, mode, op, pr, onSubmit, onOpenTerminal, commitDefault, hasOthers }: {
  visible: boolean; onClose: () => void; mode: 'pr' | 'local'; op: OpUi | null; pr: PrInfo | null;
  onSubmit: (method: string, discardOthers: boolean, force: boolean, commitMessage?: string) => void; onOpenTerminal: () => void;
  // 로컬 머지 + 미커밋 변경이면 커밋 메시지 기본값(없으면 null = 칸 숨김). 없으면 UNCOMMITTED_CHANGES 막다른 길(2026-09-29 실측).
  commitDefault: string | null; hasOthers: boolean;
}) {
  const C = v2.colors;
  const [method, setMethod] = useState(mode === 'pr' ? 'squash' : 'merge');
  const [discardOthers, setDiscardOthers] = useState(true);
  const [commitMessage, setCommitMessage] = useState(commitDefault || '');
  useEffect(() => { if (visible) { setMethod(mode === 'pr' ? 'squash' : 'merge'); setDiscardOthers(true); setCommitMessage(commitDefault || ''); } }, [visible, mode, commitDefault]);
  const needCommit = commitDefault != null;
  const running = op?.status === 'running' || op?.status === 'checking';
  const res = op?.lastOp?.result as MergeResult | undefined;
  const conflict = res && (res as any).ok === false && (res as any).code === 'MERGE_CONFLICT' ? (res as { files: string[] }).files || [] : null;
  const checksFailing = op?.status === 'error' && op.code === 'CHECKS_FAILING';
  const options = mode === 'pr'
    ? [{ id: 'squash', label: TX.methodSquash }, { id: 'merge', label: TX.methodMerge }, { id: 'rebase', label: TX.methodRebase }]
    : [{ id: 'merge', label: TX.methodMerge }, { id: 'squash', label: TX.methodSquash }, { id: 'ff', label: TX.methodFf }];
  if (!visible) return null;
  return (
    <>
      {needCommit ? <Field label={TX.commitMessage} value={commitMessage} onChange={setCommitMessage} /> : null}
      <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700', marginBottom: 6 }}>{TX.mergeMethod}</Text>
      <Choice options={options} value={method} onChange={setMethod} />
      {hasOthers ? <Check label={TX.discardOthers} on={discardOthers} onPress={() => setDiscardOthers((v) => !v)} /> : null}
      {conflict ? (
        <View style={{ gap: 4, marginBottom: 8 }}>
          <Text style={{ color: C.error, fontSize: 12.5 }}>{TX.errConflict}</Text>
          {conflict.slice(0, 30).map((f) => <Text key={f} numberOfLines={1} style={{ color: C.text2, fontSize: 11.5, fontFamily: v2.font.mono }}>{f}</Text>)}
          <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.conflictHint}</Text>
          <View style={{ flexDirection: 'row' }}><Btn small label={TX.openTerminal} onPress={onOpenTerminal} /></View>
        </View>
      ) : op ? <OpLine op={op} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn label={TX.cancel} onPress={onClose} />
        {checksFailing ? <Btn kind="danger" label={TX.mergePr} disabled={running} onPress={() => onSubmit(method, discardOthers, true)} /> : null}
        <Btn kind="primary" label={TX.merge} busy={running} disabled={needCommit && !commitMessage.trim()}
          onPress={() => onSubmit(method, discardOthers, false, needCommit ? commitMessage.trim() : undefined)} />
      </View>
    </>
  );
}
