// DispatchSheet — 한 줄 지시 시트(automation-design.md §3). 셸에 1회 마운트, dispatchFlow.openDispatch() 로 연다
//  (진행 현황 헤더 · 자동화 빈 상태 · 팔레트 dispatch.open).
//
// 단계: 문장 입력(받아쓰기) → [계획] → "PC 정보 수집 중 (n/d)" → "계획 중 · Claude" → 플랜 카드 → [시작].
//  [시작] 은 task.create(origin dispatch)·auto.create(createdBy dispatch) 를 순서대로 부르고, 첫 작업(없으면 첫 자동화)
//  으로 들어간다. opId 는 카드가 떠 있는 동안 항목마다 같은 값(다시 눌러도 데몬이 재생으로 받는다).

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Microphone } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import MicSpectrum from '../chat/MicSpectrum';
import { useMicDictation } from '../../hooks/useMicDictation';
import daemonService from '../../services/daemonService';
import taskService, { TaskRpcError, utf8Bytes } from '../../services/taskService';
import automationService, { hostSupportsDispatch } from '../../services/automationService';
import dispatchService, { type HostCatalog, type Plan } from '../../services/dispatchService';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { agentDisplayName } from '../chat/composer';
import { tx } from '../../text';
import { AUTO_TEXT } from '../../text/automations';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import { Btn, SheetFrame } from '../tasks/TaskCard';
import { openTasksDashboard, showTasksToast } from '../tasks/tasksUi';
import { refreshHost } from '../tasks/useTasks';
import { openAutomations } from '../automations/automationsUi';
import { refreshAutoHost } from '../automations/useAutomations';
import PlanCard from './PlanCard';
import {
  subscribeDispatchSheet, getDispatchSheet, closeDispatch, runPlan, toEditablePlan, canStart, startEditablePlan,
  type CatalogFailure, type DispatchHost, type EditablePlan, type PlanPhase,
} from './dispatchFlow';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);
const INSTRUCTION_MAX_BYTES = 4000;

export default function DispatchSheet() {
  const st = useSyncExternalStore(subscribeDispatchSheet, getDispatchSheet);
  return (
    <SheetFrame visible={st.open} onClose={closeDispatch} title={TA.dispatch}>
      {st.open ? <Body key={st.gen} prefill={st.prefill} /> : null}
    </SheetFrame>
  );
}

type Phase = { kind: 'input' } | PlanPhase | { kind: 'plan' } | { kind: 'starting' };

