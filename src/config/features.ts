// 앱 기능 토글.
//
// SUBSCRIPTION_ENABLED — 구독/결제(IAP + 웹) UI 전체 스위치.
//  현재 false: BYO 원격조작 피벗으로 사용자가 자기 claude 키를 쓰므로 우리 과금이 없다 → 결제/페이월/플랜 UI 를 숨긴다.
//  나중에 "모바일 IDE + 우리 PC/서버 제공" 유료 구독을 되살릴 때 이 값만 true 로 바꾸면 전체 결제 UI 가 부활한다.
//  (코드는 그대로 보존 — 삭제하지 않음. 백엔드 판매 차단은 env SUBSCRIPTION_SALES_ENABLED,
//   과금 강제는 env BILLING_ENFORCE 로 별도 제어.)
export const SUBSCRIPTION_ENABLED = false;
