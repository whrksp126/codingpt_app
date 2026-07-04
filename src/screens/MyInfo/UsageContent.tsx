import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import billingService, { windowPercent } from '../../services/billingService';
import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import type { UsageStatus } from '../../types/billing';

const C = v2.colors;
const R = v2.radius;

const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const fmtTime = (s?: string | null) => {
  if (!s) return null;
  try { return new Date(s).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return null; }
};

function weeklyPercent(s: UsageStatus | null): number | null {
  if (!s || s.weeklyLimitUnits == null || s.weeklyLimitUnits <= 0) return null;
  return Math.min(100, Math.round((s.weeklyUsedUnits / s.weeklyLimitUnits) * 100));
}

function UsageBar({ label, pct, resetAt }: { label: string; pct: number | null; resetAt?: string | null }) {
  const over = pct != null && pct >= 100;
  const reset = fmtTime(resetAt);
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: C.text2, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: over ? C.error : C.text2 }}>{pct == null ? '무제한' : `${pct}%`}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: C.elevated2, overflow: 'hidden' }}>
        <View style={{ width: (`${pct ?? 0}%` as any), height: '100%', borderRadius: 999, backgroundColor: over ? C.error : C.accent }} />
      </View>
      {reset ? <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>{reset}에 충전돼요</Text> : null}
    </View>
  );
}

// 사용량 상세 — 현재 구간/주간 세션 사용량. (내정보 → 사용량)
const UsageContent: React.FC = () => {
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((isRefresh = false) => {
    let cancelled = false;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    billingService.getUsageStatus()
      .then((s) => { if (!cancelled) setUsage(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const planName = PLAN_NAMES[usage?.plan || 'free'] || (usage?.plan || 'Free');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={sheetRefreshControl(refreshing, () => load(true))}>
      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>현재 플랜</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginBottom: 22 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{planName}</Text>
      </View>

      <Label style={{ marginBottom: 10, paddingHorizontal: 2 }}>세션 사용량</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16 }}>
        {loading ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : !usage ? (
          <Text style={{ fontSize: 13, color: C.textDim, paddingVertical: 12, textAlign: 'center' }}>사용량을 불러올 수 없어요.</Text>
        ) : (
          <>
            <UsageBar label="현재 구간 (5시간)" pct={windowPercent(usage)} resetAt={usage.windowResetAt} />
            {usage.weeklyLimitUnits != null ? (
              <UsageBar label="이번 주" pct={weeklyPercent(usage)} resetAt={usage.weeklyResetAt} />
            ) : null}
            {usage.enforced === false ? (
              <Text style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>사용량만 표시되며 한도로 차단되지 않아요.</Text>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
};

export default UsageContent;
