// PlanCard — 한 줄 지시의 플랜 카드(automation-design.md §3.4). 결정권은 사용자에게 있다: 항목마다 PC·저장소·
//  에이전트 칩 ×n·프롬프트(접힘, 편집 가능)·이유를 고치고 [시작] 한 번. 자동 실행 없음.
//
//  색 규율: 선택 칩은 무채색 명암(elevated2 + textDim 테두리)만. `간단 매칭` pill 도 무채색. 저장소가 안 정해진 항목은
//  테두리를 text 명암으로 올려 강조한다(경고색 아님 — 상태가 아니라 해야 할 일이다).

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { CaretRight, CheckSquare, Square, Minus, Plus, Check } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import PressableRow from '../../components/ui/PressableRow';
import { haptic } from '../../animations/haptics';
import AgentLogo from '../AgentLogo';
import { agentDisplayName } from '../chat/composer';
import { tx } from '../../text';
import { AUTO_TEXT } from '../../text/automations';
import { TASKS_TEXT } from '../../text/tasks';
import type { HostCatalog, Plan } from '../../services/dispatchService';
import { triggerKeyOf, triggerVarsOf } from '../automations/automationsModel';
import { triggerText, actionLabel } from '../automations/AutomationList';
import {
  MAX_RUNS, PLAN_AGENTS, fallbackKey, pickWorkspace, totalRuns,
  type CatalogFailure, type EditablePlan, type EditTask,
} from './dispatchFlow';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);

export default function PlanCard({ plan, ep, onChange, catalogs, failed, now }: {
  plan: Plan;
  ep: EditablePlan;
  onChange: (next: EditablePlan) => void;
  catalogs: HostCatalog[];
  failed: CatalogFailure[];
  now: number;
}) {
  const C = v2.colors;
  const fallback = plan.planner?.mode === 'fallback';
  const setTask = (key: string, fn: (t: EditTask) => EditTask) => onChange({ ...ep, tasks: ep.tasks.map((t) => (t.key === key ? fn(t) : t)) });
  const runs = totalRuns(ep);
  return (
    <View style={{ gap: 10 }}>
      {failed.map((f) => (
        <Text key={`f${f.host}`} style={{ color: C.textDim, fontSize: 12 }}>{TA.catalogFailed(f.name)}</Text>
      ))}
      {fallback ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: v2.radius.pill, backgroundColor: C.elevated2 }}>
            <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '600' }}>{TA.simpleMatch}</Text>
          </View>
          <Text style={{ flex: 1, color: C.textDim, fontSize: 12 }}>{TA[fallbackKey(plan.planner?.fallbackReason)]}</Text>
        </View>
      ) : null}
      {plan.questions?.length ? (
        <View style={{ padding: 10, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, gap: 4 }}>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>{TA.planQuestions}</Text>
          {plan.questions.map((q, i) => <Text key={i} style={{ color: C.text, fontSize: 12.5 }}>{q}</Text>)}
        </View>
      ) : null}
      {plan.summary ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.planSummary}</Text>
          <Text style={{ color: C.text, fontSize: 13 }}>{plan.summary}</Text>
        </View>
      ) : null}

      {ep.tasks.length ? <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.planTasks}</Text> : null}
      {ep.tasks.map((t) => (
        <TaskItem key={t.key} t={t} catalogs={catalogs} runs={runs} onChange={(fn) => setTask(t.key, fn)} />
      ))}

      {ep.automations.length ? <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.planAutomations}</Text> : null}
      {ep.automations.map((a) => {
        const key = triggerKeyOf(a.draft?.trigger);
        const acts = (a.draft?.actions || []).map((x) => actionLabel(x)).join(' → ');
        const hostName = catalogs.find((c) => c.host === a.host)?.hostName || '';
        return (
          <PressableScale key={a.key} scaleTo={0.98} accessibilityRole="checkbox" accessibilityState={{ checked: a.include }}
            onPress={() => { haptic.select(); onChange({ ...ep, automations: ep.automations.map((x) => (x.key === a.key ? { ...x, include: !x.include } : x)) }); }}
            style={{ padding: 10, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {a.include ? <CheckSquare size={18} color={C.text} weight="fill" /> : <Square size={18} color={C.text2} />}
              <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: '600' }}>{a.draft?.name || TA.automations}</Text>
              <Text style={{ color: C.textDim, fontSize: 11 }}>{TA.include}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: C.text2, fontSize: 12, marginLeft: 26 }}>{triggerText(key, triggerVarsOf(a.draft?.trigger), now)}</Text>
            {acts ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginLeft: 26 }}>{acts}{hostName ? ` · ${hostName}` : ''}</Text> : null}
            {a.why ? <Text numberOfLines={2} style={{ color: C.textDim, fontSize: 11.5, marginLeft: 26 }}>{a.why}</Text> : null}
          </PressableScale>
        );
      })}
      {runs > MAX_RUNS ? <Text style={{ color: C.error, fontSize: 12 }}>{TT.errTaskLimit}</Text> : null}
    </View>
  );
}

