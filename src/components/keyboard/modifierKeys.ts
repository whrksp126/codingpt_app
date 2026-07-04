import { useCallback, useMemo, useState } from 'react';

// 실물 키보드 특수키 패널에서 다루는 모디파이어 목록.
//  - 앱 전역에서 공유(에디터/터미널/일반 인풋)되며, 상태는 이 훅 하나가 소유한다.
//  - meta(⌘)/ctrl 은 플랫폼에 따라 같은 단축키로 매핑될 수 있으나, 표시는 실물 키보드처럼 각각 노출한다.
export type ModId = 'ctrl' | 'alt' | 'meta' | 'shift' | 'caps' | 'fn';

// off=꺼짐, once=원샷(다음 키 1회 후 자동 해제), lock=잠금(사용자가 풀 때까지 유지)
export type ModState = 'off' | 'once' | 'lock';
export type ModMap = Record<ModId, ModState>;
// 실제 조합에 반영되는 boolean(once|lock 이면 true).
export type ModFlags = Record<ModId, boolean>;

export const MOD_IDS: ModId[] = ['ctrl', 'alt', 'meta', 'shift', 'caps', 'fn'];

const OFF: ModMap = { ctrl: 'off', alt: 'off', meta: 'off', shift: 'off', caps: 'off', fn: 'off' };

const toFlags = (m: ModMap): ModFlags => ({
  ctrl: m.ctrl !== 'off', alt: m.alt !== 'off', meta: m.meta !== 'off',
  shift: m.shift !== 'off', caps: m.caps !== 'off', fn: m.fn !== 'off',
});

/**
 * 공유 모디파이어 상태 훅.
 *  - tap(짧게): off→once, once→off, lock→off(잠금 해제). 사용자 결정: "홀드 상태에서 한번 더 클릭 시 해제".
 *  - hold(길게): 어떤 상태든 lock. 여러 모디파이어를 동시에 lock 할 수 있다(멀티락).
 *  - consume(): 비모디파이어 키가 실제로 눌린 뒤 호출 — once 였던 것만 off 로 정리(lock 은 유지).
 */
export function useModifierKeys() {
  const [mods, setMods] = useState<ModMap>(OFF);

  const tap = useCallback((id: ModId) => {
    setMods((prev) => ({ ...prev, [id]: prev[id] === 'off' ? 'once' : 'off' }));
  }, []);

  const hold = useCallback((id: ModId) => {
    setMods((prev) => ({ ...prev, [id]: prev[id] === 'lock' ? 'off' : 'lock' }));
  }, []);

  // 비모디파이어 키 입력 후 once 정리. once 가 하나도 없으면 참조 동일성 유지(불필요 렌더 방지).
  const consume = useCallback(() => {
    setMods((prev) => {
      if (!MOD_IDS.some((id) => prev[id] === 'once')) return prev;
      const next = { ...prev };
      for (const id of MOD_IDS) if (next[id] === 'once') next[id] = 'off';
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setMods(OFF), []);

  const flags = useMemo(() => toFlags(mods), [mods]);
  const anyActive = useMemo(() => MOD_IDS.some((id) => mods[id] !== 'off'), [mods]);

  return { mods, flags, anyActive, tap, hold, consume, clearAll };
}

export type ModifierApi = ReturnType<typeof useModifierKeys>;
