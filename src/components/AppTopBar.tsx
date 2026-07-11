import React from 'react';
import { View, Pressable } from 'react-native';
import { List, PencilSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';

const C = v2.colors;

// 사이드바 토글 버튼 — 어느 화면에서든 좌상단.
//  · 폰: 오버레이 드로어 열기. · 태블릿: 도킹 사이드바 접기/펼치기.
export function HamburgerButton({ color = C.text }: { color?: string }) {
  const { openDrawer, toggleDocked } = useDrawer();
  const { isWide } = useResponsive();
  return (
    <Pressable onPress={isWide ? toggleDocked : openDrawer} hitSlop={10} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
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