function TaskItem({ t, catalogs, runs, onChange }: {
  t: EditTask; catalogs: HostCatalog[]; runs: number; onChange: (fn: (t: EditTask) => EditTask) => void;
}) {
  const C = v2.colors;
  const [promptOpen, setPromptOpen] = useState(false);
  const cat = catalogs.find((c) => c.host === t.host) || null;
  const needRepo = !t.workspaceId;
  const installed = (cat?.agents || []).filter((a) => a.installed).map((a) => a.id);
  const agentIds = PLAN_AGENTS.filter((id) => installed.includes(id) || t.agents.some((a) => a.id === id));
  const countOf = (id: string) => t.agents.find((a) => a.id === id)?.count || 0;
  const toggle = (id: string) => onChange((cur) => {
    const has = cur.agents.some((a) => a.id === id);
    if (has) return { ...cur, agents: cur.agents.filter((a) => a.id !== id) };
    if (runs >= MAX_RUNS) return cur;
    return { ...cur, agents: [...cur.agents, { id, count: 1 }] };
  });
  const step = (id: string, d: number) => onChange((cur) => {
    const n = (cur.agents.find((a) => a.id === id)?.count || 0) + d;
    if (n < 1 || n > MAX_RUNS || (d > 0 && runs >= MAX_RUNS)) return cur;
    return { ...cur, agents: cur.agents.map((a) => (a.id === id ? { ...a, count: n } : a)) };
  });
  const chip = (key: string, text: string, on: boolean, onPress: () => void, disabled?: boolean) => (
    <PressableScale key={key} scaleTo={0.96} onPress={() => { if (!disabled) { haptic.select(); onPress(); } }} baseOpacity={disabled ? 0.4 : 1}
      accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: v2.radius.xs, backgroundColor: C.elevated2, marginRight: 6 }}>
      <Text numberOfLines={1} style={{ color: on ? C.text : C.text2, fontWeight: on ? '600' : '400', fontSize: 12, maxWidth: 200 }}>{text}</Text>
    </PressableScale>
  );
  return (
    <View style={{ padding: 10, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: needRepo ? C.text2 : C.border, backgroundColor: C.elevated, gap: 7 }}>
      <Text numberOfLines={2} style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }}>{t.title || t.prompt.slice(0, 60)}</Text>
      {catalogs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {catalogs.map((c) => chip(`h${c.host}`, c.hostName, c.host === t.host, () => onChange((cur) => (
            cur.host === c.host ? cur : { ...cur, host: c.host, workspaceId: null, repo: null, subdir: '', base: null }
          ))))}
        </ScrollView>
      ) : null}
      {needRepo ? <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{TA.pickRepo}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {(cat?.workspaces || []).map((w) => chip(w.id, w.name + (t.workspaceId === w.id && t.subdir ? ` / ${t.subdir}` : ''), t.workspaceId === w.id,
          () => onChange((cur) => pickWorkspace(cur, t.host, w.id, catalogs))))}
      </ScrollView>
      <View style={{ gap: 5 }}>
        {agentIds.map((id) => {
          const n = countOf(id);
          const on = n > 0;
          const ok = installed.includes(id);
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PressableRow onPress={() => { haptic.select(); toggle(id); }} disabled={!ok} selected={on} minHeight={0}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6 }}>
                <AgentLogo brand={id} size={13} />
                <Text style={{ flex: 1, color: on ? C.text : C.text2, fontSize: 12.5 }}>{agentDisplayName(id) || id}</Text>
                {ok ? (on ? <Check size={13} color={C.text} weight="bold" /> : null) : <Text style={{ color: C.textDim, fontSize: 11 }}>{TT.notInstalled}</Text>}
              </PressableRow>
              {on ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <PressableScale scaleTo={0.9} onPress={() => step(id, -1)} style={{ padding: 6 }} accessibilityLabel={TT.count}><Minus size={13} color={C.text2} /></PressableScale>
                  <Text style={{ color: C.text, fontSize: 12.5, minWidth: 22, textAlign: 'center' }}>{`×${n}`}</Text>
                  <PressableScale scaleTo={0.9} onPress={() => step(id, 1)} style={{ padding: 6 }} accessibilityLabel={TT.count}><Plus size={13} color={C.text2} /></PressableScale>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <PressableScale scaleTo={0.98} onPress={() => { haptic.select(); setPromptOpen((v) => !v); }} accessibilityRole="button" accessibilityState={{ expanded: promptOpen }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ transform: [{ rotate: promptOpen ? '90deg' : '0deg' }] }}><CaretRight size={12} color={C.textDim} weight="bold" /></View>
        <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700' }}>{TT.prompt}</Text>
      </PressableScale>
      {promptOpen ? (
        <TextInput value={t.prompt} onChangeText={(v) => onChange((cur) => ({ ...cur, prompt: v }))} multiline
          style={{ minHeight: 72, maxHeight: 200, color: C.text, fontSize: v2.font.size.body, textAlignVertical: 'top', borderWidth: 1, borderColor: C.borderControl, borderRadius: v2.radius.md, backgroundColor: C.elevated, padding: 8 }} />
      ) : null}
      {t.why ? <Text numberOfLines={2} style={{ color: C.textDim, fontSize: 11.5 }}>{`${TA.why}: ${t.why}`}</Text> : null}
    </View>
  );
}
