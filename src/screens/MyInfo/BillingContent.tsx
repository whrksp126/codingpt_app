import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Btn, Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import billingService from '../../services/billingService';
import { api } from '../../utils/api';
import type { SubscriptionInfo, PaymentReceipt } from '../../types/billing';

const C = v2.colors;
const R = v2.radius;

const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const STATUS_LABEL: Record<string, string> = {
  paid: '결제 완료', ready: '대기', failed: '실패', cancelled: '취소', partial_cancelled: '부분 취소',
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '–');
const krw = (n: number) => '₩' + Number(n || 0).toLocaleString('ko-KR');

// 결제 상세 — 현재 플랜 상태 + 결제 내역 + 업그레이드/관리. (내정보 → 결제)
const BillingContent: React.FC = () => {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [rows, setRows] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((isRefresh = false) => {
    let cancelled = false;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    Promise.all([
      api.subscription.getMine().then((r) => (r.data as SubscriptionInfo) || null).catch(() => null),
      api.billing.getPayments(1, 50).then((r) => ((r.data as any)?.data ?? []) as PaymentReceipt[]).catch(() => []),
    ]).then(([s, p]) => {
      if (cancelled) return;
      setSub(s); setRows(p); setLoading(false); setRefreshing(false);
    });
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const planCode = sub?.planCode || 'free';
  const planName = sub?.planName || PLAN_NAMES[planCode] || 'Free';
  const isPaid = planCode === 'pro' || planCode === 'max';

  const statusLine = sub?.pastDue
    ? { color: C.error, text: `결제 실패 — ${fmt(sub.pastDue.graceEndsAt)}까지 결제 수단을 확인해 주세요` }
    : sub?.cancelAtPeriodEnd
      ? { color: C.error, text: `${fmt(sub.currentPeriodEnd)}까지 이용 후 해지 예정` }
      : sub?.scheduledPlan
        ? { color: C.accent, text: `${fmt(sub.currentPeriodEnd)}부터 ${sub.scheduledPlan.name} 플랜으로 변경 예정` }
        : sub?.currentPeriodEnd
          ? { color: C.textDim, text: `${fmt(sub.currentPeriodEnd)}에 ${krw(sub.priceKrw || 0)} 자동 결제` }
          : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={sheetRefreshControl(refreshing, () => load(true))}>
      {/* 현재 플랜 상태 */}
      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>구독 플랜</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginBottom: 22 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{planName}</Text>
        {statusLine ? <Text style={{ fontSize: 12.5, color: statusLine.color, marginTop: 5 }}>{statusLine.text}</Text> : null}
        <View style={{ marginTop: 14 }}>
          <Btn variant="outline" sm full onPress={() => billingService.startUpgrade(planCode)}>
            {isPaid ? '플랜 관리 · 해지' : '플랜 업그레이드'}
          </Btn>
        </View>
      </View>

      {/* 결제 내역 */}
      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>결제 내역</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, paddingHorizontal: 14 }}>
        {loading ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : rows.length === 0 ? (
          <Text style={{ fontSize: 13.5, color: C.textDim, paddingVertical: 26, textAlign: 'center' }}>결제 내역이 없어요.</Text>
        ) : (
          rows.map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 14, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                  {r.kindLabel}{r.planName ? ` · ${r.planName}` : ''}
                </Text>
                <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 3 }}>
                  {fmt(r.paidAt || r.createdAt)}{r.periodStart ? ` · ${fmt(r.periodStart)}~${fmt(r.periodEnd)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800' }}>{krw(r.amountKrw)}</Text>
                <Text style={{ fontSize: 11, marginTop: 2, color: r.status === 'paid' ? C.accent : C.textDim }}>
                  {STATUS_LABEL[r.status] || r.status}{r.refundedAmountKrw > 0 ? ` · ${krw(r.refundedAmountKrw)} 환불` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

export default BillingContent;
