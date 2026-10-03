// vmScope — 에이전트 PC(VM) 범위(모듈 스토어). PC 의 state.vmScope + state.view==='vm' 과 짝(vm-view.js).
//  사이드바에서 VM 을 고르면 그 아래가 그 VM 의 것(화면·VM 워크스페이스)으로 바뀌고, 메인에는 그 VM 의 화면이 뜬다.
//  에이전트는 VM **안에서** 돈다(데몬 vm-agent.js) — 폰은 화면을 보고, 워크스페이스에 들어가 채팅·터미널로 일을 시킨다.
import { useSyncExternalStore } from 'react';

export type VmOs = 'macos' | 'linux';
type St = { os: VmOs | null; screen: boolean };
let st: St = { os: null, screen: false };
const subs = new Set<() => void>();
const set = (n: St) => { if (n.os === st.os && n.screen === st.screen) return; st = n; subs.forEach((f) => { try { f(); } catch { /* noop */ } }); };

export function getVm(): St { return st; }
export function subscribeVm(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
export function useVm(): St { return useSyncExternalStore(subscribeVm, getVm); }
/** VM 을 고른다 — 범위를 바꾸고 그 화면을 메인에 띄운다. */
export function openVm(os: VmOs): void { set({ os, screen: true }); }
/** 화면 장소를 닫는다(범위는 그대로 — VM 워크스페이스에 들어갈 때). */
export function closeVmScreen(): void { set({ os: st.os, screen: false }); }
/** 호스트 PC 기준으로 돌아간다. */
export function leaveVm(): void { set({ os: null, screen: false }); }

/** 워크스페이스 경로가 VM 자리(~/.codingpt/vm/<os>/ws/…)면 그 OS, 아니면 null. */
export function vmOsOfPath(p?: string | null): VmOs | null {
  const m = /(?:^|\/)\.codingpt\/vm\/(macos|linux)\/ws\//.exec(String(p || '') + '/');
  return m ? (m[1] as VmOs) : null;
}
export function vmLabel(os?: string | null): string { return (os === 'linux' ? 'Linux' : 'macOS') + ' (VM)'; }
