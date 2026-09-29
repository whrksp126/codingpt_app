// TaskCard — 현황판의 카드 한 장 + 작업 화면들이 같이 쓰는 작은 UI 조각(버튼·상태 점·바텀시트 틀).
//
// 카드 = §5.4: [로고] 에이전트 · PC · (워크스페이스 | 작업 제목 · 브랜치) / 상태 한 줄 / 그룹별 행동.
//  색 규율(설계 §6.0): 선택·활성은 무채색 명암만. 색은 **상태 신호**에만 — warn=입력 대기, error=실패·CI 실패,
//  cta=PR 머지 가능·완료. 작업 중은 색 없이 text3 점 두 개가 교차 페이드한다.
//  모션(§6.8): 카드 id 의 **최초 마운트에만** 등장 애니메이션(opacity+translateY, 스태거 20ms·최대 8장) —
//  tasks.changed 로 다시 그릴 때마다 재생하면 목록이 계속 깜빡인다. seen 집합은 Host 수명 동안 유지된다.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, Modal, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalWindow } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { KeyAssistOverlay } from '../../components/keyboard/KeyAssist';
import { haptic } from '../../animations/haptics';
import AgentLogo from '../AgentLogo';
import { tx } from '../../text';
import { TASKS_TEXT, taskErrorText, type TasksText } from '../../text/tasks';
import type { TaskRow } from './tasksModel';
import type { RunLite, TaskLite, PrInfo } from '../../services/taskService';
import * as i18n from '../../i18n/index.ts';

const TX = tx(TASKS_TEXT);

// ── 공용 조각 ───────────────────────────────────────────────────────────────

/** 상대 시간(기다린 시간) — 기존 문구 `{n}분`/`{n}시간` 재사용(새 원문을 늘리지 않는다). 1분 미만은 1분. */
export function durationLabel(ms: number): string {
  const min = Math.max(1, Math.round(Math.max(0, ms) / 60000));
  if (min < 60) return i18n.t('{n}분', { n: min });
  return i18n.t('{n}시간', { n: Math.round(min / 60) });
}

export function runStateLabel(T: TasksText, s: RunLite['state']): string {
  switch (s) {
    case 'creating': return T.stateCreating;
    case 'launching': return T.stateLaunching;
    case 'running': return T.stateRunning;
    case 'review_ready': return T.stateReviewReady;
    case 'merging': return T.stateMerging;
    case 'merged': return T.stateMerged;
    case 'discarded': return T.stateDiscarded;
    case 'failed': return T.stateFailed;
    default: return String(s || '');
  }
}
export function taskStateLabel(T: TasksText, s: TaskLite['state']): string {
  return s === 'merged' ? T.taskMerged : s === 'closed' ? T.taskClosed : s === 'failed' ? T.taskFailed : T.taskOpen;
}
export function checksLabel(T: TasksText, pr: PrInfo | null): string {
  if (!pr) return T.noPr;
  const c = pr.checks?.status || 'none';
  return c === 'passing' ? T.checksPassing : c === 'failing' ? T.checksFailing : c === 'pending' ? T.checksPending : T.checksNone;
}

export type Tone = 'warn' | 'error' | 'cta' | 'working' | 'none';

/** 상태 점 — 신호 색만. working 은 색 없이 점 두 개가 1.2s 루프로 교차 페이드한다(§6.8). */
export function StateDot({ tone }: { tone: Tone }) {
  const C = v2.colors;
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tone !== 'working') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [tone, a]);
  if (tone === 'working') {
    const o1 = a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });
    const o2 = a.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
    return (
      <View style={{ flexDirection: 'row', gap: 3, width: 14, alignItems: 'center' }}>
        <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.text3, opacity: o1 }} />
        <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.text3, opacity: o2 }} />
      </View>
    );
  }
  if (tone === 'none') return <View style={{ width: 14 }} />;
  const color = tone === 'warn' ? C.warn : tone === 'error' ? C.error : C.cta;
  return <View style={{ width: 14, alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /></View>;
}

/** 버튼 — PressableScale(함수형 style 금지 규칙). primary = 채움 명암(색 아님), danger = error 색 글자. */
export function Btn({ label, onPress, kind = 'plain', disabled, busy, icon, small }: {
  label: string; onPress: () => void; kind?: 'plain' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean; busy?: boolean; icon?: React.ReactNode; small?: boolean;
}) {
  const C = v2.colors;
  const fg = kind === 'danger' ? C.error : kind === 'primary' ? C.text : C.text2;
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => { if (disabled || busy) return; haptic.select(); onPress(); }}
      baseOpacity={disabled ? 0.4 : 1}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        paddingHorizontal: small ? 9 : 12, paddingVertical: small ? 5 : 8, borderRadius: 8,
        borderWidth: kind === 'ghost' ? 0 : 1,
        borderColor: kind === 'primary' ? C.textDim : C.borderControl,
        backgroundColor: kind === 'primary' ? C.elevated2 : 'transparent',
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text numberOfLines={1} style={{ color: fg, fontSize: small ? 12 : 13, fontWeight: kind === 'primary' ? '600' : '500' }}>{label}</Text>
    </PressableScale>
  );
}

