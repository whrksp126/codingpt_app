# CodingPT 스토어 심사 제출 가이드 (App Store · Google Play)

> 목적: 심사 리젝 방지 + 콘솔에 그대로 붙여넣을 값 모음.
> 핵심 리스크 = "리뷰어가 PC를 연결하지 않으면 앱이 빈 화면" → **데모 계정 + 상시 연결된 데모 PC**로 해결.

---

## 0. 앱 개요 (심사자 이해용)

CodingPT는 **사용자 본인 PC의 컴패니언 앱**입니다. PC용 무료 데스크톱 앱을 설치·연결하면,
휴대폰/태블릿에서 그 PC의 **터미널·코드 에디터·미리보기에 원격 접속해 작업**합니다. (SSH/원격데스크톱 계열)

- 로그인: Google / Apple / 이메일. 회원 삭제 인앱 제공(Apple 5.1.1(v) revoke 포함).
- 결제/구독 없음(현재 무료). 광고/추적 SDK 없음.

---

## 1. ⭐ 데모 계정 + 서버 클라우드 워크스페이스 (가장 중요 — 이거 안 하면 리젝)

> **방식**: 물리 Mac을 상시 켜두는 대신, **서버의 클라우드 러너**(scale-to-zero, 콜드스타트)에
> 데모 워크스페이스를 미리 붙여 뒀다. 심사 기간 내내 서버가 24/7 유지되므로 PC를 켜둘 필요 없음.
> (이 셋업은 2026-07-19 prod에 완료·E2E 검증됨: 러너 기동→연결→터미널→프리뷰 렌더까지 확인.)

### 1-a. 데모 계정 (완료됨 — `demo@codingpt.app`)
prod에 이미 시드됨. 비번 변경이 필요하면:
```bash
printf '%s' '<DEMO_PW>' | ssh -i ~/.ssh/ghmate_server -p 222 ghmate@ghmate.iptime.org \
  'docker exec -i -e REVIEWER_EMAIL=demo@codingpt.app codingpt_back_prod node scripts/seed-reviewer.js'
```
→ 계정: **`demo@codingpt.app` / `<DEMO_PW>`** (심사노트와 비번만 일치시키기.)

### 1-b. 클라우드 데모 워크스페이스 (완료됨 — "CodingPT 데모")
- prod에서 `CLOUD_RUNNER_ENABLED=true`(docker-compose.prod.yml back), Docker 접근은 docker-socket-proxy 경유.
- demo 계정에 **compute:'cloud' 워크스페이스 "CodingPT 데모"**(id `p-mrr37ard-7bc729`)가 생성돼 있고,
  러너 볼륨에 데모 정적 웹 프로젝트(`/workspace/demo` — index.html/style.css/app.js/README.md)가 시드됨.
- 리뷰어가 로그인 → 목록의 "CodingPT 데모" 열기 → 러너 콜드스타트(파일 볼륨에 영속) → 터미널/IDE 사용.
- **프리뷰 시연**: 터미널에서 `cd demo && python3 -m http.server 3000` 실행 후 프리뷰에서 포트 3000 열기 → 데모 페이지 렌더.

> ⚠️ 심사 기간 동안 **prod 서버(홈서버 Docker)를 끄지 말 것.** 물리 Mac은 불필요.
> 참고: 러너는 15분 유휴 시 동면(컨테이너 제거·볼륨 유지)되고, 다음 접속 시 콜드스타트로 파일이 복원됨.
> 프리뷰용 dev 서버(http.server)는 동면 후 리뷰어가 위 명령으로 다시 띄우면 됨(터미널 시연이 자연스러움).

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

After logging in, open the workspace named "CodingPT 데모" from the list. It runs on our
server, so it is available 24/7 (no need to connect your own computer). You will see a live
workspace with a terminal and a file editor; a sample web project is already in the "demo"
folder. You can browse/edit files and use the terminal.

To try the live preview: in the terminal run
  cd demo && python3 -m http.server 3000
then open the Preview tab and enter port 3000 — the demo page will render.

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
| 파일 및 문서(사용자 PC 파일) | 예 | 앱 기능(원격 접속·백업) | 아니오 |

- 광고·위치·금융·연락처·건강: **아니오**

---

## 5. 스토어 리스팅 (복사용)

