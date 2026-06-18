import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import billingEvents from '../../services/billingEvents';
import billingService, { PurchaseOption } from '../../services/billingService';
import { PAYMENT_WEB_URL } from '../../utils/service';
import { useUser } from '../../contexts/UserContext';
import type { SubscriptionPlan } from '../../types/billing';

// 인앱 결제(IAP) 페이월 — billingService.startUpgrade → billingEvents.emitPaywall 로 열린다.
// 스토어(StoreKit/Play Billing) 네이티브 결제. 플랜 카피는 백엔드(/subscription/plans),
// 가격은 스토어 현지화 문자열(RC offering)을 사용.
const C = {
  base: '#0A0D14', surface: '#11151F', elevated: '#1B1F2A', border: '#1C2230',
  text: '#F8FAFC', text2: '#CBD5E1', dim: '#94A3B8', dim2: '#64748B',
  accent: '#34D399', onAccent: '#06281C', info: '#60A5FA',
};

const PaywallSheet: React.FC = () => {
  const { refreshUser } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // 구매 진행 중인 planCode
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [options, setOptions] = useState<PurchaseOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([
        billingService.getPlans(),
        billingService.getPurchaseOptions(),
      ]);
      setPlans(p);
      setOptions(o);
    } catch (_) {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => billingEvents.onPaywall(() => { setOpen(true); load(); }), [load]);

  const close = () => { if (!busy) setOpen(false); };

  const buy = async (opt: PurchaseOption) => {
    setBusy(opt.planCode);
    try {
      const ok = await billingService.purchase(opt);
      if (ok) {
        await refreshUser();
        setOpen(false);
        Alert.alert('구독 완료', '구독이 활성화되었어요. 바로 사용할 수 있어요.');
      }
    } catch (e: any) {
      Alert.alert('결제 실패', e?.message || '결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      await billingService.restorePurchases();
      await refreshUser();
      Alert.alert('복원 완료', '구매 내역을 복원했어요.');
      setOpen(false);
    } catch (_) {
      Alert.alert('복원 실패', '복원할 구매 내역을 찾지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  // 유료 플랜만(코드별 카피 + 스토어 가격 머지), sort_order 순.
  const paid = plans
    .filter((p) => p.code !== 'free')
    .map((p) => ({ plan: p, option: options.find((o) => o.planCode === p.code) || null }))
    .sort((a, b) => (a.plan.sort_order || 0) - (b.plan.sort_order || 0));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 14, paddingBottom: 30, borderTopWidth: 1, borderColor: C.border, maxHeight: '88%' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: '#2A2F3A', marginBottom: 10 }} />
          <View style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>플랜 업그레이드</Text>
            <Text style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>매달 자동 갱신되며 언제든 해지할 수 있어요.</Text>
          </View>

          <ScrollView style={{ paddingHorizontal: 18 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : paid.length === 0 || options.length === 0 ? (
              <View style={{ paddingVertical: 26, paddingHorizontal: 6 }}>
                <Text style={{ color: C.text2, fontSize: 14, lineHeight: 21 }}>
                  지금은 스토어 결제를 준비 중이에요. 웹에서 구독할 수 있어요.
                </Text>
                <Pressable onPress={() => { setOpen(false); billingService.openBilling('/me'); }} style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 }}>
                  <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>웹에서 구독하기</Text>
                </Pressable>
              </View>
            ) : (
              paid.map(({ plan, option }) => {
                const price = option ? option.priceString : `₩${(plan.price_krw || 0).toLocaleString()}`;
                const features = plan.features || [];
                const isBusy = busy === plan.code;
                return (
                  <View key={plan.code} style={{ backgroundColor: C.base, borderWidth: 1, borderColor: plan.highlight ? C.accent : C.border, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{plan.name}</Text>
                      {plan.badge ? (
                        <View style={{ backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>{plan.badge}</Text>
                        </View>
                      ) : null}
                      {plan.display_multiplier ? (
                        <Text style={{ color: C.dim, fontSize: 12, marginLeft: 'auto' }}>{plan.display_multiplier}</Text>
                      ) : null}
                    </View>
                    <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', marginTop: 8 }}>
                      {price}<Text style={{ color: C.dim, fontSize: 13, fontWeight: '600' }}> / 월</Text>
                    </Text>
                    {plan.tagline ? <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}>{plan.tagline}</Text> : null}
                    <View style={{ marginTop: 12, gap: 7 }}>
                      {features.map((f, i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                          <Text style={{ color: C.accent, fontSize: 13 }}>✓</Text>
                          <Text style={{ color: C.text2, fontSize: 13, flex: 1, lineHeight: 19 }}>{f}</Text>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      disabled={!option || isBusy || !!busy}
                      onPress={() => option && buy(option)}
                      style={{ backgroundColor: plan.highlight ? C.accent : C.elevated, borderWidth: plan.highlight ? 0 : 1, borderColor: C.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14, opacity: !option || (!!busy && !isBusy) ? 0.5 : 1 }}
                    >
                      {isBusy ? (
                        <ActivityIndicator color={plan.highlight ? C.onAccent : C.text} />
                      ) : (
                        <Text style={{ color: plan.highlight ? C.onAccent : C.text, fontSize: 15, fontWeight: '800' }}>구독하기</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}

            {/* 구매 복원 + 약관 (스토어 심사 필수) */}
            <View style={{ alignItems: 'center', marginTop: 6, gap: 12, paddingBottom: 8 }}>
              <Pressable onPress={restore} disabled={!!busy}>
                <Text style={{ color: C.info, fontSize: 13.5, fontWeight: '600' }}>구매 복원</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text onPress={() => Linking.openURL(`${PAYMENT_WEB_URL}/terms`)} style={{ color: C.dim2, fontSize: 12 }}>이용약관</Text>
                <Text onPress={() => Linking.openURL(`${PAYMENT_WEB_URL}/privacy`)} style={{ color: C.dim2, fontSize: 12 }}>개인정보처리방침</Text>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default PaywallSheet;
