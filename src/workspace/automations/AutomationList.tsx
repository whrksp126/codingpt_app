// AutomationList — `자동화` 장소의 목록(automation-design.md §5.9).
//
//  행 = 점(주의=error · 실행 중=작업 중 점 · 그 외 없음) + 이름 / 트리거 문장 / 만든 이 · 다음 실행 · 마지막 결과 /
//  [지금 실행][일시정지|재개][삭제] — 폰에는 호버·스와이프가 없으니 행동은 항상 노출한다.
//  색 규율: 선택은 무채색 명암(elevated2)만. 색은 상태 신호(주의 = error)에만.

import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import AgentLogo from '../AgentLogo';
import { agentDisplayName } from '../chat/composer';
import { Btn, StateDot, type Tone } from '../tasks/TaskCard';
import { tx } from '../../text';
import { AUTO_TEXT, type AutoText } from '../../text/automations';
import { TASKS_TEXT } from '../../text/tasks';
import * as i18n from '../../i18n/index.ts';
import type { AutoOutput, AutoRow, TriggerKey } from './automationsModel';
import type { Action } from '../../services/automationService';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);
const LOGO_BRANDS = new Set(['claude', 'codex', 'gemini', 'cursor-agent', 'opencode']);
const DOT: Record<AutoRow['dot'], Tone> = { error: 'error', spin: 'working', none: 'none' };

// ── 시간 표기(언어 중립 숫자 + 기존 원문 재사용 — 새 원문을 늘리지 않는다) ──
const pad = (n: number) => String(n).padStart(2, '0');
/** 미래/절대 시각 — 오늘이면 HH:MM, 아니면 M/D HH:MM. */
export function whenLabel(at: number | null | undefined, now: number): string {
  if (at == null || !Number.isFinite(at)) return '';
  const d = new Date(at);
  const n = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
/** 지난 시각 — "방금"·"{n}분 전"·"{n}시간 전"·"{n}일 전"(기존 원문). */
export function agoLabel(at: number | null | undefined, now: number): string {
  if (at == null || !Number.isFinite(at)) return '';
  const min = Math.floor(Math.max(0, now - at) / 60000);
  if (min < 1) return i18n.t('방금');
  if (min < 60) return i18n.t('{n}분 전', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('{n}시간 전', { n: h });
  return i18n.t('{n}일 전', { n: Math.floor(h / 24) });
}

/** 트리거 한 줄 — `tt(triggerKey, triggerVars)`(§8.2). cron 은 원문 그대로. */
export function triggerText(key: TriggerKey, vars: AutoRow['triggerVars'], now: number, T: AutoText = TA): string {
  switch (key) {
    case 'trigSchedule': return T.trigSchedule(vars.cron || '', vars.tz || '');
    case 'trigOnce': return T.trigOnce(whenLabel(vars.at ?? null, now));
    case 'trigCommits': return T.trigCommits(vars.branch || '');
    case 'trigIssues': return T.trigIssues(vars.labels || '');
    case 'trigCi': return T.trigCi;
    case 'trigReviews': return T.trigReviews;
    case 'trigTaskEvent': return T.trigTaskEvent(vars.event || '');
    default: return '';
  }
}

export function actionLabel(a: Action, T: AutoText = TA): string {
  return a.type === 'task.create' ? T.actTaskCreate : a.type === 'terminal.prompt' ? T.actPrompt : T.actNotify;
}

export function creatorText(r: Pick<AutoRow, 'creator' | 'creatorAgent'>, T: AutoText = TA): string {
  if (r.creator === 'agent') return T.madeByAgent(agentDisplayName(r.creatorAgent || '') || r.creatorAgent || '—');
  return r.creator === 'dispatch' ? T.madeByDispatch : T.madeByUser;
}

/** 부제 — 만든 이 · 다음 실행 · 마지막 결과. 일시정지 사유가 있으면 그것이 먼저. */
export function subText(r: AutoRow, now: number, T: AutoText = TA): string {
  const parts: string[] = [creatorText(r, T)];
  const reason = r.item.pausedReason;
  if (r.group === 'paused' && reason === 'error') parts.push(T.pausedByError);
  else if (reason === 'limit') parts.push(T.pausedByLimit);
  else if (reason === 'server') parts.push(T.pausedByServer);
  if (r.group === 'active') parts.push(r.nextRunAt != null ? T.nextRun(whenLabel(r.nextRunAt, now)) : T.noNextRun);
  if (r.lastOk != null) {
    const when = agoLabel(r.lastAt, now);
    if (r.lastOk && r.taskIds.length) parts.push(`${T.lastOk(when)} · ${T.lastCreatedTasks(r.taskIds.length)}`);
    else parts.push(r.lastOk ? T.lastOk(when) : T.lastFailed(when));
  }
  return parts.join(' · ');
}

export type RowAction = 'runNow' | 'pause' | 'resume' | 'delete';

export default function AutomationList({ model, now, refreshing, onRefresh, onOpen, onAction, busy, selectedId, header, empty }: {
  model: AutoOutput;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (r: AutoRow) => void;
  onAction: (r: AutoRow, a: RowAction) => void;
  busy: { id: string; a: RowAction } | null;
  selectedId?: string | null;
  /** 배너(전체 일시정지·PC 업데이트·오프라인). */
  header?: React.ReactNode;
  /** 빈 상태(목록이 0개일 때). */
  empty?: React.ReactNode;
}) {
  const C = v2.colors;
  const [pausedOpen, setPausedOpen] = useState(false);
  const { active, paused } = model.groups;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text3} colors={[C.text3]} progressBackgroundColor={C.surface} />}
    >
      {header}
      {model.rows.length === 0 ? empty : null}
      {active.length ? <GroupHead label={TA.groupActive} n={active.length} /> : null}
      {active.map((r) => (
        <AutoRowView key={r.id} r={r} now={now} selected={selectedId === r.id} busy={busy && busy.id === r.id ? busy.a : null}
          onPress={() => onOpen(r)} onAction={(a) => onAction(r, a)} />
      ))}
      {paused.length ? (
        <PressableScale scaleTo={0.98} onPress={() => { haptic.select(); setPausedOpen((v) => !v); }} accessibilityRole="button" accessibilityState={{ expanded: pausedOpen }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 2, marginTop: 6 }}>
          <View style={{ transform: [{ rotate: pausedOpen ? '90deg' : '0deg' }] }}><CaretRight size={13} color={C.textDim} weight="bold" /></View>
          <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700' }}>{`${TA.groupPaused} (${paused.length})`}</Text>
        </PressableScale>
      ) : null}
      {pausedOpen ? paused.map((r) => (
        <AutoRowView key={r.id} r={r} now={now} selected={selectedId === r.id} busy={busy && busy.id === r.id ? busy.a : null}
          onPress={() => onOpen(r)} onAction={(a) => onAction(r, a)} />
      )) : null}
      {refreshing && !model.rows.length ? <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center', marginTop: 16 }}>{TT.checking}</Text> : null}
    </ScrollView>
  );
}

