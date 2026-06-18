import React from 'react';
import { View, Pressable } from 'react-native';
import { List, PencilSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';

const C = v2.colors;

// 좌측 드로어를 여는 햄버거 버튼 — 어느 화면에서든 좌상단에 배치.
export function HamburgerButton({ color = C.text }: { color?: string }) {
  const { openDrawer } = useDrawer();
  return (
    <Pressable onPress={openDrawer} hitSlop={10} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
      <List size={24} color={color} />
    </Pressable>
  );
}

// 홈 상단바: 햄버거(좌) + 새 채팅(우)
export function AppTopBar({ onNewChat }: { onNewChat?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 48 }}>
      <HamburgerButton />
      {onNewChat ? (
        <Pressable onPress={onNewChat} hitSlop={10} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
          <PencilSimple size={21} color={C.text2} />
        </Pressable>
      ) : <View style={{ width: 38 }} />}
    </View>
  );
}
