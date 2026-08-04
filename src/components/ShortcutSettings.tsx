import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';

import { v2 } from '../theme/v2Tokens';
import PressableScale from './ui/PressableScale';
import { commandsFor, formatCombo, findConflicts, NAMED_KEYS, normalizeCombo } from '../palette/commands';
import * as SC from '../palette/shortcuts';
import { tx } from '../text';
import { PALETTE_TEXT } from '../text/palette';
import * as i18n from '../i18n/index.ts';

const TX = tx(PALETTE_TEXT);

// 단축키 설정(앱) — PC(`codingpt_pc/src/js/shortcuts-view.js`)의 미러.
//
// 폰과 PC 의 결정적 차이: **폰에는 keydown 을 가로챌 창이 없다.** RN 은 하드웨어 키보드 이벤트를
//  전역으로 주지 않는다. 그래서 조합을 "눌러서" 잡을 수 없고, 대신 **고르게** 한다
//  (수식어 토글 + 키 고르기). 화면은 달라도 저장 형식(`Mod+Shift+D`)과 판정은 PC 와 같은 파일이다.
//
// 하드웨어 키보드로 실제로 눌리는 자리는 **터미널·에디터 웹뷰 안**이다(RN 은 하드웨어 키를 안 준다).
//  규칙은 ⌘=앱 / Ctrl·Alt=터미널 — 판정과 그 이유는 palette/webviewKeys.ts. 값은 계정 동기화라
//  PC 에서 바꾼 것이 여기 보이고, 여기서 바꾼 것이 PC 에 간다.

const MODS = [
  // ⌘ 자리는 안드로이드에선 Meta(윈도·검색) 키다 — 표기는 하나로 두고 아래 modHintApp 이 설명한다.
  { k: 'Mod', label: '⌘' },
  { k: 'Alt', label: '⌥' },
  { k: 'Shift', label: '⇧' },
];

/** 고를 수 있는 키 — 글자·숫자·자주 쓰는 특수키. 목록이 길면 고르기가 더 어려워진다. */
const PICKABLE = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'1234567890'.split(''),
  'Comma', 'Period', 'Slash', 'Backquote', 'Minus', 'Equal',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Enter', 'Space', 'Tab', 'Escape', 'Backspace', 'Delete',
  ...NAMED_KEYS.filter((n) => /^F(?:[1-9]|1[0-2])$/.test(n)),
];

