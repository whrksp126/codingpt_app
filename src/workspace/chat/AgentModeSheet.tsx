import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import Sheet from '../../components/ui/Sheet';
import PressableRow from '../../components/ui/PressableRow';
import { agentModeChoices, agentModeIsOn, type AgentMode, type AgentModeItem } from '../chatModel';
import * as i18n from '../../i18n/index.ts';

// 에이전트 권한 모드 고르기 — TUI 에서 shift+tab 으로만 바꾸던 그 모드를 채팅에서 직접 고른다
//  (사용자 요청 2026-08-01: "지금 설정된 게 보이고, 채팅에서 더 쉽게 조작").
//
// 표기 규율:
//  · 라벨은 **TUI 원문 그대로**(사용자 확정) — 'auto mode on' 같은 화면 문구를 번역하지 않는다.
//    TUI 를 보다가 채팅으로 와도 같은 단어라 "이게 그거"라는 판단에 추론이 끼지 않는다.
//  · 설명(desc)만 한국어 한 줄 — 원문 라벨만으로는 무엇이 승인 없이 실행되는지 알 수 없다.
//  · 카탈로그/선택지 규칙은 `chatModel.ts` 가 정본이고 PC(`chat-model.js`)와 동시 수정 대상이다.
//
// PC 미러: `codingpt_pc/src/js/chat-view.js` 의 `.chat-mode-menu`(컴포저 위 팝오버). 모바일은 같은
//  내용을 바텀시트로 낸다 — 폰에서 컴포저 위 팝오버는 키보드/좁은 폭과 겹쳐 읽기 어렵다.
export default function AgentModeSheet({ visible, onClose, current, busy, onPick, choices: given }: {
  /**
   * 선택지를 밖에서 준다 — 채팅 v2(구조화 대화)는 터미널 화면이 없어 TUI 원문 라벨 대신 사람이 읽는 이름을 쓴다.
   *  주면 그 목록을 그대로 그리고(설명은 이미 번역된 값), TUI 안내 문구는 그리지 않는다. 미지정 = 예전 그대로.
   */
  choices?: AgentModeItem[];
  visible: boolean;
  onClose: () => void;
  /** 지금 모드({id,label,symbol}) — 데몬이 터미널 화면에서 읽은 값. */
  current: AgentMode | null;
  /** 전환 요청 진행 중(데몬이 TUI 를 순환시키는 동안) — 중복 탭 차단 + 스피너. */
  busy?: boolean;
  onPick: (id: string) => void;
}) {
  const C = v2.colors;
  const choices = given && given.length ? given : agentModeChoices(current || null);
  // 양쪽 다 shift+tab 이 바꾸는 것만 담는다 — claude 는 순환, codex 는 두 상태 전환.
  const isCodex = choices.some((m) => m.id.startsWith('codex'));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      paddingHorizontal={8}
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 8 }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: v2.font.size.h2, fontWeight: '600', color: C.text, fontFamily: v2.font.sans }}>{i18n.t('에이전트 모드')}</Text>
          {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
        </View>
      )}
    >
      {choices.map((m) => {
        const on = agentModeIsOn(m, current || null);
        return (
          <PressableRow
            key={m.id}
            onPress={() => { if (busy) return; haptic.keyPress(); onPick(m.id); }}
            selected={on}
            accessibilityLabel={m.label}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8,
              opacity: busy && !on ? 0.5 : 1,
            }}
          >
            {/* 모드 심볼(⏸/⏵⏵)은 그리지 않는다 — 사용자 확정 2026-08-02(왼쪽 아이콘 제거). 라벨이 정본. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: on ? '500' : '400' }}>{m.label}</Text>
              <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.small, marginTop: 1 }}>{i18n.t(m.desc)}</Text>
            </View>
            {on ? <Check size={16} color={C.text} weight="bold" /> : null}
          </PressableRow>
        );
      })}

      {/* TUI 와 같은 조작이라는 것을 알려 준다 — 폰에서 바꾼 값이 PC 화면에도 그대로 반영된다. */}
      {given && given.length ? null : (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, paddingHorizontal: 10, paddingTop: 8 }}>
          {isCodex ? i18n.t('터미널(TUI)에서는 shift+tab 으로 전환합니다 · 권한은 /permissions') : i18n.t('터미널(TUI)에서는 shift+tab 으로 순환합니다')}
        </Text>
      )}
    </Sheet>
  );
}
