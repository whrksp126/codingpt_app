import React, { createContext, useContext, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { haptic } from '../../animations/haptics';
import type { ModId, ModMap, ModState } from './modifierKeys';
import { kaPalette, kaSizes, type KaPalette, type KaSizes } from './keyAssistSettings';

// OS 키보드엔 없지만 실물 키보드엔 있는 원샷 특수키.
// (PageUp/PageDown/Delete 는 Windows 실물 키보드에만 존재 — Mac 은 fn+화살표/fn+delete 로 대체되어 패널에 없음.)
export type SpecialKeyName =
  | 'Escape' | 'Tab' | 'Backspace' | 'Enter'
  | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
  | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'Delete';

export type KeyboardOS = 'win' | 'mac';

interface Props {
  /** OS 키보드가 있던 자리의 높이 — 그 자리에 딱 맞춰 채운다. */
  height: number;
  /** 실물 키보드 종류 — 하단 모디파이어 라벨/순서 전환(기본 win). */
  os: KeyboardOS;
  mods: ModMap;
  onTapMod: (id: ModId) => void;   // 짧게: off↔once, lock 해제
  onHoldMod: (id: ModId) => void;  // 길게: lock(멀티락)
  onKey: (key: SpecialKeyName) => void;
  /** 외관 설정(전역 액세서리) — 미지정 시 기존 라이트/보통 크기 */
  palette?: KaPalette;
  sizes?: KaSizes;
}

const GAP = 5;
const ARROW_W = 38;                       // 방향키 한 칸 폭
const ACW = ARROW_W * 3 + GAP * 2;        // 방향키 클러스터(3칸) 폭
const MOD_W = 46;                         // 하단 모디파이어 한 칸 폭

// 팔레트/크기를 개별 키에 prop 드릴링 없이 전달(패널 로컬).
const PanelCtx = createContext<{ p: KaPalette; s: KaSizes }>({ p: kaPalette('light'), s: kaSizes('md') });

// ── 일반(원샷) 특수키 ──
const Cap: React.FC<{ label: string; onPress: () => void; w?: number; flex?: number; big?: boolean }> = ({ label, onPress, w, flex, big }) => {
  const [down, setDown] = useState(false);
  const { p, s } = useContext(PanelCtx);
  return (
    <Pressable
      onPressIn={() => { setDown(true); haptic.keyPress(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      style={{ width: w, flex, height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: down ? p.keyDown : p.key, elevation: 1 }}
    >
      <Text style={{ color: p.keyText, fontSize: big ? s.panelFont + 5.5 : s.panelFont, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
};

// ── 모디파이어 키(상태: off/once/lock) ──
const Mod: React.FC<{ label: string; state: ModState; onTap: () => void; onHold: () => void; w?: number; flex?: number }> = ({ label, state, onTap, onHold, w, flex }) => {
  const [down, setDown] = useState(false);
  const { p, s } = useContext(PanelCtx);
  const bg = state === 'lock' ? '#1D4ED8' : state === 'once' ? '#3B82F6' : (down ? p.keyDown : p.modOff);
  const fg = state !== 'off' ? '#FFFFFF' : p.modOffText;
  return (
    <Pressable
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => { haptic.keyTap(); onTap(); }}
      onLongPress={() => { haptic.holdOpen(); onHold(); }}
      delayLongPress={230}
      style={{ width: w, flex, height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: bg, elevation: 1 }}
    >
      <Text style={{ color: fg, fontSize: s.panelModFont, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
      {/* 잠금(lock) 표시 — 작은 노란 점(once 와 구분). */}
      {state === 'lock' && <View style={{ position: 'absolute', top: 4, right: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: '#FCD34D' }} />}
    </Pressable>
  );
};

const Sp: React.FC<{ f?: number }> = ({ f = 1 }) => <View style={{ flex: f }} />;
const Rw: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>{children}</View>
);

/**
 * 실물 키보드 특수키 패널 — OS 키보드를 내리고 그 자리(같은 높이)에 렌더.
 * 실제 Mac/Windows 키보드 배치를 흉내: esc/tab/caps/shift 좌측 세로, 모디파이어 하단,
 * ⌫/⏎ 우측, 방향키 역T자 우하단, 가운데(글자 자리)는 여백. 글자키는 없음.
 * 모디파이어를 잠근 채 보조바 ⌨︎ 로 OS 키보드에 복귀하면 글자 입력이 조합으로 발동(호스트 처리).
 */
const SpecialKeyPanel: React.FC<Props> = ({ height, os, mods, onTapMod, onHoldMod, onKey, palette, sizes }) => {
  const p = palette ?? kaPalette('light');
  const s = sizes ?? kaSizes('md');
  const isMac = os === 'mac';
  // 하단 모디파이어 라벨/순서 — 실물 키보드 규약(Win: Ctrl·Win·Alt / Mac: ⌃control·⌥option·⌘).
  const mFn = isMac ? 'fn' : 'Fn';
  const mCtrl = isMac ? 'control' : 'Ctrl';
  const mAlt = isMac ? 'option' : 'Alt';
  const mMeta = isMac ? '⌘' : 'Win';
  const shiftL = isMac ? '⇧' : 'Shift';
  const capsL = isMac ? 'caps lock' : 'Caps';
  // 일반 특수키 라벨도 실물 규약으로 — Mac: return/delete, Win: Enter/⌫.
  const enterL = isMac ? 'return' : 'Enter';
  const bsL = isMac ? 'delete' : '⌫';
  // 하단 모디파이어 순서(좌측만 — 폭 제약상 우측 중복 모디파이어는 생략).
  const bottomMods: Array<[ModId, string]> = isMac
    ? [['fn', mFn], ['ctrl', mCtrl], ['alt', mAlt], ['meta', mMeta]]
    : [['fn', mFn], ['ctrl', mCtrl], ['meta', mMeta], ['alt', mAlt]];

  return (
    <PanelCtx.Provider value={{ p, s }}>
    <View style={{ height, backgroundColor: p.panelBg, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6, gap: GAP }}>
      {/* 1행 — esc(좌) / (Win) Home·End·⌫ · (Mac) delete
          실물: Mac 은 Home/End 전용키가 없음(fn+←/→) → 우측엔 delete 만. Win 은 Home·End·Backspace. */}
      <Rw>
        <Cap label="esc" onPress={() => onKey('Escape')} w={62} />
        <Sp />
        {!isMac && <Cap label="Home" onPress={() => onKey('Home')} w={54} />}
        {!isMac && <Cap label="End" onPress={() => onKey('End')} w={54} />}
        <Cap label={bsL} onPress={() => onKey('Backspace')} w={isMac ? 72 : 56} big={!isMac} />
      </Rw>

      {/* 2행 — tab(좌) / (Win) PgUp·PgDn·Del(우) — Mac 은 해당 전용키 없음(fn+화살표/fn+delete) */}
      <Rw>
        <Cap label="tab" onPress={() => onKey('Tab')} w={74} />
        <Sp />
        {!isMac && <Cap label="PgUp" onPress={() => onKey('PageUp')} w={54} />}
        {!isMac && <Cap label="PgDn" onPress={() => onKey('PageDown')} w={54} />}
        {!isMac && <Cap label="Del" onPress={() => onKey('Delete')} w={56} />}
      </Rw>

      {/* 3행 — caps(좌) / return·Enter(우) */}
      <Rw>
        <Mod label={capsL} state={mods.caps} onTap={() => onTapMod('caps')} onHold={() => onHoldMod('caps')} w={86} />
        <Sp />
        <Cap label={enterL} onPress={() => onKey('Enter')} w={92} />
      </Rw>

      {/* 4행 — shift(좌) / 방향키 ↑(우, ← ↓ → 의 가운데 칸 위에 정렬) */}
      <Rw>
        <Mod label={shiftL} state={mods.shift} onTap={() => onTapMod('shift')} onHold={() => onHoldMod('shift')} w={110} />
        <Sp />
        <View style={{ width: ACW, flexDirection: 'row', gap: GAP }}>
          <View style={{ width: ARROW_W }} />
          <Cap label="↑" onPress={() => onKey('ArrowUp')} w={ARROW_W} big />
          <View style={{ width: ARROW_W }} />
        </View>
      </Rw>

      {/* 5행 — 모디파이어(좌) / 방향키 ← ↓ →(우) */}
      <Rw>
        {bottomMods.map(([id, label]) => (
          <Mod key={'b' + id} label={label} state={mods[id]} onTap={() => onTapMod(id)} onHold={() => onHoldMod(id)} w={MOD_W} />
        ))}
        <Sp />
        <View style={{ width: ACW, flexDirection: 'row', gap: GAP }}>
          <Cap label="←" onPress={() => onKey('ArrowLeft')} w={ARROW_W} big />
          <Cap label="↓" onPress={() => onKey('ArrowDown')} w={ARROW_W} big />
          <Cap label="→" onPress={() => onKey('ArrowRight')} w={ARROW_W} big />
        </View>
      </Rw>
    </View>
    </PanelCtx.Provider>
  );
};

export default SpecialKeyPanel;