function Body({ prefill }: { prefill: string }) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [text, setText] = useState(prefill);
  const mic = useMicDictation(text, setText, INSTRUCTION_MAX_BYTES);
  const [hosts, setHosts] = useState<DispatchHost[] | null>(null);
  const [anyOnline, setAnyOnline] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planId, setPlanId] = useState<string>('');
  const [catalogs, setCatalogs] = useState<HostCatalog[]>([]);
  const [failed, setFailed] = useState<CatalogFailure[]>([]);
  const [ep, setEp] = useState<EditablePlan | null>(null);
  const opIds = useRef<Record<string, string>>({});
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  // 대상 PC = 온라인 로컬 러너 ∧ dispatch.v1(§3.1 1).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await taskService.refreshHostCaps();
        const st = await daemonService.getStatus();
        const local = (st.runners || []).filter((r) => r && r.kind === 'local' && r.deviceId != null);
        if (!alive) return;
        setAnyOnline(local.length > 0);
        setHosts(local.filter((r) => hostSupportsDispatch(r.deviceId) === true).map((r) => ({ id: Number(r.deviceId), name: String(r.deviceName || '') })));
      } catch (_) { if (alive) { setHosts([]); setAnyOnline(false); } }
    })();
    return () => { alive = false; };
  }, []);

  const bytes = utf8Bytes(text);
  const planning = phase.kind === 'collecting' || phase.kind === 'planning';
  const canPlan = !!hosts?.length && text.trim().length > 0 && bytes <= INSTRUCTION_MAX_BYTES && !planning && phase.kind !== 'starting';

  const doPlan = useCallback(async () => {
    if (!hosts?.length) return;
    mic.stopMic();
    setErr(null); setPlan(null); setEp(null);
    setPhase({ kind: 'collecting', done: 0, total: hosts.length });
    try {
      const r = await runPlan({
        instruction: text.trim(),
        hosts,
        activeId: Number(S.resolvedDeviceId()) || null,
        deps: {
          getCatalog: (h) => dispatchService.getCatalog(h),
          startPlan: (h, p) => dispatchService.startPlan(h, p),
          getPlan: (h, id) => dispatchService.getPlan(h, id),
          newOpId: taskService.newOpId,
        },
        onPhase: (p) => { if (!cancelled.current) setPhase(p); },
        isCancelled: () => cancelled.current,
      });
      if (cancelled.current) return;
      setPlan(r.plan); setPlanId(r.planId); setCatalogs(r.catalogs); setFailed(r.failed);
      const next = toEditablePlan(r.plan, r.catalogs);
      opIds.current = Object.fromEntries(next.tasks.map((t) => [t.key, taskService.newOpId()]));
      setEp(next);
      setPhase({ kind: 'plan' });
    } catch (e: any) {
      if (cancelled.current) return;
      if (e?.code === 'CATALOG_FAILED' && Array.isArray(e.failed)) setFailed(e.failed);
      setErr(e instanceof TaskRpcError ? e.code : String(e?.code || 'ERROR'));
      setPhase({ kind: 'input' });
    }
  }, [hosts, text, mic, S]);

  const doStart = useCallback(async () => {
    if (!ep || !canStart(ep)) return;
    setPhase({ kind: 'starting' }); setErr(null);
    const r = await startEditablePlan(ep, planId, {
      createTask: (h, p) => taskService.createTask(h, p),
      createAutomation: (h, draft, createdBy) => automationService.createAutomation(h, draft, createdBy),
      newOpId: taskService.newOpId,
    }, opIds.current);
    if (cancelled.current) return;
    for (const t of r.tasks) void refreshHost(t.host);
    for (const a of r.automations) void refreshAutoHost(a.host);
    if (!r.tasks.length && !r.automations.length) {
      setErr(r.errors[0]?.code || 'ERROR');
      setPhase({ kind: 'plan' });
      return;
    }
    closeDispatch();
    if (r.tasks.length) openTasksDashboard({ taskId: r.tasks[0].taskId, host: r.tasks[0].host });
    else openAutomations({ id: r.automations[0].id, host: r.automations[0].host });
    if (r.errors.length) showTasksToast(taskErrorText(TT, r.errors[0].code));
  }, [ep, planId]);

  const status = useMemo(() => {
    if (phase.kind === 'collecting') return TA.collecting(phase.done, phase.total);
    if (phase.kind === 'planning') return phase.agent ? TA.planning(agentDisplayName(phase.agent) || phase.agent) : TA.plan;
    return null;
  }, [phase]);

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6, gap: 10 }}>
        {hosts == null ? <ActivityIndicator color={C.text3} style={{ marginVertical: 12 }} /> : null}
        {hosts && hosts.length === 0 ? (
          <Text style={{ color: C.text2, fontSize: 13 }}>{anyOnline ? TT.pcNeedsUpdate : TT.noHost}</Text>
        ) : null}
        <View style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: 10, backgroundColor: C.elevated2, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSelectionChange={(e) => { mic.selRef.current = e.nativeEvent.selection.start; }}
            placeholder={TA.dispatchPlaceholder}
            placeholderTextColor={C.textDim}
            multiline
            editable={!planning && phase.kind !== 'starting'}
            accessibilityLabel={TA.dispatch}
            style={{ minHeight: phase.kind === 'plan' ? 44 : 84, maxHeight: 160, color: C.text, fontSize: 14, textAlignVertical: 'top', padding: 0 }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {mic.listening ? <View style={{ flex: 1, height: 18 }}><MicSpectrum active levelRef={mic.micLevelRef} /></View> : <View style={{ flex: 1 }} />}
            {bytes > INSTRUCTION_MAX_BYTES ? <Text style={{ color: C.error, fontSize: 11 }}>{TT.promptBytes(bytes, INSTRUCTION_MAX_BYTES)}</Text> : null}
            {mic.micOk ? (
              <PressableScale scaleTo={0.92} onPress={() => { void mic.toggleMic(); }} accessibilityLabel={TT.dictate}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: mic.listening ? C.elevated : 'transparent' }}>
                <Microphone size={18} color={mic.listening ? C.text : C.text2} weight={mic.listening ? 'fill' : 'regular'} />
              </PressableScale>
            ) : null}
          </View>
        </View>
        {mic.micErr ? <Text style={{ color: C.textDim, fontSize: 11.5 }}>{mic.micErr}</Text> : null}
        {status ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={C.text3} />
            <Text style={{ color: C.text2, fontSize: 12.5 }}>{status}</Text>
          </View>
        ) : null}
        {phase.kind === 'input' && failed.length ? failed.map((f) => (
          <Text key={`f${f.host}`} style={{ color: C.textDim, fontSize: 12 }}>{TA.catalogFailed(f.name)}</Text>
        )) : null}
        {plan && ep && (phase.kind === 'plan' || phase.kind === 'starting') ? (
          <PlanCard plan={plan} ep={ep} onChange={setEp} catalogs={catalogs} failed={failed} now={Date.now()} />
        ) : null}
        {err ? <Text style={{ color: C.error, fontSize: 12.5 }}>{taskErrorText(TT, err)}</Text> : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn label={TT.cancel} onPress={closeDispatch} />
        {plan && ep && (phase.kind === 'plan' || phase.kind === 'starting') ? (
          <>
            <Btn label={TA.replan} onPress={() => { void doPlan(); }} disabled={!canPlan} />
            <Btn label={TT.start} kind="primary" onPress={() => { void doStart(); }} disabled={!canStart(ep)} busy={phase.kind === 'starting'} />
          </>
        ) : (
          <Btn label={TA.plan} kind="primary" onPress={() => { void doPlan(); }} disabled={!canPlan} busy={planning} />
        )}
      </View>
    </>
  );
}
