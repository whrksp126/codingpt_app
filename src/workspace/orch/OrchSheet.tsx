// OrchSheet.tsx — 오케스트레이션 묶음 상세(셸 레벨 1회 마운트). PC `orch-view.js` openOrchSheet 의 미러.
//
// 폰이 하는 일은 셋뿐이다: ① 묶음·워커가 지금 어떤 상태인지 본다 ② 사람이 답해야 하는 것(워커의 질문·결정)에 답한다
//  ③ 멈추기·정리·닫기. 워커를 띄우고 일을 나누는 것은 PC 터미널 안의 코디네이터 에이전트가 한다.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import { tx } from '../../text';
import { ORCH_TEXT, orchErrKey, type OrchText } from '../../text/orch';
import { Sheet, Button } from '../../components/ui';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import AgentLogo from '../AgentLogo';
import { StateDot, type Tone } from '../tasks/TaskCard';
import { openTaskTerminal } from '../tasks/tasksUi';
import { getBucket } from '../tasks/useTasks';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { replyOrch, resolveGate, stopWorker, releaseWorker, closeRun, type OrchWorker } from '../../services/orchService';
import { useOrchSnapshot, refreshOrchHost } from './useOrch';
import { useOrchSheet, closeOrchSheet } from './orchUi';
import { visibleWorkers, workerDot, workerTextKey, runRollup, runTitle, type OrchDot } from './orchModel';

const TX = tx(ORCH_TEXT);
const TONE: Record<OrchDot, Tone> = { warn: 'warn', error: 'error', spin: 'working', none: 'none', off: 'none' };
const LOGO_BRANDS = new Set(['claude', 'codex', 'gemini', 'cursor-agent', 'opencode']);
const SETTLED = new Set(['succeeded', 'failed', 'stopped', 'abandoned']);
const TASK_KEY: Record<string, keyof OrchText> = { pending: 'tPending', ready: 'tReady', dispatched: 'tDispatched', completed: 'tCompleted', failed: 'tFailed', blocked: 'tBlocked' };

