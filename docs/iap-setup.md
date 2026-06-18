# 앱 내 구독 결제(IAP) 셋업 가이드 — RevenueCat + Apple/Google

CodingPT 앱에서 사용자가 **앱 안에서 직접 구독**할 수 있게 하는 인앱 결제(IAP) 연동 가이드입니다.
코드(앱·백엔드)는 이미 구현되어 있고, **아래 스토어/RevenueCat 설정 + 키 전달**만 하면 동작합니다.

> 결제 자체는 Apple StoreKit / Google Play Billing 네이티브 결제창에서 일어나고, RevenueCat은 그 위에서
> 영수증 검증·갱신·만료·환불을 백엔드 웹훅으로 동기화합니다. 스토어 심사 입장에선 정상 IAP입니다.

## 상품/가격 (확정)

| 플랜 | 스토어 product id (Apple·Google 동일) | 앱 가격(월) | 웹 가격(참고) |
|---|---|--:|--:|
| Pro | `codingpt_pro_monthly` | ₩24,900 | ₩20,000 |
| Max | `codingpt_max_monthly` | ₩129,000 | ₩100,000 |

앱 가격을 웹보다 올린 이유: 스토어 수수료(iOS 구독 15% 소상공인 / Android 구독 10%) 후에도 손익 30%+ 유지.
혜택(사용량 한도)은 웹·앱 동일 — 가격만 채널별. (가격 티어는 스토어에서 최종 선택, 위 값에 가장 가까운 티어)

bundle id / package name (양 스토어 공통): **`com.ghmate.codingpt.app`**

---

## 1. Apple — App Store Connect

1. **Apple Developer Program** 가입/유지 ($99/년) — https://developer.apple.com/programs/
2. **App Store Small Business Program** 신청 (구독 수수료 30%→15%) — https://developer.apple.com/app-store/small-business-program/
   - App Store Connect > 계약/세금/금융 거래(Agreements) > Small Business Program 신청.
3. **유료 앱 계약** 체결 + 은행/세금 정보 입력 (Agreements 탭에서 "유료 앱(Paid Apps)" 활성 상태여야 결제 가능).
4. **앱 레코드 생성**: App Store Connect > 나의 앱 > (+) 새 앱 > bundle id `com.ghmate.codingpt.app` 선택.
5. **자동 갱신 구독 상품 생성**: 앱 > 수익화 > 구독(Subscriptions)
   - **구독 그룹** 1개 생성 (예: "CodingPT 구독").
   - 그룹 안에 구독 2개 추가:
     - Pro — 제품 ID `codingpt_pro_monthly`, 기간 1개월, 가격 ₩24,900(에 가장 가까운 티어), 현지화 이름/설명.
     - Max — 제품 ID `codingpt_max_monthly`, 기간 1개월, 가격 ₩129,000, 현지화 이름/설명.
   - 각 구독에 **현지화(한국어) 표시 이름/설명 + 심사용 스크린샷** 첨부(필수).
6. **App Store Connect API Key 발급** (RevenueCat 연동용): 사용자/액세스 > 통합(Integrations) > App Store Connect API > (+)
   - 역할: "App Manager" 이상. 발급된 **.p8 파일 + Key ID + Issuer ID**를 RevenueCat에 입력.
   - (대안: 앱 > 앱 정보 > App-Specific Shared Secret 도 가능하나 API Key 방식 권장.)

---

## 2. Google — Play Console

1. **Play Console** 가입 ($25 1회) — https://play.google.com/console/
2. **결제 프로필/판매자 등록** (구독 판매하려면 판매자 계정 필요).
3. **앱 생성**: 모든 앱 > 앱 만들기 > package `com.ghmate.codingpt.app`.
   - 첫 출시는 내부 테스트 트랙에 AAB 업로드가 한 번 필요(상품 생성 활성화 조건). AAB는 `npm run build:android-aab` 로 생성.
4. **구독 상품 생성**: 앱 > 수익 창출 > 구독(Subscriptions) > 구독 만들기
   - Pro — 제품 ID `codingpt_pro_monthly`, 기본 요금제(base plan) 월 자동갱신, 가격 ₩24,900.
   - Max — 제품 ID `codingpt_max_monthly`, 기본 요금제 월 자동갱신, 가격 ₩129,000.
