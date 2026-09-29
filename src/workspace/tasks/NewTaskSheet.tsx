// NewTaskSheet — 새 작업 만들기(설계 §6.3/§6.6). 셸에 1회 마운트, tasksUi.openNewTask() 로 연다.
//
// 필드 순서(PC 시트와 같다): PC(온라인 로컬 PC 2대 이상일 때만) → 저장소(그 PC 의 로컬 워크스페이스, 작업
//  워크스페이스 제외) → base(git.branches, 기본 현재 브랜치) → 프롬프트(받아쓰기) → 에이전트 칩 × 개수 → 고급.
//
// 규칙:
//  · 프롬프트 상한은 **UTF-8 바이트** 30000(문자 수 아님) — 카운터·[시작] 비활성이 같은 함수를 쓴다.
//  · 에이전트 선택지는 claude·codex·gemini 뿐(설계 부록 Z B-5 — 런치 인자로 프롬프트를 받는 에이전트).
//  · 한 작업의 실행 수는 합계 4 이하(§1.6). 미설치 칩은 비활성.
//  · [시작] 의 opId 는 시트가 열려 있는 동안 **같은 값**을 쓴다 — 실패 뒤 다시 눌러도 데몬이 재생으로
//    받아 작업이 두 번 생기지 않는다(설계 §2.12).

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Microphone, Minus, Plus, CheckSquare, Square, Laptop, CaretRight } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import PcPickerSheet from '../../components/PcPickerSheet';
import MicSpectrum from '../chat/MicSpectrum';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import daemonService, { type DaemonAgent, type DaemonRunner } from '../../services/daemonService';
import taskService, { PROMPT_MAX_BYTES, TaskRpcError, utf8Bytes, type BranchesResult } from '../../services/taskService';
import { useMicDictation } from '../../hooks/useMicDictation';
import { tx } from '../../text';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import AgentLogo from '../AgentLogo';
import { Btn, SheetFrame } from './TaskCard';
import { closeNewTask, getTasksUi, openTasksDashboard, subscribeTasksUi } from './tasksUi';
import { useOverlayLayer, type OverlayLayer } from '../../components/modalLayer';
import { refreshHost } from './useTasks';

const TX = tx(TASKS_TEXT);
const TASK_AGENTS = ['claude', 'codex', 'gemini'];
const MAX_RUNS = 4;

export default function NewTaskSheet({ layer = 'root' }: { layer?: OverlayLayer } = {}) {
  const ui = useSyncExternalStore(subscribeTasksUi, getTasksUi);
  const cur = useOverlayLayer();
  const prefill = ui.newTask;
  const visible = !!prefill;
  // 열릴 때마다 새 폼 — openNewTask() 가 매번 새 prefill 객체를 만든다(= 열림 세대). 닫힌 폼의 상태가
  //  다음 열기에 새지 않게 그 객체를 키로 쓴다(마운트 1회 — 세대 state 를 두면 첫 열기에 두 번 마운트된다).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gen = useMemo(() => Math.random().toString(36).slice(2), [prefill]);
  // 현황판이 떠 있으면 그 Modal 안의 인스턴스만 그린다(iOS 는 루트 VC 의 두 번째 present 를 거부한다).
  if (cur !== layer) return null;
  return (
    <SheetFrame visible={visible} onClose={closeNewTask} title={TX.newTask}>
      {visible ? <Form key={gen} prefillHost={prefill?.host ?? null} prefillWs={prefill?.workspaceId ?? null} prefillPrompt={prefill?.prompt || ''} /> : null}
    </SheetFrame>
  );
}

