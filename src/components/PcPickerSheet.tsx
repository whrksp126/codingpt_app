import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Laptop, CaretRight } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import type { DaemonRunner } from '../services/daemonService';

const C = v2.colors;
const R = v2.radius;

// PC 선택 시트 — 연결된 PC가 여러 대일 때 폴더 선택 전에 대상 PC를 고른다.
//  '내 PC 연결' 확인 시트와 같은 톤(바텀시트 + 행 리스트).
export default function PcPickerSheet({ visible, hosts, onPick, onClose }: {
  visible: boolean;
  hosts: DaemonRunner[];
  onPick: (host: number, name: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>어느 PC에 만들까요?</Text>
        <Text style={{ fontSize: 12, color: C.textDim, marginBottom: 14 }}>워크스페이스를 만들 PC를 선택하세요.</Text>

        {hosts.map((h) => (
          <Pressable key={h.deviceId} onPress={() => onPick(h.deviceId, h.deviceName || 'PC')} android_ripple={{ color: C.elevated2 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, marginBottom: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
              <Laptop size={20} color={C.text2} weight="fill" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }} numberOfLines={1}>{h.deviceName || 'PC'}</Text>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent }} />
              </View>
              {h.platform ? <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 2 }}>{h.platform}</Text> : null}
            </View>
            <CaretRight size={16} color={C.textDim} />
          </Pressable>
        ))}

        <Pressable onPress={onClose} style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 4 }}>
          <Text style={{ color: C.textDim, fontSize: 13 }}>취소</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
