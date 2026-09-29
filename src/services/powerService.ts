// powerService.ts — PC 깨어 있기(power.*) 와이어 타입 + 래퍼 + "지금 깨어 있음" 표식(automation-design.md §6).
//
// 표식(awake)은 runner_status 프레임의 불리언이다(back 이 데몬 runner_busy 로 유지 — §7.2). 서버가 아는 건 불리언 2개뿐.
//  구 back/구 데몬은 필드를 안 보낸다 → undefined = 표시 안 함(없음으로 단정하지 않는다).
import { autoRpc } from './automationService';

export interface PowerStatus {
  supported: boolean;
  keepAwake: boolean;
  lidClosed: boolean;
  setup: 'none' | 'pending' | 'done' | 'failed';
  setupError?: string | null;
  active: boolean;
  reasons: string[];
  layers?: { caffeinate: boolean; disableSleep: boolean };
  power: 'ac' | 'battery' | 'unknown';
  lidBlocked: null | 'battery' | 'setup' | 'sudo';
  lastError?: string | null;
  since?: number;
}

export const getPowerStatus = (host: number) => autoRpc<PowerStatus>('power.status', {}, host);
export const setPower = (host: number, patch: { keepAwake?: boolean; lidClosed?: boolean }) =>
  autoRpc<{ status: PowerStatus }>('power.set', patch as Record<string, unknown>, host);
export const setupPower = (host: number, remove = false) =>
  autoRpc<{ accepted: true }>('power.setup', remove ? { remove: true } : {}, host);

// ── 호스트별 awake 표식(모듈 스토어 — 사이드바 PC 행·헤더가 구독) ──
const awake = new Map<number, boolean>();
const listeners = new Set<() => void>();
let version = 0;
function emit() { version += 1; listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }
export function subscribeAwake(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getAwakeVersion(): number { return version; }
export function isHostAwake(host: number | null | undefined): boolean {
  return host != null && awake.get(Number(host)) === true;
}
/** runner_status 수신 반영. awake undefined(구 back) = 항목 삭제, 오프라인이면 항상 삭제. */
export function setHostAwake(host: number, online: boolean, value: unknown): void {
  const h = Number(host);
  if (!Number.isFinite(h)) return;
  const next = online && value === true;
  const had = awake.get(h) === true;
  if (next) awake.set(h, true); else awake.delete(h);
  if (had !== next) emit();
}
export function _resetAwakeForTest(): void { awake.clear(); version = 0; }

// ── power.changed(ui_command) 구독 — 열려 있는 PC 설정 시트가 다시 읽는다 ──
const changed = new Set<(host: number) => void>();
export function subscribePowerChanged(fn: (host: number) => void): () => void { changed.add(fn); return () => { changed.delete(fn); }; }
export function onPowerChanged(params: { host?: unknown }): void {
  const h = Number(params?.host);
  changed.forEach((fn) => { try { fn(Number.isFinite(h) ? h : 0); } catch (_) { /* noop */ } });
}

export default { getPowerStatus, setPower, setupPower, isHostAwake, setHostAwake, subscribeAwake, onPowerChanged };