export default function ShortcutSettings() {
  const C = v2.colors;
  const binds = SC.useShortcuts();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const conflicts = useMemo(() => findConflicts(binds), [binds]);
  const q = filter.trim().toLowerCase();

  const rows = useMemo(() => commandsFor('app').map((c) => {
    const label = TX.cmd[c.id] || c.id;
    const groupName = TX.group[c.group] || c.group;
    const combo = binds[c.id];
    const shown = combo ? formatCombo(combo, SC.IS_APPLE) : '';
    return { c, label, groupName, combo, shown };
  }).filter((r) => !q || `${r.label} ${r.groupName} ${r.c.id} ${r.shown}`.toLowerCase().includes(q)),
  [binds, q]);

  return (
    <View>
      <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 19, marginBottom: 4 }}>
        {TX.sc.note}
      </Text>
      <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 19, marginBottom: 12 }}>
        {TX.sc.modHintApp}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder={TX.sc.search}
          placeholderTextColor={C.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1, minWidth: 0, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9,
            borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
            color: C.text, fontSize: 13,
          }}
        />
        <PressableScale onPress={() => { void SC.resetAll(); setEditing(null); }}>
          <View style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: C.borderControl }}>
            <Text style={{ color: C.text2, fontSize: 12.5 }}>{TX.sc.resetAll}</Text>
          </View>
        </PressableScale>
      </View>

      {Object.keys(conflicts).length ? (
        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>{TX.sc.conflictNote}</Text>
      ) : null}

      {rows.length === 0 ? (
        <Text style={{ color: C.textDim, fontSize: 13, paddingVertical: 20, textAlign: 'center' }}>{TX.empty}</Text>
      ) : null}

      {rows.map((r, i) => {
        const prev = rows[i - 1];
        const head = !prev || prev.groupName !== r.groupName ? r.groupName : null;
        const clash = !!(r.combo && conflicts[r.combo]);
        const isEditing = editing === r.c.id;
        return (
          <View key={r.c.id}>
            {head ? (
              <Text style={{ color: C.textDim, fontSize: 11, paddingTop: 12, paddingBottom: 4 }}>{head}</Text>
            ) : null}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 9, borderTopWidth: head ? 0 : 1, borderTopColor: C.borderControl,
            }}>
              <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13.5 }}>{r.label}</Text>
              {clash ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
                  <Text style={{ color: C.text2, fontSize: 10.5 }}>{TX.sc.conflict}</Text>
                </View>
              ) : null}
              <PressableScale onPress={() => setEditing(isEditing ? null : r.c.id)}>
                <View style={{
                  minWidth: 78, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 8, borderWidth: 1, borderColor: C.borderControl,
                  borderStyle: isEditing ? 'dashed' : 'solid',
                  backgroundColor: C.elevated2,
                }}>
                  <Text style={{ color: r.combo ? C.text : C.textDim, fontSize: 12.5 }}>
                    {r.shown || TX.sc.none}
                  </Text>
                </View>
              </PressableScale>
              {!SC.isDefault(r.c.id) ? (
                <Pressable onPress={() => { void SC.resetBinding(r.c.id); }} hitSlop={6}>
                  <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.sc.reset}</Text>
                </Pressable>
              ) : r.combo ? (
                <Pressable onPress={() => { void SC.setBinding(r.c.id, null); }} hitSlop={6}>
                  <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.sc.unbind}</Text>
                </Pressable>
              ) : null}
            </View>
            {isEditing ? (
              <ComboPicker
                current={r.combo}
                onPick={(combo) => { void SC.setBinding(r.c.id, combo); setEditing(null); }}
                onClear={() => { void SC.setBinding(r.c.id, null); setEditing(null); }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 조합 고르기 — 수식어 토글 + 키 하나. **누르는 것이 아니라 고르는 것**이라, 만든 조합이 유효한지
 *  즉시 보여 준다(수식어 없는 글자는 못 쓴다 — 터미널에 글자를 칠 수 없게 되니까).
 */
function ComboPicker({ current, onPick, onClear }: {
  current: string | null;
  onPick: (combo: string) => void;
  onClear: () => void;
}) {
  const C = v2.colors;
  const parts = (current || '').split('+');
  const [mods, setMods] = useState<string[]>(MODS.map((m) => m.k).filter((k) => parts.includes(k)));
  const [key, setKey] = useState<string | null>(parts.length ? parts[parts.length - 1] : null);

  const combo = useMemo(() => {
    if (!key) return null;
    return normalizeCombo([...mods, key].join('+'));
  }, [mods, key]);

  const toggle = useCallback((k: string) => {
    setMods((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }, []);

  return (
    <View style={{ paddingVertical: 8, paddingHorizontal: 2, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {MODS.map((m) => (
          <PressableScale key={m.k} onPress={() => toggle(m.k)}>
            <View style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              borderWidth: 1, borderColor: C.borderControl,
              backgroundColor: mods.includes(m.k) ? C.elevated2 : 'transparent',
            }}>
              <Text style={{ color: mods.includes(m.k) ? C.text : C.textDim, fontSize: 13 }}>{m.label}</Text>
            </View>
          </PressableScale>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={{ color: combo ? C.text : C.textDim, fontSize: 13 }}>
          {combo ? formatCombo(combo, SC.IS_APPLE) : TX.sc.none}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        {PICKABLE.map((k) => (
          <PressableScale key={k} onPress={() => setKey(k)}>
            <View style={{
              minWidth: 34, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8,
              borderWidth: 1, borderColor: C.borderControl,
              backgroundColor: key === k ? C.elevated2 : 'transparent',
            }}>
              <Text style={{ color: key === k ? C.text : C.text2, fontSize: 12.5 }}>
                {formatCombo(`Mod+${k}`, true).slice(1) || k}
              </Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PressableScale onPress={() => combo && onPick(combo)}>
          <View style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9,
            borderWidth: 1, borderColor: C.borderControl,
            backgroundColor: combo ? C.elevated2 : 'transparent', opacity: combo ? 1 : 0.45,
          }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{i18n.t('적용')}</Text>
          </View>
        </PressableScale>
        <PressableScale onPress={onClear}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: C.borderControl }}>
            <Text style={{ color: C.text2, fontSize: 13 }}>{TX.sc.unbind}</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
