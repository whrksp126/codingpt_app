// 앱 기능 토글.
//
// SUBSCRIPTION_ENABLED — 구독/결제(IAP + 웹) UI 전체 스위치.
//  Personal 핵심 기능은 무료이고, 이 스위치는 선택형 Supporter 구매 UI만 제어한다.
//  스토어 상품/RevenueCat offering이 준비된 빌드에서만 true로 주입한다.
//  백엔드 판매는 SUBSCRIPTION_SALES_ENABLED로 별도 개방해야 한다.
import Config from 'react-native-config';

export const SUBSCRIPTION_ENABLED = String(Config.SUBSCRIPTION_ENABLED || '').toLowerCase() === 'true';
