// desktopOs — 에이전트 PC 게스트 OS 캐시(전역: 맥 1대 = 데스크톱 1대). PC 의 desktop-os.js 와 짝.
//  EmulatorBody 의 상태 폴링이 setDesktopOs 로 갱신하고, pane 탭이 파비콘(OS 로고)·이름("macOS · VM"/"Linux · VM")을
//  useDesktopOs 로 읽어 다시 그린다. 모르면 null → 기존 모니터 아이콘·"에이전트 PC" 로 폴백.
import { useSyncExternalStore } from 'react';

type OsKind = 'macos' | 'linux';
let _os: OsKind | null = null;
const subs = new Set<() => void>();

export function getDesktopOs(): OsKind | null { return _os; }

/** 알게 된 OS 저장. 값이 바뀌면 구독자에게 알리고 true. null/빈 값은 무시(기존 값 유지). */
export function setDesktopOs(k?: string | null): boolean {
  const v: OsKind | null = k === 'linux' ? 'linux' : k === 'macos' ? 'macos' : null;
  if (!v || v === _os) return false;
  _os = v;
  subs.forEach((f) => { try { f(); } catch { /* noop */ } });
  return true;
}

/** 탭 이름 — "macOS · VM" / "Linux · VM". */
export function osVmLabel(k?: string | null): string { return (((k || _os) === 'linux') ? 'Linux' : 'macOS') + ' · VM'; }

export function useDesktopOs(): OsKind | null {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => _os);
}
