import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, ScrollView, ActivityIndicator, Linking, Platform } from 'react-native';
import billingEvents from '../../services/billingEvents';
import billingService, { PurchaseOption } from '../../services/billingService';
import V2Sheet from '../v2/V2Sheet';
import { PAYMENT_WEB_URL } from '../../utils/service';
import { useUser } from '../../contexts/UserContext';
import { useAppAlert } from '../../hooks/useAppAlert';
import type { SubscriptionPlan, SubscriptionInfo } from '../../types/billing';

// 인앱 결제(IAP) 페이월 — billingService.startUpgrade → billingEvents.emitPaywall 로 열린다.
// 스토어(StoreKit/Play Billing) 네이티브 결제. 플랜 카피는 백엔드(/subscription/plans),
// 가격은 스토어 현지화 문자열(RC offering)을 사용.
const C = {
  base: '#0A0D14', surface: '#11151F', elevated: '#1B1F2A', border: '#1C2230',
  text: '#F8FAFC', text2: '#CBD5E1', dim: '#94A3B8', dim2: '#64748B',
  accent: '#34D399', onAccent: '#06281C', info: '#60A5FA',
};

const fmtDate = (s?: string | null) => {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString('ko-KR'); } catch (_) { return null; }
};

const PaywallSheet: React.FC = () => {
  const { refreshUser } = useUser();
  const { alert, confirm } = useAppAlert();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // 구매 진행 중인 planCode
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [options, setOptions] = useState<PurchaseOption[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>('free'); // 현재 이용 중인 플랜 code
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);   // 현재 구독(상태/source)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, o, u, s] = await Promise.all([
        billingService.getPlans(),
        billingService.getPurchaseOptions(),
        billingService.getUsageStatus().catch(() => null),
        billingService.getMine().catch(() => null),
      ]);
      setPlans(p);
      setOptions(o);
      setSub(s);
      setCurrentPlan((s?.planCode as string) || (u?.plan as string) || 'free');
    } catch (_) {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => billingEvents.onPaywall(() => { setOpen(true); load(); }), [load]);

  const buy = async (opt: PurchaseOption) => {
    setBusy(opt.planCode);
    try {
      const ok = await billingService.purchase(opt);
      if (ok) {
        await refreshUser();
        setOpen(false);
        alert({ title: '구독 완료', message: '구독이 활성화되었어요. 바로 사용할 수 있어요.' });
      }
    } catch (e: any) {
      alert({ title: '결제 실패', message: e?.message || '결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  // 현재 플랜의 네이티브 구독 관리(해지/결제수단 변경)를 스토어에서 연다.
  const manage = async () => {
    setOpen(false);
    try { await billingService.manageSubscription(); } catch (_) { /* noop */ }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const restored = await billingService.restorePurchases();
      await refreshUser();
      if (restored) {
        setOpen(false);
        alert({ title: '복원 완료', message: '구독을 복원했어요. 바로 사용할 수 있어요.' });
      } else {
        alert({ title: '복원할 구독 없음', message: '이 기기의 스토어 계정에서 활성 구독을 찾지 못했어요.' });
      }
    } catch (e: any) {
      alert({ title: '복원 실패', message: e?.message || '복원 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  // 구독 해지(웹/portone 구독만 — 기간 말 해지). 스토어 구독은 manage()로 스토어에서 처리.
  const cancelSub = async () => {
    const until = fmtDate(sub?.currentPeriodEnd) || '이용 기간 종료일';
    const ok = await confirm({
      title: '구독을 해지할까요?',
      message: `${until}까지는 지금 플랜 그대로 이용할 수 있고, 그 이후 무료 플랜으로 전환돼요. 추가 청구는 없고, 그 전엔 언제든 다시 이어갈 수 있어요.`,
      confirmText: '구독 해지',
      cancelText: '유지하기',
      danger: true,
    });
    if (!ok) return;
    setBusy('cancel');
    try {
      await billingService.cancel();
      await load();
      await refreshUser();
      alert({ title: '해지 예약됨', message: `${until}까지 이용할 수 있어요. 마음이 바뀌면 그 전에 ‘구독 계속하기’로 되돌릴 수 있어요.` });
    } catch (e: any) {
      alert({ title: '해지 실패', message: e?.message || '잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  // 해지 취소(재개).
  const resumeSub = async () => {
    setBusy('resume');
    try {
      await billingService.resume();
      await load();
      await refreshUser();
      alert({ title: '구독 유지', message: '해지 예약을 취소했어요. 구독이 계속 유지돼요.' });
    } catch (e: any) {
      alert({ title: '재개 실패', message: e?.message || '잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  // 유료 플랜만(코드별 카피 + 스토어 가격 머지), sort_order 순.
  const paid = plans
    .filter((p) => p.code !== 'free')
    .map((p) => ({ plan: p, option: options.find((o) => o.planCode === p.code) || null }))
    .sort((a, b) => (a.plan.sort_order || 0) - (b.plan.sort_order || 0));

  const isPaidNow = currentPlan === 'pro' || currentPlan === 'max';
  const currentSort = plans.find((p) => p.code === currentPlan)?.sort_order ?? -1;
  const isStore = !!sub?.manageInStore; // 스토어(Play/App Store) 구독 — 해지는 스토어에서만
  const cancelScheduled = !!sub?.cancelAtPeriodEnd;

  return (
    <V2Sheet visible={open} onClose={() => setOpen(false)} dismissable={!busy} background={C.surface} maxHeightPct={0.88}>
          <View style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{isPaidNow ? '구독 플랜' : '플랜 업그레이드'}</Text>
            <Text style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>매달 자동 갱신되며 언제든 해지할 수 있어요.</Text>
          </View>

          <ScrollView style={{ paddingHorizontal: 18, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
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
                const isCurrent = plan.code === currentPlan;
                // 버튼 라벨: 현재 플랜=비활성 '현재 이용 중'(웹과 동일, 클릭 불필요),
                // 그 외 sort_order 비교로 업/다운그레이드(무료면 구독하기).
                const ctaLabel = isCurrent
                  ? '현재 이용 중'
                  : !isPaidNow
                    ? '구독하기'
                    : (plan.sort_order || 0) > currentSort ? '업그레이드' : '다운그레이드';
                // 현재 플랜 카드는 강조 테두리, 그 외엔 highlight 플랜만 강조.
                const accentBorder = isCurrent || plan.highlight;
                const filledCta = isCurrent ? false : plan.highlight; // 현재 플랜 버튼은 아웃라인
                const onPress = isCurrent ? undefined : () => option && buy(option);
                const ctaDisabled = isCurrent ? true : (!option || isBusy || !!busy);
                return (
                  <View key={plan.code} style={{ backgroundColor: C.base, borderWidth: 1, borderColor: accentBorder ? C.accent : C.border, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{plan.name}</Text>
                      {isCurrent && cancelScheduled ? (
                        <View style={{ backgroundColor: 'rgba(248,113,113,0.14)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2.5 }}>
                          <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '800' }}>해지 예정</Text>
                        </View>
                      ) : isCurrent ? (
                        <View style={{ backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2.5 }}>
                          <Text style={{ color: C.onAccent, fontSize: 11, fontWeight: '800' }}>현재 이용 중</Text>
                        </View>
                      ) : plan.badge ? (
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
                      disabled={ctaDisabled}
                      onPress={onPress}
                      style={{ backgroundColor: filledCta ? C.accent : C.elevated, borderWidth: filledCta ? 0 : 1, borderColor: isCurrent ? '#2A2F3A' : C.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14, opacity: isCurrent ? 0.55 : ((!option) || (!!busy && !isBusy)) ? 0.5 : 1 }}
                    >
                      {isBusy ? (
                        <ActivityIndicator color={filledCta ? C.onAccent : C.text} />
                      ) : (
                        <Text style={{ color: filledCta ? C.onAccent : isCurrent ? C.dim : C.text, fontSize: 15, fontWeight: '800' }}>{ctaLabel}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}

            {/* 구독 상태 + 해지/재개 — 해지 예약이면 소스(웹/스토어) 공통으로 안내 배너.
                활성 상태면 웹=해지 링크 / 스토어=스토어 관리 링크. */}
            {isPaidNow && cancelScheduled ? (
              <View style={{ borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.06)', borderRadius: 12, padding: 14, marginTop: 2, marginBottom: 2 }}>
                <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '800' }}>해지 예정</Text>
                <Text style={{ color: C.text2, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                  {fmtDate(sub?.currentPeriodEnd) || '이용 기간 종료일'}까지 {sub?.planName || '현재 플랜'}을 그대로 이용할 수 있고, 이후 무료 플랜으로 전환돼요.
                </Text>
                <Pressable onPress={isStore ? manage : resumeSub} disabled={!!busy} style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 11 }}>
                  {busy === 'resume'
                    ? <ActivityIndicator color={C.accent} />
                    : <Text style={{ color: C.accent, fontSize: 14, fontWeight: '800' }}>{isStore ? '스토어에서 구독 다시 켜기' : '구독 계속하기'}</Text>}
                </Pressable>
                {isStore ? <Text style={{ color: C.dim2, fontSize: 11.5, marginTop: 8, textAlign: 'center' }}>스토어에서 구독한 플랜이라 재개도 스토어에서 진행돼요</Text> : null}
              </View>
            ) : isPaidNow && isStore ? (
              <Pressable onPress={manage} disabled={!!busy} style={{ borderTopWidth: 1, borderColor: C.border, marginTop: 4, paddingTop: 14, alignItems: 'center' }}>
                <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '700' }}>스토어에서 구독 관리</Text>
                <Text style={{ color: C.dim2, fontSize: 11.5, marginTop: 3 }}>해지·결제수단 변경은 스토어에서 진행돼요</Text>
              </Pressable>
            ) : isPaidNow ? (
              <Pressable onPress={cancelSub} disabled={!!busy} hitSlop={6} style={{ alignItems: 'center', paddingVertical: 8, marginTop: 2 }}>
                {busy === 'cancel'
                  ? <ActivityIndicator color={C.dim} />
                  : <Text style={{ color: C.dim, fontSize: 13, fontWeight: '600' }}>구독 해지</Text>}
              </Pressable>
            ) : null}

            {/* 이전 구매 복원 — iOS 만(App Store 심사 필수). Android 는 노출 안 함.
                재설치/기기 변경으로 구독이 안 보일 때 스토어 구매를 다시 연결. */}
            <View style={{ alignItems: 'center', marginTop: 16, gap: 6, paddingBottom: 16 }}>
              {Platform.OS === 'ios' ? (
                <>
                  <Pressable onPress={restore} disabled={!!busy} hitSlop={8}>
                    {busy === 'restore'
                      ? <ActivityIndicator color={C.info} />
                      : <Text style={{ color: C.info, fontSize: 13.5, fontWeight: '600' }}>이전 구매 복원</Text>}
                  </Pressable>
                  <Text style={{ color: C.dim2, fontSize: 11, textAlign: 'center' }}>기기를 바꾸거나 앱을 재설치했다면 눌러 구독을 되살려요</Text>
                </>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: Platform.OS === 'ios' ? 6 : 0 }}>
                <Text onPress={() => Linking.openURL(`${PAYMENT_WEB_URL}/terms`)} style={{ color: C.dim2, fontSize: 12 }}>이용약관</Text>
                <Text onPress={() => Linking.openURL(`${PAYMENT_WEB_URL}/privacy`)} style={{ color: C.dim2, fontSize: 12 }}>개인정보처리방침</Text>
              </View>
            </View>
          </ScrollView>
    </V2Sheet>
  );
};

export default PaywallSheet;
