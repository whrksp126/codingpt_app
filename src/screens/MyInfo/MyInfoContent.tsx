import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { CaretRight, Gauge, CreditCard, Plugs, GraduationCap } from 'phosphor-react-native';

import { Chip } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import { useUser } from '../../contexts/UserContext';
import { useMyInfo } from '../../contexts/MyInfoContext';
import billingService from '../../services/billingService';

const C = v2.colors;
const R = v2.radius;
const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };

function MenuRow({ icon, label, desc, onPress, last }: { icon: React.ReactNode; label: string; desc?: string; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, color: C.text, fontWeight: '600' }}>{label}</Text>
        {desc ? <Text style={{ fontSize: 12, color: C.textDim, marginTop: 2 }} numberOfLines={1}>{desc}</Text> : null}
      </View>
      <CaretRight size={16} color={C.textDim} />
    </Pressable>
  );
}

// 내 정보 본문 — 심플 LI 드릴다운(사용자 정보 · 사용량 · 결제 · 연결 · 학습).
// 각 항목 클릭 → MyInfoSheet 의 해당 상세 스텝으로 push.
const MyInfoContent: React.FC = () => {
  const { user, refreshUser } = useUser();
  const { pushAccount, pushUsage, pushBilling, pushConnections, pushLearning } = useMyInfo();
  const [planCode, setPlanCode] = useState<string>('free');
  const [refreshing, setRefreshing] = useState(false);

  const loadPlan = useCallback(() => billingService.getUsageStatus()
    .then((s) => { if (s?.plan) setPlanCode(s.plan); })
    .catch(() => {}), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refreshUser(), loadPlan()]).finally(() => setRefreshing(false));
  }, [refreshUser, loadPlan]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    billingService.getUsageStatus()
      .then((s) => { if (!cancelled && s?.plan) setPlanCode(s.plan); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.base }}>
        <Text style={{ color: C.text2 }}>사용자 정보를 불러오는 중입니다...</Text>
      </View>
    );
  }

  const avatar = String(user.nickname || '코').trim().charAt(0).toUpperCase();
  const planName = PLAN_NAMES[planCode] || 'Free';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 36 }} showsVerticalScrollIndicator={false} refreshControl={sheetRefreshControl(refreshing, refresh)}>
      {/* 사용자 정보 (프로필) — 클릭 시 계정 상세 */}
      <Animated.View entering={FadeInDown.springify().damping(14)}>
        <Pressable
          onPress={pushAccount}
          android_ripple={{ color: C.elevated2 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, marginBottom: 20 }}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: C.text2 }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }} numberOfLines={1}>{user.nickname}</Text>
              <Chip tone="accent">{planName}</Chip>
            </View>
            <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 3, fontFamily: v2.font.mono }} numberOfLines={1}>{user.email}</Text>
          </View>
          <CaretRight size={18} color={C.textDim} />
        </Pressable>
      </Animated.View>

      {/* 드릴다운 메뉴 */}
      <Animated.View entering={FadeInDown.springify().damping(14).delay(60)}>
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, overflow: 'hidden' }}>
          <MenuRow icon={<Gauge size={20} color={C.text2} />} label="사용량" desc="현재 구간 · 이번 주 세션 사용량" onPress={pushUsage} />
          <MenuRow icon={<CreditCard size={20} color={C.text2} />} label="결제" desc="플랜 상태 · 결제 내역 · 업그레이드/해지" onPress={pushBilling} />
          <MenuRow icon={<Plugs size={20} color={C.text2} />} label="연결" desc="GitHub · 로컬 PC 연결" onPress={pushConnections} />
          <MenuRow icon={<GraduationCap size={20} color={C.text2} />} label="학습" desc="개요 · 잔디 · 업적 · 레슨" onPress={pushLearning} last />
        </View>
      </Animated.View>
    </ScrollView>
  );
};

export default MyInfoContent;
