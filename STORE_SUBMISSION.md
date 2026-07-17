# CodingPT 스토어 심사 제출 가이드 (App Store · Google Play)

> 목적: 심사 리젝 방지 + 콘솔에 그대로 붙여넣을 값 모음.
> 핵심 리스크 = "리뷰어가 PC를 연결하지 않으면 앱이 빈 화면" → **데모 계정 + 상시 연결된 데모 PC**로 해결.

---

## 0. 앱 개요 (심사자 이해용)

CodingPT는 **사용자 본인 PC의 컴패니언 앱**입니다. PC용 무료 데스크톱 앱을 설치·연결하면,
휴대폰/태블릿에서 그 PC의 **터미널·코드 에디터·미리보기를 원격 조작**합니다. (SSH/원격데스크톱 계열)

- 로그인: Google / Apple / 이메일. 회원 삭제 인앱 제공(Apple 5.1.1(v) revoke 포함).
- 결제/구독 없음(현재 무료). 광고/추적 SDK 없음.

---

## 1. ⭐ 데모 계정 + 데모 PC (가장 중요 — 이거 안 하면 리젝)

### 1-a. 데모 계정 생성 (prod 서버에서 1회 — 본인이 실행)
비밀번호는 stdin 으로 전달되어 셸 히스토리에 안 남습니다.
```bash
printf '%s' '<DEMO_PW>' | ssh -i ~/.ssh/ghmate_server -p 222 ghmate@ghmate.iptime.org \
  'docker exec -i -e REVIEWER_EMAIL=demo@codingpt.app codingpt_back_prod node scripts/seed-reviewer.js'
```
→ 계정: **`demo@codingpt.app` / `<DEMO_PW>`** (원하면 비번 바꿔도 됨. 심사노트와 일치만 시키기.)

### 1-b. 데모 PC 상시 연결 (항상 켜져 있는 Mac 1대 권장)
1. 그 Mac에 `https://codingpt.ghmate.com/download` 에서 CodingPT 데스크톱 앱 설치.
2. 앱 열고 "이 PC 연결" → 브라우저 열리면 **`demo@codingpt.app` 이메일 로그인** → 연결 승인.
3. 샘플 프로젝트 폴더 1개 열어두기(예: 간단한 웹앱). 터미널도 1개 띄워두면 좋음.
   → 리뷰어가 로그인하면 살아있는 워크스페이스가 바로 보임.

> ⚠️ 심사 기간(제출~승인, 보통 1~3일) 동안 이 Mac·데몬을 **끄지 말 것.**

---

## 2. 심사 노트 (App Review Notes / 테스트 지침) — 양 스토어 공통, 그대로 복사

```
CodingPT is a companion app that remotely controls the user's OWN computer
(terminal, code editor, live preview) — similar to an SSH or remote-desktop client.

To use it, install the free desktop app (https://codingpt.ghmate.com/download) on your
computer and connect it. Because a reviewer may not connect their own computer, we provide
a DEMO ACCOUNT that is already connected to a running computer so you can see full functionality:

  Login: tap "이메일로 로그인" (Sign in with email) on the login screen
  Email:    demo@codingpt.app
  Password: <DEMO_PW>

After logging in, you will see a live workspace (terminal + file editor) connected to our
demo computer. You can browse/edit files and use the terminal.

Account deletion is available in Settings; for Sign in with Apple accounts, the Apple token
is revoked server-side on deletion (Guideline 5.1.1(v)).

Notes:
- No subscription/payment. The app is free.
- No ads or third-party tracking SDKs.
```

---

## 3. Apple App Privacy (App Store Connect → 앱 개인정보) — 선택 값

**"데이터 수집함(Yes)"** → 아래 항목만 체크. 전부 **App Functionality** 목적, **추적 안 함(No tracking)**, 사용자 연결됨(Linked).

| 카테고리 | 세부 | 목적 | 사용자연결 | 추적 |
|---|---|---|---|---|
| Contact Info | Email Address | App Functionality(계정) | Linked | No |
| Identifiers | User ID | App Functionality(계정 식별) | Linked | No |
| Identifiers | Device ID | App Functionality(푸시 알림) | Linked | No |
| User Content | Other User Content(사용자 PC의 파일/코드 — 체크포인트 백업) | App Functionality | Linked | No |

