// PcSettingsSheet — PC 설정 바텀시트(automation-design.md §6.6). 지금은 "PC 깨어 있기" 카드 하나.
//  여는 곳: 사이드바 `내 PC` ⋯ 메뉴 `PC 설정` · 진행 현황/자동화 헤더의 PC 이름. openPcSettings(host) 로 연다.
//
//  내용은 PC 설정 카드와 같다: [작업 중에는 잠자기 방지] · [덮개를 닫아도 계속 작업](미설정이면 설정 흐름 먼저) ·
//  지금 상태 한 줄 · 주의 문구. caps ∌ power.v1 → pcNeedsUpdate, 비 macOS(supported:false) → powerUnsupported.
//  [설정하기] 는 먼저 setupRemoteHint 를 보여 준다 — 암호 창은 **그 PC 화면**에 뜬다(폰에서 입력할 수 없다).
//  PC 쪽에서 바꾸면 ui_command power.changed 로 다시 읽는다. 열려 있는 동안 30s 폴링.
//
// iOS 27: 모달 안에서는 useSafeAreaInsets 로 패딩(SafeAreaView inset 0 버그) — SheetFrame 이 이미 그렇게 한다.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { v2 } from '../theme/v2Tokens';
import Toggle from './ui/Toggle';
import { SheetFrame, Btn } from '../workspace/tasks/TaskCard';
import { afterModalTransition, noteModalClosing } from './modalLayer';
import { collapseKeyAssist } from './keyboard/KeyAssist';
import { TaskRpcError } from '../services/taskService';
import { hostSupportsPower } from '../services/automationService';
import powerService, { subscribePowerChanged, type PowerStatus } from '../services/powerService';
import { tx } from '../text';
import { AUTO_TEXT } from '../text/automations';
import { TASKS_TEXT, taskErrorText } from '../text/tasks';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);
const POLL_MS = 30000;

// ── 열림 상태(모듈 스토어 — NotificationsPanel.openNotifPanel 과 같은 패턴) ──
let openHost: number | null = null;
let gen = 0;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }
export function openPcSettings(host: number | null | undefined): void {
  if (host == null || !(Number(host) > 0)) return;
  collapseKeyAssist();
  // 방금 닫힌 모달(⋯ 메뉴)이 내려가는 중이면 그 뒤에(iOS 형제 present 거부).
  afterModalTransition(() => { openHost = Number(host); gen += 1; emit(); });
}
export function closePcSettings(): void {
  if (openHost == null) return;
  noteModalClosing();
  openHost = null;
  emit();
}
export function getPcSettingsHost(): number | null { return openHost; }

