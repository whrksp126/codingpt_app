import type { UsageLimitInfo } from '../types/billing';

// 사용량 한도 도달 이벤트 버스 — 에이전트 세션(컨텍스트)에서 emit, UI(LimitSheet)에서 구독.
// 컨텍스트 value 형태를 건드리지 않고 한도 시트를 띄우기 위한 경량 채널.

type Listener = (info: UsageLimitInfo) => void;
type PaywallListener = (reason?: string) => void;

const listeners = new Set<Listener>();
const paywallListeners = new Set<PaywallListener>();

export const billingEvents = {
  emitLimit(info: UsageLimitInfo) {
    listeners.forEach((l) => {
      try { l(info); } catch (_) { /* noop */ }
    });
  },
  onLimit(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  // 인앱 결제(IAP) 페이월 열기 — billingService.startUpgrade 에서 emit, PaywallSheet 에서 구독.
  emitPaywall(reason?: string) {
    paywallListeners.forEach((l) => {
      try { l(reason); } catch (_) { /* noop */ }
    });
  },
  onPaywall(listener: PaywallListener): () => void {
    paywallListeners.add(listener);
    return () => paywallListeners.delete(listener);
  },
};

export default billingEvents;