- **Data used to track you**: 없음
- 위치·연락처·건강·금융·검색기록·광고데이터: **수집 안 함**

---

## 4. Google Play Data Safety (데이터 보안) — 선택 값

- **데이터 수집: 예 / 암호화 전송: 예 / 삭제 요청 방법 제공: 예(인앱 회원탈퇴 + 개인정보처리방침)**

| 데이터 유형 | 수집 | 목적 | 공유 |
|---|---|---|---|
| 개인정보 > 이메일 주소 | 예 | 계정 관리, 앱 기능 | 아니오 |
| 개인정보 > 사용자 ID | 예 | 계정 관리 | 아니오 |
| 앱 활동/기기 ID | 예 | 푸시 알림 | 아니오 |
| 파일 및 문서(사용자 PC 파일) | 예 | 앱 기능(원격 조작·백업) | 아니오 |

- 광고·위치·금융·연락처·건강: **아니오**

---

## 5. 스토어 리스팅 (복사용)

- **앱 이름**: CodingPT
- **부제(Subtitle, 30자)**: 내 PC를 폰에서 원격 코딩
- **카테고리**: Developer Tools(개발자 도구) / (2차) Productivity
- **연령 등급**: 4+ (Apple) / 만 3세+ 전체이용가 (Google) — 폭력/성인/도박 없음
- **지원 URL**: https://codingpt.ghmate.com
- **마케팅 URL**: https://codingpt.ghmate.com
- **개인정보처리방침 URL**: https://codingpt.ghmate.com/legal/privacy

**설명(Description)**:
```
CodingPT로 내 컴퓨터를 어디서든 조작하세요.

집이나 사무실 PC에 무료 데스크톱 앱을 설치해 연결하면, 휴대폰·태블릿에서 그 PC의
터미널·코드 에디터·미리보기를 그대로 원격 조작할 수 있습니다.

• 내 PC의 터미널을 폰에서 이어서 조작 — CLI 작업을 이동 중에도
• 코드 에디터로 PC 폴더의 파일을 열어 편집
• 실시간 미리보기로 결과 확인
• 여러 PC를 연결해 자유롭게 전환
• PC·태블릿·폰 간 작업 이어가기

CodingPT는 사용자 PC의 터미널·파일을 안전하게 릴레이하는 연결 앱입니다.
```

**키워드(Apple, 100자)**: `원격,터미널,SSH,코딩,개발,IDE,원격데스크톱,PC연결,ssh,terminal,remote,coding`

---

## 6. 연령 등급 설문 (양 스토어 공통 답)

폭력/성적내용/욕설/약물/도박/공포 → **전부 없음/None**. → Apple 4+, Google 전체이용가.

---

## 7. 회원 탈퇴 / 계정 삭제 (심사자가 확인) — 이미 구현됨

- 앱: 설정 → 회원탈퇴 → "회원탈퇴" 입력 → 삭제.
- Apple 로그인 계정: 서버가 Apple refresh_token 을 revoke (5.1.1(v) 충족).
- 웹: https://codingpt.ghmate.com 로그인 후 마이페이지에서도 가능.

---

## 8. 업로드 (빌드)

- **iOS**: Xcode → Product → Archive → Organizer → Distribute → App Store Connect. (iPad 4방향·빌드6 반영됨)
- **Android**: 서명된 AAB `android/app/build/outputs/bundle/release/app-release.aab` 를 Play Console 업로드.
- **Issuer ID / Play 서비스계정 JSON** 을 Claude 에게 주면 업로드 자동화 가능.

---

## 체크리스트

- [ ] 데모 계정 생성(1-a)
- [ ] 데모 PC 상시 연결(1-b)
- [ ] iOS Archive 업로드
- [ ] AAB Play 업로드
- [ ] 심사노트·개인정보 선언·리스팅 입력(2~6)
- [ ] 제출