- **앱 이름**: CodingPT
- **부제(Subtitle, 30자)**: 내 PC 작업을 어디서든 이어서
- **카테고리**: Developer Tools(개발자 도구, 1차) / Productivity(생산성, 2차) — 교육(Education) 아님
- **연령 등급**: 4+ (Apple) / 만 3세+ 전체이용가 (Google) — 폭력/성인/도박 없음
- **지원 URL**: https://codingpt.ghmate.com
- **마케팅 URL**: https://codingpt.ghmate.com
- **개인정보처리방침 URL**: https://codingpt.ghmate.com/legal/privacy

**설명(Description)**:
```
CodingPT는 집이나 사무실의 내 컴퓨터에서 하던 작업을 휴대폰·태블릿에서 그대로 이어가는 앱입니다.
PC에 무료 데스크톱 앱을 설치해 연결하면, 어디서든 내 PC의 터미널·코드 에디터·미리보기를
손안에서 이어서 작업할 수 있어요. 이동 중에도, 카페에서도, 침대에서도 내 개발 환경이
그대로 따라옵니다.

이렇게 써요
• 내 PC 연결 — 무료 데스크톱 앱을 설치하고 로그인 한 번이면 끝. 복잡한 설정 없이 바로 연결됩니다.
• 어디서든 열기 — 폰·태블릿에서 내 PC의 터미널·에디터·미리보기를 그대로 열어요.
• 작업 이어가기 — PC에서 하던 일을 폰에서, 다시 태블릿에서 그대로 이어가요.

주요 기능
• PC 터미널 이어받기 — 내 컴퓨터의 터미널을 폰에서 그대로 이어받아요. 실행 중이던 CLI·AI
  에이전트 세션도 끊김 없이 이어집니다.
• 코드 에디터 — 내 PC 폴더의 파일을 열어 바로 편집. 문법 하이라이트·파일 트리·전체 검색을 모바일에서 그대로.
• 실시간 미리보기 — 내 PC에서 돌아가는 개발 서버를 앱 안 브라우저로 확인. 코드를 고치면 결과가 즉시 반영됩니다.
• 태블릿 멀티 창 — 넓은 화면에서 코드와 미리보기를 나란히 띄워 한 번에 작업.
• 여러 PC·기기 — 여러 대의 컴퓨터를 연결하고, PC·태블릿·폰을 오가며 같은 작업을 그대로 이어가세요.
• 작업 알림 — 빌드 완료·승인 요청·작업 종료 같은 소식을 실시간으로 확인.

이런 분께 추천해요
• 밖에서도 집·회사 PC로 작업을 이어가고 싶은 개발자
• 아이패드·휴대폰으로 코딩과 터미널 작업을 하고 싶은 분
• 여러 대의 컴퓨터를 오가며 작업하는 분

왜 좋을까요
• 하던 작업 그대로 — 집·회사에서 하던 개발을 어디서든 이어가요. 이동 중에도 흐름이 끊기지 않아요.
• 내 PC에서 실행 — 코드는 클라우드로 올라가지 않고, 내 컴퓨터와 안전하게 연결됩니다.
• AI 자격증명을 다루거나 외부로 전송하지 않는 안전한 연결
• 구독료 없이 무료로 사용

지금 내 컴퓨터를 CodingPT에 연결하고, 어디서든 코딩을 이어가세요!
```

**키워드(Apple, 100자)**: `원격,터미널,SSH,코딩,개발,IDE,원격데스크톱,PC연결,ssh,terminal,remote,coding`

**업데이트 내용(What's New / 릴리스 노트)** — 교육앱→개발 워크스페이스 대전환이라 "새로워짐"으로:
```
CodingPT가 새로워졌어요. 이제 내 PC에서 하던 작업을 폰·태블릿에서 그대로 이어갈 수 있어요.

• 내 컴퓨터의 터미널·코드 에디터·실시간 미리보기를 손안에서 그대로
• 실행 중이던 CLI·AI 에이전트 세션을 폰에서 그대로 이어받기
• 여러 PC 연결 + PC·태블릿·폰 간 작업 이어가기
• 무료 데스크톱 앱으로 로그인 한 번이면 간편 연결

지금 내 PC를 연결하고 어디서든 코딩을 이어가 보세요!
```

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
