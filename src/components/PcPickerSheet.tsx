import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Laptop, CaretRight } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Sheet, PressableRow } from './ui';
import type { DaemonRunner } from '../services/daemonService';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

// PC 선택 시트 — 연결된 PC가 여러 대일 때 폴더 선택 전에 대상 PC를 고른다.
//  '내 PC 연결' 확인 시트와 같은 톤(바텀시트 + 행 리스트).
export default function PcPickerSheet({ visible, hosts, onPick, onClose }: {
  visible: boolean;
  hosts: DaemonRunner[];
  onPick: (host: number, name: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      header={
        <View style={{ paddingBottom: 12 }}>
          <Text style={{ fontSize: v2.font.size.h2, fontWeight: v2.font.weight.semibold, color: C.text }}>{i18n.t('어느 PC에서 선택할까요?')}</Text>
          <Text style={{ fontSize: v2.font.size.small, color: C.textDim, marginTop: 4 }}>{i18n.t('프로젝트 폴더가 있는 PC를 선택하세요.')}</Text>
        </View>
      }
    >
      {hosts.map((h) => (
        <PressableRow key={h.deviceId} onPress={() => onPick(h.deviceId, h.deviceName || 'PC')} radius={v2.radius.md}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, marginBottom: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: v2.radius.lg, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Laptop size={20} color={C.text2} weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: v2.font.size.body, fontWeight: v2.font.weight.medium, color: C.text }} numberOfLines={1}>{h.deviceName || 'PC'}</Text>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.cta }} />
            </View>
            {h.platform ? <Text style={{ fontSize: v2.font.size.small, color: C.textDim, marginTop: 2 }}>{h.platform}</Text> : null}
          </View>
          <CaretRight size={16} color={C.textDim} />
        </PressableRow>
      ))}

      <Pressable onPress={onClose} style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 4 }}>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{i18n.t('취소')}</Text>
      </Pressable>
    </Sheet>
  );
}
