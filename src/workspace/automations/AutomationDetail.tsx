// AutomationDetail — 자동화 상세(automation-design.md §5.9): 이름(탭 → 인라인 편집) · 트리거 · 액션 단계 ·
//  제한 · 상태(다음/마지막/오늘 n/d) · 실행 기록 꼬리 · [지금 실행][일시정지|재개][삭제].
//
//  데이터: 목록 스토어의 항목을 먼저 그리고(즉시), auto.get 으로 기록(log)·최신 값을 받는다. automations.changed 가
//  이 id 를 말하면 다시 부른다. 템플릿 본문(prompt/text)은 봉인 경로로만 온다 — 접힘이 기본.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import { TaskRpcError } from '../../services/taskService';
import automationService, { type AutomationLite, type AutoLogLine, type Action } from '../../services/automationService';
import { tx } from '../../text';
import { AUTO_TEXT } from '../../text/automations';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import { Btn, StateDot, type Tone } from '../tasks/TaskCard';
import { buildAutomationsModel } from './automationsModel';
import { triggerText, actionLabel, creatorText, whenLabel, agoLabel, type RowAction } from './AutomationList';
import { getAutoBucket, subscribeAutomationsChanged, useAutomationsVersion } from './useAutomations';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);

export default function AutomationDetail({ host, id, now, onAction, busy, onRenamed }: {
  host: number;
  id: string;
  now: number;
  onAction: (item: AutomationLite, a: RowAction) => void;
  busy: RowAction | null;
  onRenamed: () => void;
}) {
  const C = v2.colors;
  useAutomationsVersion();
  const listed = (getAutoBucket(host)?.items || []).find((x) => x.id === id) || null;
  const [full, setFull] = useState<AutomationLite | null>(null);
  const [log, setLog] = useState<AutoLogLine[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const item = full && listed ? (full.updatedAt >= listed.updatedAt ? full : listed) : (full || listed);

  const load = useCallback(() => {
    automationService.getAutomation(host, id)
      .then((r) => { setFull(r.automation || null); setLog(Array.isArray(r.log) ? r.log : []); setErr(null); })
      .catch((e: any) => setErr(e instanceof TaskRpcError ? e.code : 'AUTO_ERROR'));
  }, [host, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeAutomationsChanged((h, ids) => { if (h === host && (!ids.length || ids.includes(id))) load(); }), [host, id, load]);

  // ── 이름 인라인 편집 ──
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const commitName = useCallback(async () => {
    const next = name.trim();
    setEditing(false);
    if (!item || !next || next === item.name) return;
    setSaving(true);
    try {
      const r = await automationService.updateAutomation(host, item.id, { name: next.slice(0, 80) });
      if (r?.automation) setFull(r.automation);
      onRenamed();
    } catch (e: any) { setErr(e instanceof TaskRpcError ? e.code : 'AUTO_ERROR'); }
    finally { setSaving(false); }
  }, [name, item, host, onRenamed]);

  if (!item) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center' }}>{err ? taskErrorText(TT, err) : TT.checking}</Text>
      </View>
    );
  }
  const row = buildAutomationsModel({ now, items: [item], paused: false, hostOnline: true }).rows[0];
  const s = item.state;
  const isPaused = item.paused || !item.enabled;
  const tone: Tone = row.dot === 'error' ? 'error' : row.dot === 'spin' ? 'working' : 'none';
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled">
      {/* 이름 — 탭하면 편집(auto.update {name}) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StateDot tone={tone} />
        {editing ? (
          <TextInput value={name} onChangeText={setName} autoFocus selectTextOnFocus maxLength={80}
            onSubmitEditing={() => { void commitName(); }} onBlur={() => { void commitName(); }} accessibilityLabel={TA.rename}
            style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '700', padding: 0, borderBottomWidth: 1, borderBottomColor: C.borderControl }} />
        ) : (
          <PressableScale scaleTo={0.98} onPress={() => { haptic.select(); setName(item.name); setEditing(true); }} accessibilityRole="button" accessibilityLabel={TA.rename}
            style={{ flex: 1, opacity: saving ? 0.5 : 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{item.name || item.id}</Text>
          </PressableScale>
        )}
      </View>
      <Text style={{ color: C.textDim, fontSize: 12, marginTop: -6 }}>{creatorText(row)}</Text>
      {err ? <Text style={{ color: C.error, fontSize: 12.5 }}>{taskErrorText(TT, err)}</Text> : null}

      {/* 트리거 */}
      <Card>
        <Text style={{ color: C.text, fontSize: 13.5, fontFamily: row.triggerKey === 'trigSchedule' ? v2.font.mono : undefined }}>
          {triggerText(row.triggerKey, row.triggerVars, now)}
        </Text>
        {row.triggerVars.repo ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono }}>~/{row.triggerVars.repo}</Text> : null}
      </Card>

      {/* 액션 단계 */}
      <View style={{ gap: 6 }}>
        {(item.actions || []).map((a, i) => <ActionStep key={i} n={i + 1} a={a} />)}
      </View>

      {/* 제한 · 상태 */}
      <Card>
        <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.guards}</Text>
        <Text style={{ color: C.text2, fontSize: 12.5 }}>{TA.runsToday(s?.runsToday || 0, item.guards?.maxRunsPerDay || 10)}</Text>
        <Text style={{ color: C.text2, fontSize: 12.5 }}>
          {isPaused ? TA.groupPaused : s?.nextRunAt != null ? TA.nextRun(whenLabel(s.nextRunAt, now)) : TA.noNextRun}
        </Text>
        {s?.lastResult ? (
          <Text style={{ color: s.lastResult.ok === false ? C.error : C.text2, fontSize: 12.5 }}>
            {s.lastResult.ok === false
              ? `${TA.lastFailed(agoLabel(s.lastResult.at, now))}${s.lastResult.code ? ` · ${taskErrorText(TT, s.lastResult.code)}` : ''}`
              : `${TA.lastOk(agoLabel(s.lastResult.at, now))}${s.lastResult.taskIds?.length ? ` · ${TA.lastCreatedTasks(s.lastResult.taskIds.length)}` : ''}`}
          </Text>
        ) : null}
        {item.pausedReason === 'error' ? <Text style={{ color: C.error, fontSize: 12 }}>{TA.pausedByError}</Text> : null}
        {item.pausedReason === 'limit' ? <Text style={{ color: C.warn, fontSize: 12 }}>{TA.pausedByLimit}</Text> : null}
        {item.pausedReason === 'server' ? <Text style={{ color: C.textDim, fontSize: 12 }}>{TA.pausedByServer}</Text> : null}
      </Card>

      {/* 행동 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Btn kind="primary" label={TA.runNow} busy={busy === 'runNow'} onPress={() => onAction(item, 'runNow')} />
        {isPaused
          ? <Btn label={TA.resume} busy={busy === 'resume'} onPress={() => onAction(item, 'resume')} />
          : <Btn label={TA.pause} busy={busy === 'pause'} onPress={() => onAction(item, 'pause')} />}
        <Btn kind="danger" label={TA.deleteAuto} busy={busy === 'delete'} onPress={() => onAction(item, 'delete')} />
      </View>

      {/* 실행 기록 꼬리 50줄 */}
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.auditLog}</Text>
        {log.length === 0 ? <Text style={{ color: C.textDim, fontSize: 12 }}>—</Text> : null}
        {log.slice(-50).reverse().map((l, i) => (
          <Text key={`${l.at}-${i}`} numberOfLines={2} style={{ color: l.ok === false ? C.error : C.text2, fontSize: 11, fontFamily: v2.font.mono }}>
            {`${whenLabel(l.at, now)}  ${l.stage}${l.type ? ` ${l.type}` : ''}${l.code ? ` ${l.code}` : ''}`}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const C = v2.colors;
  return <View style={{ padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, gap: 4 }}>{children}</View>;
}

/** 액션 단계 — 번호 + 유형 + 대상 한 줄, 템플릿은 접힘(탭하면 펼침). */
function ActionStep({ n, a }: { n: number; a: Action }) {
  const C = v2.colors;
  const [open, setOpen] = useState(false);
  const target = a.type === 'task.create'
    ? `~/${a.repo}${a.subdir ? `/${a.subdir}` : ''} · ${(a.agents || []).map((x) => `${x.id}×${x.count}`).join(' ')}`
    : a.type === 'terminal.prompt'
      ? ('taskId' in a.target ? a.target.taskId : 'cwd' in a.target ? `~/${a.target.cwd}` : '')
      : a.title;
  const body = a.type === 'task.create' ? a.prompt : a.type === 'terminal.prompt' ? a.text : a.subtitle || '';
  return (
    <Card>
      <PressableScale scaleTo={0.98} onPress={() => { haptic.select(); setOpen((v) => !v); }} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.stepN(n)}</Text>
          <Text style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: '600' }}>{actionLabel(a)}</Text>
          {body ? <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><CaretRight size={12} color={C.textDim} weight="bold" /></View> : null}
        </View>
        {target ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono }}>{target}</Text> : null}
        {open && body ? <Text selectable style={{ color: C.text2, fontSize: 11.5, fontFamily: v2.font.mono, marginTop: 4 }}>{body}</Text> : null}
      </PressableScale>
    </Card>
  );
}