5. **서비스 계정 발급** (RevenueCat 연동용):
   - Google Cloud Console에서 서비스 계정 생성 → JSON 키 다운로드.
   - Play Console > 사용자 및 권한 > 서비스 계정 초대 → "재무 데이터 보기 / 주문 관리" 권한 부여.
   - JSON 키를 RevenueCat에 업로드.
6. **Real-time Developer Notifications(RTDN)**: RevenueCat이 안내하는 Pub/Sub 토픽 이름을
   Play Console > 수익 창출 설정 > 실시간 개발자 알림에 입력(갱신/취소 즉시 반영).

---

## 3. RevenueCat

1. 계정/프로젝트 생성 — https://app.revenuecat.com/
2. **앱 연결**:
   - Apple App Store 앱 추가 → bundle id `com.ghmate.codingpt.app` + (1-6)의 .p8 API Key 입력.
   - Google Play 앱 추가 → package `com.ghmate.codingpt.app` + (2-5)의 서비스 계정 JSON 업로드.
3. **Products**: 위 product id (`codingpt_pro_monthly`, `codingpt_max_monthly`)를 양 스토어에서 import.
4. **Entitlements**: `pro`, `max` 2개 생성 → 각 product를 해당 entitlement에 연결.
   (entitlement 식별자를 plan code와 동일하게 `pro`/`max` 로 두면 매핑이 단순해집니다.)
5. **Offerings**: 기본 offering 1개(current) → Pro/Max 패키지 추가. 앱이 이 offering을 읽어 페이월에 표시합니다.
6. **Webhook**: Project settings > Integrations > Webhooks
   - URL: `https://codingpt-back.ghmate.com/api/billing/rc/webhook`
   - Authorization 헤더 값 = 백엔드 `RC_WEBHOOK_AUTH` 와 동일한 임의 시크릿 문자열(직접 정함).
7. **REST API Key**: Project settings > API Keys 의 **Secret key**(서버용) = 백엔드 `RC_REST_API_KEY`.
8. **Public SDK Keys**: API Keys 의 Apple/Google **public key** = 앱 `RC_API_KEY_IOS` / `RC_API_KEY_ANDROID`.

---

## 4. 나에게 전달할 값 (셋업 후)

| 값 | 어디에 | 비고 |
|---|---|---|
| RC Apple public SDK key | 앱 `.env*` `RC_API_KEY_IOS` | 시크릿 아님(앱에 포함) |
| RC Google public SDK key | 앱 `.env*` `RC_API_KEY_ANDROID` | 시크릿 아님 |
| RC Webhook Authorization 시크릿 | 백엔드 `.env` `RC_WEBHOOK_AUTH` | **시크릿** |
| RC REST Secret key | 백엔드 `.env` `RC_REST_API_KEY` | **시크릿** |

- 앱 키 2개는 시크릿이 아니므로 `.env.local`/`.env`에 채우면 됩니다(나에게 줘도 되고 직접 채워도 됨).
- 백엔드 시크릿 2개는 평문 노출 금지 → prod `.env`에 직접 넣거나, 파일로 안전 전달.
- 키 주입 후: 앱 리빌드(`npm run android:local` / iOS 아카이브), 백엔드 `--force-recreate` 1회.

## 5. 동작 확인 (키 주입 후)

1. **샌드박스 구매**: App Store Sandbox 테스터 / Play 라이선스 테스터로 앱에서 Pro 구독 → 네이티브 결제창 → 성공.
2. RC 대시보드에 구매 이벤트 + 백엔드 로그 `[RC Webhook] INITIAL_PURCHASE {plan:"pro"}` 확인.
3. 앱 내정보 + 웹 `/me` 양쪽에서 plan=pro 반영(한도 게이트 정상).
4. 구매 복원/해지(네이티브 구독 관리) 동작 확인.

> 키가 없을 동안 앱은 IAP 비활성 상태로 **웹 결제로 폴백**(기존 동작) — 빌드/실행에 문제 없습니다.
