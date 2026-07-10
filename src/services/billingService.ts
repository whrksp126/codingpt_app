import { Linking } from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import type { PurchasesPackage } from 'react-native-purchases';
import { api } from '../utils/api';
import { PAYMENT_WEB_URL } from '../utils/service';
import billingEvents from './billingEvents';
import purchasesService, { IAP_ENABLED, planCodeOfProduct } from './purchasesService';
import { SUBSCRIPTION_ENABLED } from '../config/features';
import type { UsageStatus, SubscriptionPlan, SubscriptionInfo } from '../types/billing';

// 사용량/구독 서비스 레이어 (월 구독).
//  - 스토어 빌드(IAP_ENABLED): 네이티브 인앱 결제(StoreKit/Play Billing, RevenueCat).
//  - 그 외: 결제 웹으로 핸드오프(openBilling).

// 페이월에 표시할 구매 옵션 — RC 패키지 + 우리 plan code.
export interface PurchaseOption {
  planCode: string;        // pro | max
  priceString: string;     // 스토어 현지화 가격 (예: "₩24,900")
  title: string;           // 스토어 상품명
  pkg: PurchasesPackage;
}

export const billingService = {
  async getUsageStatus(): Promise<UsageStatus | null> {
    const res = await api.usage.getStatus();
    return res.success && res.data ? (res.data as UsageStatus) : null;
  },

  async getPlans(): Promise<SubscriptionPlan[]> {
    const res = await api.subscription.getPlans();
    return res.success && res.data ? (res.data as SubscriptionPlan[]) : [];
  },

  // 현재 구독(상태/플랜/결제 source) — null 이면 무료. source 로 웹(portone)/스토어(revenuecat) 구분.
  async getMine(): Promise<SubscriptionInfo | null> {
    const res = await api.subscription.getMine();
    return res.success && res.data ? (res.data as SubscriptionInfo) : null;
  },

  // 구독 해지(기간 말 해지 — 그때까지 이용). 웹 구독만. 실패 시 메시지 throw(스토어 구독이면 안내).
  async cancel(reason?: string): Promise<void> {
    const res = await api.subscription.cancel(reason);
    if (!res.success) throw new Error(res.message || '해지에 실패했어요.');
  },

  // 해지 취소(재개).
  async resume(): Promise<void> {
    const res = await api.subscription.resume();
    if (!res.success) throw new Error(res.message || '재개에 실패했어요.');
  },

  /**
   * 결제 웹으로 유도 — 같은 user_id 로 로그인할 단기 핸드오프 토큰을 받아 인앱 브라우저로 연다.
   * @param path 웹 경로 (예: '/', '/me')
   */
  async openBilling(path = '/'): Promise<void> {
    let url = `${PAYMENT_WEB_URL}${path}`;
    try {
      const res = await api.billing.createWebSession();
      if (res.success && res.data?.token) {
        const base = res.data.webUrl || PAYMENT_WEB_URL;
        const sep = path.includes('?') ? '&' : '?';
        url = `${base}${path}${sep}handoff=${encodeURIComponent(res.data.token)}`;
      }
    } catch (_) {
      // 핸드오프 실패 시에도 웹은 열어준다(웹에서 직접 로그인)
    }
    try {
      const ok = await InAppBrowser.isAvailable();
      if (ok) {
        await InAppBrowser.open(url, { showTitle: true, enableUrlBarHiding: true, enableDefaultShare: false });
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      try { await Linking.openURL(url); } catch (_) { /* noop */ }
    }
  },

  // 업그레이드 진입점 — 스토어 빌드는 네이티브 페이월, 그 외는 웹 결제로 폴백.
  // (반유도 준수: iOS 등 스토어 빌드에서는 웹 결제창을 띄우지 않는다.)
  startUpgrade(reason?: string): void {
    if (!SUBSCRIPTION_ENABLED) return; // 구독 비활성(BYO 피벗) — config/features.SUBSCRIPTION_ENABLED 로 부활
    if (IAP_ENABLED) {
      billingEvents.emitPaywall(reason);
    } else {
      this.openBilling('/me');
    }
  },

  isIapEnabled(): boolean {
    return IAP_ENABLED;
  },

  // 구매 가능한 옵션 목록(RC offering → plan code 매핑).
  async getPurchaseOptions(): Promise<PurchaseOption[]> {
    if (!IAP_ENABLED) return [];
    const pkgs = await purchasesService.getPackages();
    return pkgs
      .map((pkg) => {
        const planCode = planCodeOfProduct(pkg.product.identifier);
        if (!planCode) return null;
        return { planCode, priceString: pkg.product.priceString, title: pkg.product.title, pkg };
      })
      .filter(Boolean) as PurchaseOption[];
  },

  // 패키지 구매 → 성공 시 백엔드 동기화(웹훅 지연 보정). 반환 false = 사용자 취소.
  async purchase(option: PurchaseOption): Promise<boolean> {
    try {
      await purchasesService.purchasePackage(option.pkg);
    } catch (e: any) {
      if (e && e.userCancelled) return false;
      throw e;
    }
    await this._syncAfterPurchase();
    return true;
  },

  // 구매 복원 → 백엔드 동기화. 반환 true = 복원할 활성 구독이 실제로 있었음(없으면 false).
  async restorePurchases(): Promise<boolean> {
    const info = await purchasesService.restore();
    await this._syncAfterPurchase();
    if (!info) return false;
    return (
      Object.keys(info.entitlements?.active || {}).length > 0 ||
      (info.activeSubscriptions?.length || 0) > 0
    );
  },

  manageSubscription(): Promise<void> {
    return purchasesService.openManage();
  },

  async _syncAfterPurchase(): Promise<void> {
    try { await api.billing.iapSync(); } catch (_) { /* 웹훅이 결국 반영하므로 비치명적 */ }
  },
};

// unit → 사람이 읽는 짧은 표기 (예: 1250000 → "1.3M", 12500 → "12.5k")
export function formatUnits(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(v);
}

// 초 → 사람이 읽는 실행시간 표기 (예: 5400 → "1시간 30분", 90 → "1분")
export function formatDuration(sec: number | null | undefined): string {
  const v = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${v}초`;
}

// 윈도우 사용률 % (M5 Slice5 = 클라우드 실행시간 초 기준. limit 없으면 null=무제한)
export function windowPercent(s: UsageStatus | null): number | null {
  if (!s || s.windowLimitSeconds == null || s.windowLimitSeconds <= 0) return null;
  return Math.min(100, Math.round((s.windowUsedSeconds / s.windowLimitSeconds) * 100));
}

export default billingService;
