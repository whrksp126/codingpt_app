import { useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';

// 전역 하드웨어 뒤로가기 처리 (Tabs() 내부에 마운트).
//  1) 좌측 드로어 열림 → 닫기
//  2) 내 정보 시트 열림 → 시트 자체 핸들러가 먼저 처리(LIFO) → 여기선 패스
//  3) 메인 탭 루트(채팅/워크스페이스/배우기/내정보)에서 → "한 번 더 누르면 종료" 토스트 + 더블백 종료
//  4) 그 외(서브 스크린·풀스크린 플로우) → 기본 동작(pop)
const EXIT_WINDOW_MS = 2000;

export default function AppBackHandler() {
  const nav = useNavigation<any>();
  const { open: drawerOpen, closeDrawer } = useDrawer();
  const { open: sheetOpen } = useMyInfo();
  const lastBack = useRef(0);

  useEffect(() => {
    const onBack = () => {
      if (drawerOpen) { closeDrawer(); return true; }
      if (sheetOpen) return false; // 시트 자체 BackHandler 가 처리

      // 루트 스택이 Tabs 이고, 포커스된 탭의 네이티브 스택이 루트인지 판정.
      const rootState = nav.getState?.();
      const topRoute = rootState?.routes?.[rootState.index];
      const atRootStack = rootState?.index === 0 && topRoute?.name === 'Tabs';
      const tabState: any = topRoute?.state;
      const focusedTab = tabState ? tabState.routes[tabState.index] : null;
      const tabStack: any = focusedTab?.state;
      const atTabRoot = !tabStack || tabStack.index === 0;

      if (atRootStack && atTabRoot) {
        const now = Date.now();
        if (now - lastBack.current < EXIT_WINDOW_MS) {
          BackHandler.exitApp();
          return true;
        }
        lastBack.current = now;
        if (Platform.OS === 'android') ToastAndroid.show('한 번 더 누르면 종료됩니다', ToastAndroid.SHORT);
        return true; // 이전 페이지로 넘어가지 않게 소비
      }
      return false; // 서브 스크린 등은 기본 pop
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [drawerOpen, sheetOpen, closeDrawer, nav]);

  return null;
}