function GroupHead({ label, n }: { label: string; n: number }) {
  const C = v2.colors;
  return (
    <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 2 }}>{`${label} (${n})`}</Text>
  );
}

function AutoRowView({ r, now, selected, busy, onPress, onAction }: {
  r: AutoRow; now: number; selected: boolean; busy: RowAction | null; onPress: () => void; onAction: (a: RowAction) => void;
}) {
  const C = v2.colors;
  const isPaused = r.group === 'paused';
  return (
    <PressableScale scaleTo={0.98} onPress={() => { haptic.select(); onPress(); }} accessibilityRole="button"
      style={{
        marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: v2.radius.md,
        borderWidth: 1, borderColor: C.border, backgroundColor: selected ? C.elevated2 : C.elevated,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StateDot tone={DOT[r.dot]} />
        <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }}>{r.name || r.id}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: C.text2, fontSize: 12, marginTop: 4, marginLeft: 20, fontFamily: r.triggerKey === 'trigSchedule' ? v2.font.mono : undefined }}>
        {triggerText(r.triggerKey, r.triggerVars, now)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, marginLeft: 20 }}>
        {r.creator === 'agent' && r.creatorAgent && LOGO_BRANDS.has(r.creatorAgent) ? <AgentLogo brand={r.creatorAgent} size={12} /> : null}
        <Text numberOfLines={2} style={{ flex: 1, color: C.textDim, fontSize: 11.5 }}>{subText(r, now)}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
        <Btn small label={TA.runNow} busy={busy === 'runNow'} onPress={() => onAction('runNow')} />
        {isPaused
          ? <Btn small label={TA.resume} busy={busy === 'resume'} onPress={() => onAction('resume')} />
          : <Btn small label={TA.pause} busy={busy === 'pause'} onPress={() => onAction('pause')} />}
        <Btn small kind="danger" label={TA.deleteAuto} busy={busy === 'delete'} onPress={() => onAction('delete')} />
      </View>
    </PressableScale>
  );
}