/** 바텀시트 틀 — PcPickerSheet 톤(scrim rgba(5,7,12,0.62)·radius 18·그래버). 키보드는 KeyboardAvoidingView 가 민다. */
export function SheetFrame({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode;
}) {
  const C = v2.colors;
  const insets = useSafeAreaInsets();
  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
        <View style={{
          backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl,
          borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 8, maxHeight: '88%',
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
          {title ? <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 }}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
      {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이 별도 마운트 규칙 유지 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}

// ── 카드 ───────────────────────────────────────────────────────────────────

export type CardAction =
  | 'answer' | 'trust' | 'reopen' | 'resend' | 'discard' | 'terminal' | 'review' | 'detail' | 'delete' | 'dismissOp';

export interface CardView {
  tone: Tone;
  line: string;
  sub: string | null;
  actions: { kind: CardAction; label: string; primary?: boolean; danger?: boolean }[];
}

/** 카드가 그릴 것 — 순수(그룹·행 → 문구·행동). 규칙은 설계 §5.4 의 그룹별 행동 목록 그대로. */
export function cardView(row: TaskRow, now: number, T: TasksText = TX): CardView {
  const run = row.run;
  const task = row.task;
  const waited = () => T.waitingFor(durationLabel(now - (row.waitSince || now)));
  if (row.kind === 'task' && task) {
    const winner = task.runs.find((r) => r.id === task.winnerRunId) || null;
    return {
      tone: task.state === 'merged' ? 'cta' : task.state === 'failed' ? 'error' : 'none',
      line: task.state === 'merged' && winner ? `${T.taskMerged} · ${T.mergedInto(winner.branch, task.base)}` : taskStateLabel(T, task.state),
      sub: null,
      actions: [{ kind: 'detail', label: T.detail }, { kind: 'delete', label: T.deleteRecord, danger: true }],
    };
  }
  if (row.group === 'needs_input') {
    // 사유(tasksModel.needsInputReason — PC 와 같은 순서)별 행동(§5.4).
    const answer = row.approvals.length ? [{ kind: 'answer' as const, label: T.answer, primary: true }] : [];
    switch (row.reason) {
      case 'failed':
        return {
          tone: 'error', line: `${T.stateFailed}: ${taskErrorText(T, run?.error?.code)}`, sub: null,
          actions: [{ kind: 'reopen', label: T.reopen, primary: true }, { kind: 'resend', label: T.resendPrompt }, { kind: 'discard', label: T.discard, danger: true }],
        };
      case 'promptNotDelivered':
        return { tone: 'warn', line: T.promptNotDelivered, sub: null, actions: [{ kind: 'resend', label: T.resendPrompt, primary: true }, { kind: 'terminal', label: T.openTerminal }] };
      case 'interrupted':
        return { tone: 'warn', line: T.errInterrupted, sub: null, actions: [{ kind: 'reopen', label: T.reopen, primary: true }, { kind: 'terminal', label: T.openTerminal }] };
      case 'trust':
        return { tone: 'warn', line: T.trustNeeded, sub: null, actions: [{ kind: 'trust', label: T.trustContinue, primary: true }, { kind: 'terminal', label: T.openTerminal }] };
      case 'terminalGone':
        return { tone: 'warn', line: T.terminalGone, sub: null, actions: [{ kind: 'reopen', label: T.reopenTerminal, primary: true }] };
      case 'agentGone':
        return { tone: 'warn', line: T.agentGone, sub: null, actions: [{ kind: 'reopen', label: T.relaunchAgent, primary: true }, { kind: 'terminal', label: T.openTerminal }] };
      case 'keptDirty':
        return { tone: 'warn', line: T.keptDirty, sub: null, actions: [...answer, { kind: 'terminal', label: T.openTerminal }, { kind: 'discard', label: T.discard, danger: true }] };
      case 'opFailed':
        return {
          tone: 'error', line: taskErrorText(T, run?.lastOp?.code, { base: task?.base }), sub: null,
          actions: [{ kind: 'dismissOp', label: T.confirm, primary: true }, { kind: 'detail', label: T.detail }],
        };
      default: // permission · needsInput · approval
        return { tone: 'warn', line: waited(), sub: null, actions: answer.length ? [...answer, { kind: 'terminal', label: T.openTerminal }] : [{ kind: 'terminal', label: T.openTerminal, primary: true }] };
    }
  }
  if (row.group === 'working') {
    const line = run?.op ? T.opInProgress
      : run && (run.state === 'creating' || run.state === 'launching' || run.state === 'merging') ? runStateLabel(T, run.state)
        : T.groupWorking;
    return { tone: 'working', line, sub: null, actions: [{ kind: 'terminal', label: T.openTerminal }] };
  }
  if (row.group === 'review_ready' && run) {
    const d = run.diff;
    const parts = [T.stateReviewReady];
    if (d) parts.push(`${T.filesSummary(d.files)} ${T.diffStat(d.additions, d.deletions)}`);
    const pr = run.pr;
    const prLine = pr ? `${T.prNumber(pr.number)} · ${pr.state === 'closed' ? T.prClosed : checksLabel(T, pr)}` : null;
    const tone: Tone = pr && pr.checks?.status === 'failing' ? 'error'
      : pr && pr.state === 'open' && pr.mergeable === 'MERGEABLE' && pr.checks?.status !== 'pending' ? 'cta' : 'none';
    return {
      tone, line: parts.join(' · '), sub: prLine,
      actions: [{ kind: 'review', label: T.review, primary: true }, { kind: 'terminal', label: T.openTerminal }],
    };
  }
  // idle
  return {
    tone: 'none',
    line: run ? runStateLabel(T, run.state) : T.groupIdle,
    sub: null,
    actions: run ? [{ kind: 'detail', label: T.detail }, { kind: 'terminal', label: T.openTerminal }] : [{ kind: 'terminal', label: T.openTerminal }],
  };
}

export default function TaskCard({ row, now, index, animate, selected, onPress, onAction, busyAction }: {
  row: TaskRow;
  now: number;
  /** 등장 스태거 순번(그룹 안). */
  index: number;
  /** 이 카드 id 를 처음 보는가 — true 일 때만 등장 모션. */
  animate: boolean;
  /** 태블릿 2컬럼에서 오른쪽 상세에 열린 카드 — 무채색 명암(elevated2)만. */
  selected?: boolean;
  onPress: () => void;
  onAction: (a: CardAction) => void;
  busyAction?: CardAction | null;
}) {
  const C = v2.colors;
  const view = cardView(row, now);
  const appear = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(appear, {
      toValue: 1, duration: 160, delay: Math.min(index, 8) * 20,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
    // 최초 마운트에서만 — animate 는 Host 의 seen 집합이 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  const task = row.task;
  const run = row.run;
  const agent = row.agent || row.live?.agent || null;
  // 둘째 줄: PC 이름 · (작업 제목 · 브랜치 | 워크스페이스 이름). 작업 제목은 봉인 task.list 에서만 온다.
  const where = task
    ? [task.title, run?.branch].filter(Boolean).join(' · ')
    : (row.workspace?.name || row.cwd || '');
  return (
    <Animated.View style={{ opacity: appear, transform: [{ translateY }] }}>
      <PressableScale
        scaleTo={0.98}
        onPress={() => { haptic.select(); onPress(); }}
        style={{
          marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: v2.radius.md,
          borderWidth: 1, borderColor: C.border, backgroundColor: selected ? C.elevated2 : C.elevated,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {agent ? <AgentLogo brand={agent} size={14} /> : <TerminalWindow size={14} color={C.text3} />}
          <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flexShrink: 0, maxWidth: '40%' }}>
            {agent || '—'}{run ? ` #${run.idx}` : ''}
          </Text>
          <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11.5 }}>
            {/* PC 이름은 빼는 게 맞다 — 진행 현황은 고른 PC 하나의 것이고 헤더에 이미 적혀 있다(2026-09-29). */}
            {where}
          </Text>
          {row.unread > 0 ? (
            <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{row.unread > 9 ? '9+' : row.unread}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <StateDot tone={view.tone} />
          <Text numberOfLines={2} style={{ flex: 1, color: C.text2, fontSize: 12.5 }}>{view.line}</Text>
        </View>
        {view.sub ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginTop: 3, marginLeft: 20 }}>{view.sub}</Text> : null}
        {view.actions.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {view.actions.map((a) => (
              <Btn key={a.kind} small label={a.label} kind={a.danger ? 'danger' : a.primary ? 'primary' : 'plain'}
                busy={busyAction === a.kind} onPress={() => onAction(a.kind)} />
            ))}
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}
