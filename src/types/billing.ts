// 과금/사용량 공용 타입 (백엔드 usage/subscription/billing 응답과 동기화)

export interface UsageStatus {
  plan: string | null; // 활성 플랜 코드 (free|pro|max), 미가입 시 free
  windowSeconds: number;
  windowUsedUnits: number;
  windowLimitUnits: number | null; // null = 무제한
  windowResetAt: string | null;
  weeklySeconds: number;
  weeklyUsedUnits: number;
  weeklyLimitUnits: number | null;
  weeklyResetAt: string | null;
  enforced: boolean; // 한도 강제 on/off
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  price_krw: number;
  window_seconds: number;
  window_unit_limit: number;
  weekly_unit_limit: number | null;
  sort_order: number;
  // 표시용 카피 (백엔드 단일 출처)
  tagline?: string | null;
  features?: string[];
  badge?: string | null;
  highlight?: boolean;
  display_multiplier?: string | null;
}

// 내 구독 요약 (GET /api/subscription/me — getMineEnriched). 구독 없으면 null.
export interface SubscriptionInfo {
  status: string; // active | past_due | canceled
  planCode: string | null;
  planName: string | null;
  priceKrw: number | null;
  source: string; // portone | revenuecat
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  scheduledPlan: { code: string; name: string; priceKrw: number } | null;
  pastDue: { since: string; attempts: number; graceEndsAt: string | null } | null;
  paymentMethod: { brand: string | null; last4: string } | null;
  manageInStore: boolean;
}

// 결제 영수증 (GET /api/billing/payments)
export interface PaymentReceipt {
  id: number;
  paymentId: string;
  kind: string;
  kindLabel: string;
  description: string | null;
  planName: string | null;
  amountKrw: number;
  refundedAmountKrw: number;
  status: string; // ready|paid|failed|cancelled|partial_cancelled
  source: string;
  channel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
}

// 사용량 한도 도달(429/402) 또는 플랜 게이트(403 PLAN_REQUIRED) 시 백엔드가 반환하는 구조화 payload
export interface UsageLimitInfo {
  code: 'USAGE_LIMIT_REACHED' | 'PLAN_REQUIRED';
  reason?: 'window_exceeded' | 'weekly_exceeded' | string;
  planCode: string | null;
  windowResetAt: string | null;
  weeklyResetAt: string | null;
  windowUsedUnits: number;
  windowLimitUnits: number | null;
  weeklyUsedUnits?: number;
  weeklyLimitUnits?: number | null;
  upgradeUrl: string;
  message: string;
}