export default function OrchSheet() {
  const C = v2.colors;
  const focus = useOrchSheet();
  const S = useWorkspaceShell();
  const snap = useOrchSnapshot(focus?.host);
  const run = useMemo(() => (focus && snap ? snap.runs.find((r) => r.id === focus.runId) || null : null), [focus, snap]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);
  const [armClose, setArmClose] = useState(false);

  useEffect(() => { if (focus) { setNote(null); setArmClose(false); void refreshOrchHost(focus.host); } }, [focus]);
  // 묶음이 닫혀 사본에서 사라지면 시트도 닫는다.
  useEffect(() => { if (focus && snap && !run) closeOrchSheet(); }, [focus, snap, run]);

  const act = useCallback(async (fn: () => Promise<unknown>, okText: string): Promise<boolean> => {
    if (!focus || busy) return false;
    setBusy(true);
    try {
      await fn();
      haptic.success();
      setNote({ text: okText, err: false });
      return true;
    } catch (e: any) {
      setNote({ text: TX[orchErrKey(e?.code)] as string, err: true });
      return false;
    } finally {
      setBusy(false);
      void refreshOrchHost(focus.host);
    }
  }, [focus, busy]);

  const openTerminal = useCallback((w: { placement?: string; cwd?: string | null; tid?: number | null; taskRef?: { taskId: string; runId: string } | null }) => {
    if (!focus) return;
    closeOrchSheet();
    if (w.placement === 'worktree' && w.taskRef) {
      const t = (getBucket(focus.host)?.items || []).find((x) => x.id === w.taskRef!.taskId);
      const r = t?.runs.find((x) => x.id === w.taskRef!.runId);
      void openTaskTerminal(() => S, r?.workspaceId || null, r?.tid ?? null, true);
      return;
    }
    const ws = S.workspaces.find((x) => (x.localPath || '') === (w.cwd || '') && Number(x.hostDeviceId) === focus.host)
      || S.workspaces.find((x) => (x.localPath || '') === (w.cwd || ''));
    void openTaskTerminal(() => S, ws?.id || null, w.tid ?? null, false);
  }, [focus, S]);

  if (!focus) return <Sheet visible={false} onClose={closeOrchSheet}>{null}</Sheet>;
  const host = focus.host;
  const roll = runRollup(run);
  const workers = visibleWorkers(run) as OrchWorker[];
  const live = workers.filter((w) => w.state === 'ready' || w.state === 'starting').length;
  const stat = [TX.workersN(roll.counts.total),
    roll.counts.live ? TX.liveN(roll.counts.live) : '',
    roll.counts.attention + roll.gates ? TX.attentionN(roll.counts.attention + roll.gates) : '',
    roll.counts.ok ? TX.okN(roll.counts.ok) : '',
    roll.counts.failed ? TX.failedN(roll.counts.failed) : ''].filter(Boolean).join(' · ');
  const tasks = run?.tasks || [];
  const showTasks = tasks.some((t) => (t.deps || []).length || t.status === 'pending' || t.status === 'ready' || t.status === 'blocked');
  const card = { borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, padding: 12, gap: 6, marginBottom: 8 } as const;
  const cap = { color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' as const, fontFamily: v2.font.sans };
  const body = { color: C.text, fontSize: v2.font.size.small, lineHeight: 20, fontFamily: v2.font.sans };

  return (
    <Sheet visible={!!run} onClose={closeOrchSheet} maxHeightPct={0.9} title={runTitle(run) || TX.orchestration}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: C.text3, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{stat}</Text>
        {run?.coordinator?.tid != null ? (
          <Button size="sm" variant="ghost" label={TX.openCoordinator} onPress={() => openTerminal({ cwd: run.coordinator!.cwd, tid: run.coordinator!.tid })} />
        ) : null}
      </View>
      {note ? <Text style={{ color: note.err ? C.error : C.text2, fontSize: v2.font.size.caption, paddingBottom: 8, fontFamily: v2.font.sans }}>{note.text}</Text> : null}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 4 }}>
        {(run?.gates || []).map((g) => (
          <View key={g.id} style={[card, { borderColor: C.warn }]}>
            <Text style={cap}>{TX.decision}</Text>
            <Text style={body}>{g.question}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {g.options.map((o) => (
                <Button key={o} size="sm" label={o} disabled={busy} onPress={() => { void act(() => resolveGate(host, g.id, o), TX.sent); }} />
              ))}
            </View>
          </View>
        ))}
        {workers.length === 0 ? <Text style={{ color: C.textDim, fontSize: v2.font.size.small, paddingVertical: 12, fontFamily: v2.font.sans }}>{TX.noWorkers}</Text> : null}
        {workers.map((w) => {
          const settled = SETTLED.has(w.state);
          const sub = [TX[workerTextKey(w.uiState) as keyof OrchText] as string, w.phase && !settled ? w.phase : '', w.placement === 'worktree' ? TX.placeWorktree : TX.placeCurrent].filter(Boolean).join(' · ');
          const q = w.question;
          return (
            <View key={w.dispatchId} style={[card, q ? { borderColor: C.warn } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {w.agent && LOGO_BRANDS.has(w.agent) ? <AgentLogo brand={w.agent} size={16} /> : <TerminalWindow size={16} color={C.text3} />}
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text, fontSize: v2.font.size.small, fontWeight: '500', fontFamily: v2.font.sans }}>{w.title || TX.worker}</Text>
                <StateDot tone={TONE[workerDot(w.uiState)]} />
              </View>
              <Text numberOfLines={2} style={{ color: C.text3, fontSize: v2.font.size.caption, paddingLeft: 24, fontFamily: v2.font.sans }}>{sub}</Text>
              {q ? (
                <View style={{ gap: 6, paddingTop: 4 }}>
                  <Text style={cap}>{TX.question}</Text>
                  <Text style={body}>{q.text}</Text>
                  {q.options.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {q.options.map((o) => (
                        <Button key={o} size="sm" label={o} disabled={busy} onPress={() => { void act(() => replyOrch(host, q.id, o), TX.sent); }} />
                      ))}
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <KeyTextInput
                      value={drafts[q.id] || ''}
                      onChangeText={(t: string) => setDrafts((d) => ({ ...d, [q.id]: t }))}
                      placeholder={TX.replyPlaceholder}
                      placeholderTextColor={C.textDim}
                      multiline
                      style={{ flex: 1, minHeight: 40, maxHeight: 120, color: C.text, fontSize: v2.font.size.small, fontFamily: v2.font.sans, borderWidth: 1, borderColor: C.borderControl, borderRadius: v2.radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
                    />
                    <Button size="sm" variant="primary" label={TX.reply} disabled={busy || !(drafts[q.id] || '').trim()}
                      onPress={() => { void act(() => replyOrch(host, q.id, (drafts[q.id] || '').trim()), TX.sent).then((ok) => { if (ok) setDrafts((d) => { const n = { ...d }; delete n[q.id]; return n; }); }); }} />
                  </View>
                </View>
              ) : null}
              {w.result?.summary ? (
                <Text style={{ color: C.text2, fontSize: v2.font.size.caption, lineHeight: 18, paddingLeft: 24, fontFamily: v2.font.sans }}>
                  <Text style={cap}>{TX.result} </Text>{w.result.summary}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingLeft: 12 }}>
                {w.tid != null && w.terminal !== 'released' ? <Button size="sm" variant="ghost" label={TX.openTerminal} onPress={() => openTerminal(w)} /> : null}
                {!settled ? <Button size="sm" variant="ghost" label={TX.stop} disabled={busy} onPress={() => { void act(() => stopWorker(host, w.dispatchId), TX.stopped); }} /> : null}
                {settled && w.terminal === 'owned' && w.placement === 'worktree' && w.state === 'succeeded'
                  ? <Button size="sm" variant="ghost" label={TX.releaseMerge} disabled={busy} onPress={() => { void act(() => releaseWorker(host, w.dispatchId, true), TX.released); }} /> : null}
                {settled && w.terminal === 'owned' ? <Button size="sm" variant="ghost" label={TX.release} disabled={busy} onPress={() => { void act(() => releaseWorker(host, w.dispatchId), TX.released); }} /> : null}
              </View>
            </View>
          );
        })}
        {showTasks ? (
          <View style={{ paddingTop: 4 }}>
            <Text style={[cap, { paddingBottom: 4 }]}>{TX.tasks}</Text>
            {tasks.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}>
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{t.title}</Text>
                <Text style={{ color: C.text3, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{TX[TASK_KEY[t.status] || 'wUnknown'] as string}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingTop: 12, gap: 6 }}>
        {armClose && live ? <Text style={{ color: C.text2, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{TX.closeRunConfirm(live)}</Text> : null}
        <Button stretch variant={armClose && live ? 'danger' : 'secondary'} label={armClose && live ? TX.closeRunForce : TX.closeRun} disabled={busy}
          onPress={() => {
            if (!run) return;
            // 일하는 워커가 있으면 한 번 더 눌러야 닫는다(실수로 멈추지 않게).
            if (live && !armClose) { setArmClose(true); return; }
            void act(() => closeRun(host, run.id, live > 0), TX.closed).then((ok) => { if (ok) closeOrchSheet(); });
          }} />
      </View>
    </Sheet>
  );
}
