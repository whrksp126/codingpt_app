import { Platform, Linking } from 'react-native';
import Config from 'react-native-config';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

// RevenueCat(Apple StoreKit / Google Play Billing) 래퍼.
// 인앱 구독 결제 — 영수증 검증/갱신/만료는 RC 서버가 백엔드 웹훅으로 동기화한다.
// RC public SDK 키가 없으면 IAP 비활성(웹 결제로 폴백) — 키 주입 전까지 앱은 정상 동작.

const API_KEY =
  (Platform.OS === 'ios' ? Config.RC_API_KEY_IOS : Config.RC_API_KEY_ANDROID) || '';

export const IAP_ENABLED = !!API_KEY;

let configured = false;

// 스토어 상품 ID → 플랜 코드. (마이그레이션 시드와 동일: codingpt_pro_monthly / codingpt_max_monthly)
export function planCodeOfProduct(productId?: string | null): string | null {
  const id = String(productId || '').toLowerCase();
  if (!id) return null;
  if (id.includes('max')) return 'max';
  if (id.includes('pro')) return 'pro';
  return null;
}

export const purchasesService = {
  enabled: IAP_ENABLED,

  configure(): void {
    if (configured || !IAP_ENABLED) return;
    try {
      Purchases.configure({ apiKey: API_KEY });
      configured = true;
    } catch (e) {
      console.warn('[IAP] configure 실패:', e);
    }
  },

  // 우리 user.id 로 RC 구독 귀속 — 웹훅 app_user_id 와 매칭된다.
  async identify(userId: number | string): Promise<void> {
    if (!IAP_ENABLED || userId == null) return;
    this.configure();
    try { await Purchases.logIn(String(userId)); }
    catch (e) { console.warn('[IAP] logIn 실패:', e); }
  },

  async reset(): Promise<void> {
    if (!IAP_ENABLED || !configured) return;
    try { await Purchases.logOut(); } catch (_) { /* noop */ }
  },

  // 현재 offering 의 구매 가능한 패키지 목록.
  async getPackages(): Promise<PurchasesPackage[]> {
    if (!IAP_ENABLED) return [];
    this.configure();
    const offerings = await Purchases.getOfferings();
    return offerings.current ? offerings.current.availablePackages : [];
  },

  async purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
    const res = await Purchases.purchasePackage(pkg);
    return res.customerInfo;
  },

  async restore(): Promise<CustomerInfo | null> {
    if (!IAP_ENABLED) return null;
    this.configure();
    return Purchases.restorePurchases();
  },

  // 네이티브 구독 관리 화면(해지/변경)으로 이동.
  async openManage(): Promise<void> {
    const url = Platform.OS === 'ios'
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    try { await Linking.openURL(url); } catch (_) { /* noop */ }
  },
};

export default purchasesService;
