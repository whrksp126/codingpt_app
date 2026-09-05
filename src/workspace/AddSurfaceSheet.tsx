import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalWindow, Code, Globe, DeviceMobile, CaretRight } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import * as T from './tiling';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;
const R = v2.radius;

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
export default function AddSurfaceSheet({ visible, onPick, onClose }: {
  visible: boolean;
  onPick: (kind: T.PaneKind) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const rows: Array<{ kind: T.PaneKind; label: string; icon: React.ReactNode; more?: boolean }> = [
    { kind: 'terminal', label: i18n.t('터미널'), icon: <TerminalWindow size={19} color={C.text2} />, more: true },
    { kind: 'ide', label: i18n.t('IDE'), icon: <Code size={19} color={C.text2} /> },
    { kind: 'preview', label: i18n.t('웹뷰'), icon: <Globe size={19} color={C.text2} />, more: true },
    { kind: 'emulator', label: i18n.t('모바일 화면'), icon: <DeviceMobile size={19} color={C.text2} /> },
  ];
  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* PC처럼 배경을 가리지 않는 메뉴. 바깥 영역은 닫기만 담당한다. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{
        position: 'absolute', top: insets.top + 50, right: 8, width: 200,
        backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl,
        borderRadius: 12, paddingVertical: 5,
        shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 }, elevation: 8,
      }}>
        {rows.map((r) => (
          <Pressable
            key={r.kind}
            onPress={() => onPick(r.kind)}
            android_ripple={{ color: C.elevated2 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 9, height: 40, paddingHorizontal: 12, borderRadius: R.md }}
          >
            <View style={{ width: 20, alignItems: 'center' }}>{r.icon}</View>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: C.text, fontFamily: v2.font.sans }}>{r.label}</Text>
            {r.more ? <CaretRight size={15} color={C.textDim} /> : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}
