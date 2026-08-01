import React from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import { agentModeChoices, type AgentMode } from '../chatModel';

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
export default function AgentModeSheet({ visible, onClose, current, busy, onPick }: {
  visible: boolean;
  onClose: () => void;
  /** 지금 모드({id,label,symbol}) — 데몬이 터미널 화면에서 읽은 값. */
  current: AgentMode | null;
  /** 전환 요청 진행 중(데몬이 TUI 를 순환시키는 동안) — 중복 탭 차단 + 스피너. */
  busy?: boolean;
  onPick: (id: string) => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const insets = useSafeAreaInsets();
  const curId = current?.id || null;

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>에이전트 모드</Text>
          {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
        </View>

        {agentModeChoices(curId).map((m) => {
          const on = m.id === curId;
          return (
            <Pressable
              key={m.id}
              onPress={() => { if (busy) return; haptic.keyPress(); onPick(m.id); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11,
                borderRadius: R.sm, backgroundColor: on ? C.elevated2 : 'transparent', opacity: busy && !on ? 0.5 : 1,
              }}
            >
              <Text style={{ color: C.text3, fontSize: 12, width: 22 }}>{m.symbol}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.text, fontSize: 14 }}>{m.label}</Text>
                <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginTop: 1 }}>{m.desc}</Text>
              </View>
              {on ? <Check size={15} color={C.text} weight="bold" /> : null}
            </Pressable>
          );
        })}

        {/* TUI 와 같은 조작이라는 것을 알려 준다 — 폰에서 바꾼 값이 PC 화면에도 그대로 반영된다. */}
        <Text style={{ color: C.textDim, fontSize: 11.5, paddingHorizontal: 10, paddingTop: 8 }}>
          터미널(TUI)에서는 shift+tab 으로 순환합니다
        </Text>
      </View>
    </Modal>
  );
}