function Form({ prefillHost, prefillWs, prefillPrompt }: { prefillHost: number | null; prefillWs: string | null; prefillPrompt: string }) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [runners, setRunners] = useState<DaemonRunner[] | null>(null);
  const [host, setHost] = useState<number | null>(prefillHost);
  const [pcPicker, setPcPicker] = useState(false);
  const [wsId, setWsId] = useState<string | null>(prefillWs);
  const [branches, setBranches] = useState<BranchesResult | null>(null);
  const [branchErr, setBranchErr] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(prefillPrompt);
  const [agents, setAgents] = useState<DaemonAgent[] | null>(null);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [advanced, setAdvanced] = useState(false);
  const [copyEnv, setCopyEnv] = useState(true);
  const [fetchFirst, setFetchFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opId] = useState(() => taskService.newOpId());
  const mic = useMicDictation(prompt, setPrompt, 60000);

  // 온라인 로컬 PC 목록(GET /status) — 2대 이상일 때만 PC 선택 행을 그린다.
  useEffect(() => {
    let alive = true;
    daemonService.getStatus().then((st) => {
      if (!alive) return;
      const list = (st.runners || []).filter((r) => r.kind === 'local');
      setRunners(list);
      setHost((h) => (h != null && list.some((r) => r.deviceId === h) ? h : (list[0]?.deviceId ?? h)));
    }).catch(() => { if (alive) setRunners([]); });
    void taskService.refreshHostCaps();
    return () => { alive = false; };
  }, []);

  const repos = useMemo(() => (host == null ? [] : S.workspacesForDevice(host).filter((w) => S.isLocal(w) && !!w.localPath)), [S, host]);
  useEffect(() => {
    if (!repos.length) { setWsId(null); return; }
    setWsId((cur) => (cur && repos.some((w) => w.id === cur) ? cur : repos[0].id));
  }, [repos]);
  const repo = repos.find((w) => w.id === wsId) || null;

  // base 후보 — git.branches(그 PC 에서 git 실행). 기본값 = 현재 체크아웃 브랜치.
  useEffect(() => {
    setBranches(null); setBase(null); setBranchErr(null);
    if (host == null || !repo?.localPath) return;
    let alive = true;
    taskService.listBranches(host, repo.localPath).then((b) => {
      if (!alive) return;
      setBranches(b);
      setBase(b.current || b.branches[0]?.name || null);
    }).catch((e: any) => { if (alive) setBranchErr(e instanceof TaskRpcError ? e.code : 'GH_ERROR'); });
    return () => { alive = false; };
  }, [host, repo?.localPath]);

  // 에이전트 — 그 PC 의 설치 상태(agents.list). 작업 선택지는 3종으로 한정.
  useEffect(() => {
    setAgents(null);
    if (host == null) return;
    let alive = true;
    daemonService.listAgents(host).then((r) => {
      if (!alive) return;
      const list = TASK_AGENTS.map((id) => r.agents.find((a) => a.id === id)).filter(Boolean) as DaemonAgent[];
      setAgents(list);
      setPick((p) => {
        if (Object.keys(p).length) return p;
        const first = list.find((a) => a.installed);
        return first ? { [first.id]: 1 } : {};
      });
    }).catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [host]);

  const totalRuns = Object.values(pick).reduce((n, v) => n + v, 0);
  const bytes = utf8Bytes(prompt);
  const capsOk = taskService.hostSupportsTasks(host);
  const canStart = !busy && host != null && !!repo?.localPath && !!base && prompt.trim().length > 0
    && bytes <= PROMPT_MAX_BYTES && totalRuns > 0 && totalRuns <= MAX_RUNS && capsOk !== false;

  const toggleAgent = (id: string) => {
    setPick((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else if (totalRuns < MAX_RUNS) next[id] = 1;
      return next;
    });
  };
  const step = (id: string, d: number) => {
    setPick((p) => {
      const cur = p[id] || 0;
      const v = cur + d;
      if (v < 1 || v > MAX_RUNS || (d > 0 && totalRuns >= MAX_RUNS)) return p;
      return { ...p, [id]: v };
    });
  };

  const start = useCallback(async () => {
    if (!canStart || host == null || !repo?.localPath || !base) return;
    mic.stopMic();
    setBusy(true); setErr(null);
    try {
      const r = await taskService.createTask(host, {
        opId, repo: repo.localPath, base, prompt,
        agents: Object.entries(pick).map(([id, count]) => ({ id, count })),
        copyEnv, fetch: fetchFirst, workspaceId: repo.id,
      });
      closeNewTask();
      void refreshHost(host);
      openTasksDashboard(r?.task?.id ? { taskId: r.task.id, host } : null);
    } catch (e: any) {
      setErr(e instanceof TaskRpcError ? e.code : String(e?.code || 'GH_ERROR'));
    } finally {
      setBusy(false);
    }
  }, [canStart, host, repo, base, prompt, pick, copyEnv, fetchFirst, opId, mic]);

  const hostRow = (runners || []).find((r) => r.deviceId === host) || null;
  const label = (s: string) => <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700', marginBottom: 6, marginTop: 12 }}>{s}</Text>;
  const chip = (key: string, text: string, on: boolean, onPress: () => void, disabled?: boolean) => (
    <PressableScale key={key} scaleTo={0.96} onPress={() => { if (!disabled) onPress(); }} baseOpacity={disabled ? 0.4 : 1}
      style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? C.textDim : C.borderControl, backgroundColor: on ? C.elevated2 : 'transparent', marginRight: 6 }}>
      <Text numberOfLines={1} style={{ color: on ? C.text : C.text2, fontSize: 12.5, maxWidth: 180 }}>{text}</Text>
    </PressableScale>
  );

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }}>
        {runners == null ? <ActivityIndicator color={C.text3} style={{ marginVertical: 20 }} /> : null}
        {runners && runners.length === 0 ? <Text style={{ color: C.text2, fontSize: 13, marginVertical: 12 }}>{TX.noHost}</Text> : null}
        {capsOk === false ? <Text style={{ color: C.text2, fontSize: 12.5, marginTop: 4 }}>{TX.pcNeedsUpdate}</Text> : null}

        {runners && runners.length >= 2 ? (
          <>
            {label(TX.pc)}
            <PressableScale scaleTo={0.98} onPress={() => setPcPicker(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl }}>
              <Laptop size={15} color={C.text2} weight="fill" />
              <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 13.5 }}>{hostRow?.deviceName || TX.pc}</Text>
              <CaretRight size={14} color={C.textDim} />
            </PressableScale>
          </>
        ) : null}

        {runners && runners.length ? (
          <>
            {label(TX.repo)}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {repos.map((w) => chip(w.id, S.wsDisplayName(w), w.id === wsId, () => setWsId(w.id)))}
            </ScrollView>

            {label(TX.base)}
            {branchErr ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{taskErrorText(TX, branchErr)}</Text>
              : !branches && repo ? <ActivityIndicator color={C.text3} style={{ alignSelf: 'flex-start' }} /> : null}
            {branches ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {branches.branches.map((b) => chip(b.name, b.name, b.name === base, () => setBase(b.name)))}
              </ScrollView>
            ) : null}
            {branches && branches.dirtyCount > 0 && base && base === branches.current ? (
              <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 6 }}>{TX.baseDirtyHint(base, branches.dirtyCount)}</Text>
            ) : null}

            {label(TX.prompt)}
            <View style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: 10, backgroundColor: C.elevated2, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 }}>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                onSelectionChange={(e) => { mic.selRef.current = e.nativeEvent.selection.start; }}
                placeholder={TX.promptPlaceholder}
                placeholderTextColor={C.textDim}
                multiline
                style={{ minHeight: 96, maxHeight: 220, color: C.text, fontSize: 14, textAlignVertical: 'top', padding: 0 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                {mic.listening ? <View style={{ flex: 1, height: 18 }}><MicSpectrum active levelRef={mic.micLevelRef} /></View> : <View style={{ flex: 1 }} />}
                <Text style={{ color: bytes > PROMPT_MAX_BYTES ? C.error : C.textDim, fontSize: 11 }}>{TX.promptBytes(bytes, PROMPT_MAX_BYTES)}</Text>
                {mic.micOk ? (
                  <PressableScale scaleTo={0.92} onPress={() => { void mic.toggleMic(); }} accessibilityLabel={TX.dictate}
                    style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: mic.listening ? C.elevated : 'transparent' }}>
                    <Microphone size={18} color={mic.listening ? C.text : C.text2} weight={mic.listening ? 'fill' : 'regular'} />
                  </PressableScale>
                ) : null}
              </View>
            </View>
            {mic.micErr ? <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 4 }}>{mic.micErr}</Text> : null}

            {label(TX.agents)}
            {!agents ? <ActivityIndicator color={C.text3} style={{ alignSelf: 'flex-start' }} /> : (
              <View style={{ gap: 6 }}>
                {agents.map((a) => {
                  const n = pick[a.id] || 0;
                  const on = n > 0;
                  return (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <PressableScale scaleTo={0.97} onPress={() => { if (a.installed) toggleAgent(a.id); }} baseOpacity={a.installed ? 1 : 0.4}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: on ? C.textDim : C.borderControl, backgroundColor: on ? C.elevated2 : 'transparent' }}>
                        <AgentLogo brand={a.id} size={14} />
                        <Text style={{ flex: 1, color: on ? C.text : C.text2, fontSize: 13 }}>{a.name || a.id}</Text>
                        {a.installed ? null : <Text style={{ color: C.textDim, fontSize: 11 }}>{TX.notInstalled}</Text>}
                      </PressableScale>
                      {on ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <PressableScale scaleTo={0.9} onPress={() => step(a.id, -1)} style={{ padding: 6 }} accessibilityLabel={TX.count}>
                            <Minus size={14} color={C.text2} />
                          </PressableScale>
                          <Text style={{ color: C.text, fontSize: 13, minWidth: 22, textAlign: 'center' }}>{`×${n}`}</Text>
                          <PressableScale scaleTo={0.9} onPress={() => step(a.id, 1)} style={{ padding: 6 }} accessibilityLabel={TX.count}>
                            <Plus size={14} color={C.text2} />
                          </PressableScale>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <PressableScale scaleTo={0.98} onPress={() => setAdvanced((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <CaretRight size={12} color={C.textDim} style={{ transform: [{ rotate: advanced ? '90deg' : '0deg' }] }} />
              <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700' }}>{TX.advanced}</Text>
            </PressableScale>
            {advanced ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Check label={TX.copyEnv} on={copyEnv} onPress={() => setCopyEnv((v) => !v)} />
                <Check label={TX.fetchFirst} on={fetchFirst} onPress={() => setFetchFirst((v) => !v)} />
              </View>
            ) : null}
          </>
        ) : null}
        {err ? <Text style={{ color: C.error, fontSize: 12.5, marginTop: 10 }}>{taskErrorText(TX, err)}</Text> : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn label={TX.cancel} onPress={closeNewTask} />
        <Btn label={TX.start} kind="primary" onPress={() => { void start(); }} disabled={!canStart} busy={busy} />
      </View>

      <PcPickerSheet
        visible={pcPicker}
        hosts={runners || []}
        onPick={(h) => { setPcPicker(false); setHost(h); setWsId(null); setPick({}); }}
        onClose={() => setPcPicker(false)}
      />
    </>
  );
}

function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableScale scaleTo={0.98} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {on ? <CheckSquare size={18} color={C.text} weight="fill" /> : <Square size={18} color={C.text2} />}
      <Text style={{ color: C.text2, fontSize: 13 }}>{label}</Text>
    </PressableScale>
  );
}
