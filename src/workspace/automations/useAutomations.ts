// useAutomations.ts — 자동화 목록 스토어(호스트별 auto.list) + 모델 훅.
//
// 데이터 흐름(automation-design.md §5.9):
//  · 정본은 각 PC 데몬의 automations.json. 서버는 저장하지 않는다 → 호스트마다 auto.list(봉인 우선).
//  · 라이브 = ui_command `automations.changed {host, ids, reason}` → 그 host 만 300ms 디바운스 재조회.
//  · 보강 = 장소가 열려 있는 동안 60s · runner_status online 전이 · 사이드바가 PC 를 고를 때.
// 모듈 스토어인 이유는 useTasks 와 같다(사이드바 배지·장소·딥링크가 같은 목록을 본다).

import { useMemo, useSyncExternalStore } from 'react';
import { TaskRpcError } from '../../services/taskService';
import automationService, { hostSupportsAuto, type AutoListResult, type AutomationLite } from '../../services/automationService';
import { buildAutomationsModel, type AutoOutput } from './automationsModel';

export interface AutoBucket {
  host: number;
  items: AutomationLite[];
  paused: boolean;
  limits: AutoListResult['limits'] | null;
  loading: boolean;
  /** 마지막 조회 실패 code(성공하면 null). 목록은 직전 값을 유지한다. */
  error: string | null;
  loadedAt: number;
}

const buckets = new Map<number, AutoBucket>();
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}
export function subscribeAutomations(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getAutomationsVersion(): number { return version; }
export function getAutoBucket(host: number): AutoBucket | null { return buckets.get(Number(host)) || null; }

// ── 상세가 auto.get 을 다시 부르는 데 쓴다 ──
type ChangedListener = (host: number, ids: string[], reason: string) => void;
const changedListeners = new Set<ChangedListener>();
export function subscribeAutomationsChanged(fn: ChangedListener): () => void {
  changedListeners.add(fn);
  return () => { changedListeners.delete(fn); };
}

const inflight = new Map<number, Promise<void>>();
/** 한 호스트의 auto.list — 겹치면 진행 중인 것을 공유한다. */
export function refreshAutoHost(host: number): Promise<void> {
  const h = Number(host);
  if (!Number.isFinite(h) || h <= 0) return Promise.resolve();
  const cur = inflight.get(h);
  if (cur) return cur;
  const prev = buckets.get(h);
  buckets.set(h, {
    host: h, items: prev?.items || [], paused: !!prev?.paused, limits: prev?.limits || null,
    loading: true, error: prev?.error || null, loadedAt: prev?.loadedAt || 0,
  });
  emit();
  const p = (async () => {
    try {
      const r = await automationService.listAutomations(h);
      buckets.set(h, {
        host: h, items: Array.isArray(r?.items) ? r.items : [], paused: !!r?.paused, limits: r?.limits || null,
        loading: false, error: null, loadedAt: Date.now(),
      });
    } catch (e: any) {
      const code = e instanceof TaskRpcError ? e.code : String(e?.code || 'AUTO_ERROR');
      const b = buckets.get(h);
      buckets.set(h, {
        host: h, items: b?.items || [], paused: !!b?.paused, limits: b?.limits || null,
        loading: false, error: code, loadedAt: b?.loadedAt || 0,
      });
    } finally {
      inflight.delete(h);
      emit();
    }
  })();
  inflight.set(h, p);
  return p;
}

/** caps 가 auto.v1 을 광고하는 호스트면 조회(모름·없음이면 조용히 건너뛴다 — 구 데몬에 헛왕복 금지). */
export function refreshAutoHostIfSupported(host: number | null | undefined): void {
  if (host == null || !(Number(host) > 0)) return;
  if (hostSupportsAuto(host) === true) void refreshAutoHost(Number(host));
}

const changedTimers = new Map<number, ReturnType<typeof setTimeout>>();
/** ui_command `automations.changed` 수신(UiCommandBridge). 300ms 디바운스 후 그 host 재조회 + 상세 구독자 통지. */
export function onAutomationsChanged(params: { host?: unknown; ids?: unknown; reason?: unknown }): void {
  const raw = params?.host;
  const host = raw == null || raw === '' ? NaN : Number(raw);
  const ids = Array.isArray(params?.ids) ? params.ids.map(String) : [];
  const reason = String(params?.reason || '');
  if (!Number.isFinite(host) || host <= 0) {
    for (const h of buckets.keys()) void refreshAutoHost(h);
    return;
  }
  const t = changedTimers.get(host);
  if (t) clearTimeout(t);
  changedTimers.set(host, setTimeout(() => {
    changedTimers.delete(host);
    void refreshAutoHost(host);
  }, 300));
  changedListeners.forEach((fn) => { try { fn(host, ids, reason); } catch (_) { /* noop */ } });
}

/** runner_status online 전이 — useTasks.onHostOnline 이 caps 를 새로 받은 뒤 부른다. */
export function onAutoHostOnline(host: number): void {
  refreshAutoHostIfSupported(host);
}

/** 로그아웃·테스트용. */
export function resetAutomationsStore(): void {
  buckets.clear();
  emit();
}

// ── React 훅 ─────────────────────────────────────────────────────────────
export function useAutomationsVersion(): number {
  return useSyncExternalStore(subscribeAutomations, getAutomationsVersion);
}

/** 한 PC 의 자동화 모델. now 는 분 단위로만 바뀌어도 되는 표시용이라 호출자가 준다. */
export function useAutomationsModel(host: number, hostOnline: boolean, now: number): { model: AutoOutput; bucket: AutoBucket | null } {
  const v = useAutomationsVersion();
  const bucket = host ? getAutoBucket(host) : null;
  const model = useMemo(() => buildAutomationsModel({
    now, items: bucket?.items || [], paused: !!bucket?.paused, hostOnline,
  }), [v, host, hostOnline, now]); // eslint-disable-line react-hooks/exhaustive-deps
  return { model, bucket };
}
