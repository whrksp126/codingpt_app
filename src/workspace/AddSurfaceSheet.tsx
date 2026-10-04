import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalWindow, Globe, DeviceMobile, CaretRight, ChatCircle } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { PressableRow } from '../components/ui';
import * as T from './tiling';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;
const R = v2.radius;

// 팝오버 등장 — 150ms 페이드 + scale .98→1 (설계 §0.4). 퇴장은 즉시.
const popEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: { opacity: withTiming(1, { duration: 150 }), transform: [{ scale: withTiming(1, { duration: 150 }) }] },
  };
};

/**
 * 헤더 [+] 팝오버 — 추가할 수 있는 표면 4종(PC `openAddMenu` 미러).
 *
 * 예전엔 헤더에 터미널·IDE·웹뷰·모바일화면 아이콘 4개가 나란히 있었다. 아이콘만으로 "무엇을 여는
 * 버튼인지" 구분해야 해서 매번 눌러 봐야 했고, 종류가 늘 때마다 헤더가 길어졌다(2026-08-14 개편).
 *
 * `›` 는 "여기서 끝나지 않는다"는 표시다 — 터미널은 설치된 에이전트 목록으로, 웹뷰는 열린 포트
 * 목록으로 이어진다. 그 두 목록은 각각 AddTerminalMenu·PortsSheet 가 정본이라 여기서 다시
 * 구현하지 않는다(두 벌이 되면 한쪽만 고쳐지는 결함이 된다).
 */
export default function AddSurfaceSheet({ visible, onPick, onClose, hideChat }: {
  visible: boolean;
  /** 채팅(채팅 v2)을 쓸 수 없는 조합이면 그 행을 그리지 않는다(서버 킬스위치 — caps 교집합). */
  hideChat?: boolean;
  onPick: (kind: T.PaneKind | 'desktop:macos' | 'desktop:linux') => void;   // desktop:<os> = 에이전트 PC(그 OS VM — 둘 다 동시 가능)
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const rows: Array<{ kind: T.PaneKind | 'desktop:macos' | 'desktop:linux'; label: string; icon: React.ReactNode; more?: boolean }> = [
    { kind: 'terminal', label: i18n.t('터미널'), icon: <TerminalWindow size={18} color={C.text2} />, more: true },
    //  채팅 — 에이전트와의 구조화 대화(터미널 없이). 터미널 바로 아래: 같은 에이전트를 부르는 두 방법이라 붙여 둔다.
    ...(hideChat ? [] : [{ kind: 'chat' as const, label: i18n.t('채팅'), icon: <ChatCircle size={18} color={C.text2} /> }]),
    //  IDE 는 뺐다(2026-10 IDE 해체) — 파일은 헤더 [목록] 의 파일 트리에서 연다.
    { kind: 'preview', label: i18n.t('브라우저'), icon: <Globe size={18} color={C.text2} />, more: true },
    { kind: 'emulator', label: i18n.t('모바일 화면'), icon: <DeviceMobile size={18} color={C.text2} /> },
    //  에이전트 PC 는 뺐다(2026-10-04 QA) — 사이드바의 PC 아래 `macOS (VM)`/`Linux (VM)` 행에서 연다.
  ];
  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* PC처럼 배경을 가리지 않는 메뉴. 바깥 영역은 닫기만 담당한다. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      {/* 팝오버 규격(설계 §0.8): elevated · r-lg · borderControl 헤어라인 · 그림자 0 8 24 .40 · 행 h44 */}
      <Animated.View entering={popEnter} style={{
        position: 'absolute', top: insets.top + 50, right: 8, width: 200,
        backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl,
        borderRadius: R.lg, padding: 4,
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 }, elevation: 8,
      }}>
        {rows.map((r) => (
          <PressableRow
            key={r.kind}
            onPress={() => onPick(r.kind)}
            radius={R.sm}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}
          >
            <View style={{ width: 20, alignItems: 'center' }}>{r.icon}</View>
            <Text style={{ flex: 1, fontSize: v2.font.size.body, color: C.text, fontFamily: v2.font.sans }}>{r.label}</Text>
            {r.more ? <CaretRight size={16} color={C.textDim} /> : null}
          </PressableRow>
        ))}
      </Animated.View>
    </Modal>
  );
}
