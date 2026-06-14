import { apiRequest } from '../utils/api';

export interface OnboardingPayload {
  anonId: string;
  job?: string | null;
  referralSource?: string | null;
  aiExperience?: string | null;
  purposes?: string[];
}

export const onboardingService = {
  // 온보딩 설문 응답 제출(익명). 개인화 완료 시점에 호출 — 로그인 전이라 anonId 로 식별.
  submit: (payload: OnboardingPayload) =>
    apiRequest<{ id: number; anonId: string }>('/api/onboarding', {
      method: 'POST',
      body: payload,
    }),
};