export default function PcSettingsSheet() {
  const [host, setHost] = useState<number | null>(openHost);
  const [g, setG] = useState(gen);
  useEffect(() => {
    const fn = () => { setHost(openHost); setG(gen); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return (
    <SheetFrame visible={host != null} onClose={closePcSettings} title={TA.pcSettings}>
      {host != null ? <PowerCard key={`${host}-${g}`} host={host} /> : null}
    </SheetFrame>
  );
}

/** 지금 상태 한 줄(§6.6) — 깨어 있음 · 작업 n개 / 잠자기 허용. 배터리면 덮개 닫힘 유지가 꺼진다는 말을 덧붙인다. */
export function powerNowLine(st: PowerStatus): string {
  const n = (st.reasons || []).filter((r) => r.startsWith('task:')).length;
  const awake = !!(st.layers && (st.layers.caffeinate || st.layers.disableSleep)) || (st.active && st.keepAwake);
  return awake ? TA.awakeStatus(n) : TA.asleepAllowed;
}

export function PowerCard({ host }: { host: number }) {
  const C = v2.colors;
  const caps = hostSupportsPower(host);
  const [st, setSt] = useState<PowerStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'keepAwake' | 'lidClosed' | 'setup' | null>(null);
  const [hint, setHint] = useState<'remote' | 'pending' | null>(null);

  const load = useCallback(() => {
    if (caps === false) return;
    powerService.getPowerStatus(host)
      .then((s) => {
        setSt(s); setErr(null);
        // 설정 결과가 나오면(완료·실패) "암호 창을 확인하세요" 를 거둔다. 'none' 은 아직 데몬이 시작 전일 수 있다.
        if (s.setup === 'done' || s.setup === 'failed') setHint((h) => (h === 'pending' ? null : h));
      })
      .catch((e: any) => setErr(e instanceof TaskRpcError ? e.code : 'ERROR'));
  }, [host, caps]);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => subscribePowerChanged((h) => { if (!h || h === host) load(); }), [host, load]);

  const set = useCallback(async (key: 'keepAwake' | 'lidClosed', v: boolean) => {
    setBusy(key); setErr(null);
    try { const r = await powerService.setPower(host, { [key]: v }); if (r?.status) setSt(r.status); }
    catch (e: any) { setErr(e instanceof TaskRpcError ? e.code : 'ERROR'); }
    finally { setBusy(null); }
  }, [host]);

  const runSetup = useCallback(async (remove: boolean) => {
    setBusy('setup'); setErr(null); setHint(remove ? null : 'pending');
    try { await powerService.setupPower(host, remove); load(); }
    catch (e: any) { setHint(null); setErr(e instanceof TaskRpcError ? e.code : 'ERROR'); }
    finally { setBusy(null); }
  }, [host, load]);

  if (caps === false) return <Text style={{ color: C.text2, fontSize: 13, paddingVertical: 8 }}>{TT.pcNeedsUpdate}</Text>;
  if (!st) {
    return err
      ? <Text style={{ color: C.text2, fontSize: 13, paddingVertical: 8 }}>{taskErrorText(TT, err)}</Text>
      : <ActivityIndicator color={C.text3} style={{ marginVertical: 16 }} />;
  }
  if (!st.supported) return <Text style={{ color: C.text2, fontSize: 13, paddingVertical: 8 }}>{TA.powerUnsupported}</Text>;

  const setupDone = st.setup === 'done';
  const onLid = (v: boolean) => {
    // 미설정이면 토글보다 설정 흐름이 먼저(§6.6) — 원격 안내부터.
    if (v && !setupDone) { setHint('remote'); return; }
    void set('lidClosed', v);
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5, fontWeight: '700' }}>{TA.keepAwake}</Text>
      <Row title={TA.keepAwakeWork} desc={TA.keepAwakeWorkDesc}
        right={<Toggle value={!!st.keepAwake} onValueChange={(v) => { void set('keepAwake', v); }} disabled={busy != null} />} />
      <Row title={TA.lidClosed} desc={setupDone ? TA.setUpDone : TA.lidClosedDesc}
        right={<Toggle value={!!st.lidClosed && setupDone} onValueChange={onLid} disabled={busy != null} />} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {setupDone
          ? <Btn small label={TA.removeSetup} busy={busy === 'setup'} onPress={() => { void runSetup(true); }} />
          : <Btn small label={TA.setUp} busy={busy === 'setup'} onPress={() => setHint('remote')} />}
      </View>
      {hint === 'remote' ? (
        // 암호 창은 그 PC 화면에 뜬다 — 확인을 받고서야 요청한다(누르자마자 PC 에 다이얼로그가 튀지 않게).
        <View style={{ padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, gap: 8 }}>
          <Text style={{ color: C.text, fontSize: 12.5 }}>{TA.setupRemoteHint}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small kind="primary" label={TA.setUp} onPress={() => { void runSetup(false); }} />
            <Btn small label={TT.cancel} onPress={() => setHint(null)} />
          </View>
        </View>
      ) : null}
      {hint === 'pending' || st.setup === 'pending' ? <Text style={{ color: C.text2, fontSize: 12.5 }}>{TA.setupPending}</Text> : null}
      {st.setup === 'failed' ? <Text style={{ color: C.error, fontSize: 12.5 }}>{st.setupError ? taskErrorText(TT, st.setupError) : TA.setupFailed}</Text> : null}
      <Text style={{ color: C.text2, fontSize: 12.5 }}>{powerNowLine(st)}</Text>
      {st.power === 'battery' || st.lidBlocked === 'battery' ? <Text style={{ color: C.textDim, fontSize: 12 }}>{TA.onBattery}</Text> : null}
      <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }}>{TA.powerCaveat}</Text>
      {err ? <Text style={{ color: C.error, fontSize: 12.5 }}>{taskErrorText(TT, err)}</Text> : null}
    </View>
  );
}

function Row({ title, desc, right }: { title: string; desc: string; right: React.ReactNode }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: C.textDim, fontSize: 12 }}>{desc}</Text>
      </View>
      {right}
    </View>
  );
}
