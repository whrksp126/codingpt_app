import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Appearance, ColorSchemeName, StyleSheet, View, StatusBar, Platform } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nwColorScheme } from 'nativewind';
import { applyV2Palette } from '../theme/v2Tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'app_theme';

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedScheme: 'light' | 'dark';
  setTheme: (next: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolve(theme: ThemePreference, system: ColorSchemeName): 'light' | 'dark' {
  if (theme === 'system') return system === 'dark' ? 'dark' : 'light';
  return theme;
}

function applyToNativeWind(theme: ThemePreference) {
  // NativeWind v4: dark: variant 활성화
  nwColorScheme.set(theme);
}

// 상태바 = 앱 배경색 + 테마 아이콘. 명령형 API 로 직접 칠함 — declarative <StatusBar> 는 재렌더 시
// 스택 병합이 기기별로 flaky(색/아이콘이 테마 전환에 안 따라옴), native AppTheme 의 windowLightStatusBar
// 고정도 못 덮는 사례가 있어 setBarStyle/setBackgroundColor 를 스킴 확정 즉시 강제한다.
// (App.tsx 의 render-cascade 에 의존하면 페이드가 끝난 뒤에야 반영돼 "한 박자 늦음"이 생김 → 여기서 eager 적용)
function syncStatusBar(scheme: 'light' | 'dark') {
  StatusBar.setBarStyle(scheme === 'dark' ? 'light-content' : 'dark-content', true);
  if (Platform.OS === 'android') {
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor(scheme === 'dark' ? '#0A0D14' : '#F2F4F8', true);
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 기본 = 시스템 추종(라이트 모드 지원 — 2026-07-21). 저장값 있으면 그걸 사용.
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [overlayColor, setOverlayColor] = useState<string>('#0A0D14');

  const overlayOpacity = useSharedValue(0);
  // 동시에 들어오는 setTheme 호출이 fade out을 덮어쓰지 않도록 진행 중 플래그 유지
  const transitioningRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const initial: ThemePreference =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      setThemeState(initial);
      applyToNativeWind(initial);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const finishTransition = useCallback((next: ThemePreference) => {
    setThemeState(next);
    applyToNativeWind(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    overlayOpacity.value = withTiming(
      0,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => {
        transitioningRef.current = false;
      },
    );
  }, [overlayOpacity]);

  const setTheme = useCallback(async (next: ThemePreference) => {
    // 상태바는 렌더 캐스케이드를 기다리지 않고 탭 즉시 flip(들어오는 오버레이 색과 동시에) — "한 박자 늦음" 제거.
    syncStatusBar(resolve(next, systemScheme));
    if (next === theme || transitioningRef.current) {
      // 같은 테마 선택은 페이드 없이 즉시 반영
      setThemeState(next);
      applyToNativeWind(next);
      await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return;
    }
    transitioningRef.current = true;
    const nextResolved = resolve(next, systemScheme);
    setOverlayColor(nextResolved === 'dark' ? '#0A0D14' : '#F2F4F8');
    overlayOpacity.value = withTiming(
      1,
      { duration: 220, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishTransition)(next);
      },
    );
  }, [theme, systemScheme, overlayOpacity, finishTransition]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const resolvedScheme = resolve(theme, systemScheme);
  // 자식 렌더 전에 v2 토큰 팔레트를 현재 테마로 교체(멱등 — 같은 값이면 no-op).
  // 소비처는 리마운트(App.tsx Main 의 key=resolvedScheme)로 새 값을 다시 읽는다.
  applyV2Palette(resolvedScheme);

  // 상태바 백업 동기화 — 시스템 테마 변경(Appearance)·초기 마운트·스토어 로드로 resolvedScheme 가
  // setTheme 을 안 거치고 바뀌는 경로 커버. setTheme 의 eager flip 과 멱등.
  useEffect(() => {
    syncStatusBar(resolvedScheme);
  }, [resolvedScheme]);

  const value: ThemeContextValue = {
    theme,
    resolvedScheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.overlay,
            { backgroundColor: overlayColor },
            overlayStyle,
          ]}
        />
      </View>
    </ThemeContext.Provider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { zIndex: 9999, elevation: 9999 },
});

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
