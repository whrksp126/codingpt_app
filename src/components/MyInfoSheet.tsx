import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Dimensions, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { List, ArrowLeft, GearSix } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useDrawer } from '../contexts/DrawerContext';
import MyInfoContent from '../screens/MyInfo/MyInfoContent';
import SettingsContent from '../screens/Settings/SettingsContent';
import AccountContent from '../screens/Settings/AccountContent';
import GithubConnectModal from './Github/GithubConnectModal';

const C = v2.colors;
const W = Dimensions.get('window').width;
const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };
// 등장 효과: 드로어의 다른 항목(워크스페이스/배우기/최근작업 = 탭 'fade')과 통일하기 위해 시트도 페이드 인.
const FADE = { duration: 240, easing: Easing.out(Easing.cubic) };

// 상단 고정 헤더 (스크롤해도 항상 상단)
function SheetHeader({
  topInset, left, title, right,
}: { topInset: number; left: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ paddingTop: Math.max(topInset, 10), backgroundColor: C.base, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
        {left}
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: C.text }}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

const HitBtn: React.FC<{ onPress?: () => void; children: React.ReactNode }> = ({ onPress, children }) => (
  <Pressable onPress={onPress} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </Pressable>
);

export default function MyInfoSheet() {
  const { open, step, githubOpen, pushSettings, pushAccount, back, close, closeGithub } = useMyInfo();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();

  const sheetOpacity = useSharedValue(0); // 닫힘=0, 열림=1 — 탭 전환(fade)과 등장 효과 통일
  const trackX = useSharedValue(0); // info=0, child(settings/account)=-W

  // 자식 패널 종류 — info 로 돌아가도 슬라이드아웃 동안 콘텐츠 유지되도록 보존
  const [childType, setChildType] = useState<'settings' | 'account'>('settings');
  useEffect(() => {
    if (step === 'settings' || step === 'account') setChildType(step);
  }, [step]);

  useEffect(() => {
    sheetOpacity.value = withTiming(open ? 1 : 0, FADE);
  }, [open, sheetOpacity]);

  useEffect(() => {
    trackX.value = withTiming(step === 'info' ? 0 : -W, TIMING);
  }, [step, trackX]);

  // 안드로이드 하드웨어 백: 자식 스텝이면 뒤로, info면 드로어로 복귀(시트는 드로어에서 진입)
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step !== 'info') { back(); return true; }
      close();
      openDrawer();
      return true;
    });
    return () => sub.remove();
  }, [open, step, back, close, openDrawer]);

  const sheetStyle = useAnimatedStyle(() => ({ opacity: sheetOpacity.value }));
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: trackX.value }] }));

  // 좌상단 햄버거 → 시트 닫고 드로어 열기(워크스페이스/배우기 화면의 햄버거와 동일 동작).
  const toDrawer = () => { close(); openDrawer(); };

  const isAccount = childType === 'account';

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* 전체화면 시트 — 우측에서 슬라이드, 드로어는 아래 깔린 채 위에 쌓임 */}
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.base, overflow: 'hidden' },
          sheetStyle,
        ]}
      >
        {/* 2패널 트랙 (info | child) — 좌측 push */}
        <Animated.View style={[{ flexDirection: 'row', width: W * 2, height: '100%' }, trackStyle]}>
          {/* 내 정보 패널 */}
          <View style={{ width: W, height: '100%' }}>
            <SheetHeader
              topInset={insets.top}
              left={<HitBtn onPress={toDrawer}><List size={22} color={C.text} /></HitBtn>}
              title="내 정보"
              right={<HitBtn onPress={pushSettings}><GearSix size={21} color={C.text2} /></HitBtn>}
            />
            <View style={{ flex: 1 }}>
              <MyInfoContent onOpenAccount={pushAccount} />
            </View>
          </View>

          {/* 자식 패널 (설정 또는 계정) */}
          <View style={{ width: W, height: '100%' }}>
            <SheetHeader
              topInset={insets.top}
              left={<HitBtn onPress={back}><ArrowLeft size={22} color={C.text} /></HitBtn>}
              title={isAccount ? '계정' : '설정'}
            />
            <View style={{ flex: 1 }}>
              {isAccount ? <AccountContent /> : <SettingsContent />}
            </View>
          </View>
        </Animated.View>

        {/* GitHub 연결 — 트랙 위 전체화면(계정 헤더까지 덮음), 우측 슬라이드 */}
        <GithubConnectModal visible={githubOpen} onClose={closeGithub} />
      </Animated.View>
    </View>
  );
}
