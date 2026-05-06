# Mobile App Rules (`codingpt_app/`)

React Native (TypeScript) iOS/Android 앱.

---

## TypeScript

- `src/services/` — 모든 API 서비스 레이어에 타입 지정 필수
- `src/types/` — 공용 타입 정의

---

## 스타일링

- NativeWind (Tailwind for React Native) — `className` prop으로 스타일 적용
- `StyleSheet.create()` — NativeWind로 표현 불가한 경우에만 사용
- 커스텀 설정: `tailwind.config.js`

---

## 상태 관리

- 전역 상태: `src/contexts/` React Context
- 새 전역 상태 추가 시 `App.tsx` Provider 중첩 구조에 추가

Provider 순서: `Auth → User → Store → Lesson → Modal`  
→ React Navigation (Bottom Tabs + Native Stacks)

---

## 환경 설정

- 환경별 실행: `npm run ios:local|dev|stg|prod` / `npm run android:local|dev|stg|prod`
- 환경변수 접근: `react-native-config` (`Config.BACK_URL` 등)
- 환경 파일: `.env.local`, `.env.dev`, `.env.stg`, `.env`
- 주요 변수: `BACK_URL`, `ANDROID_BACK_URL`, `IOS_BACK_URL`

---

## iOS

- 새 네이티브 의존성 추가 시: `cd ios && bundle exec pod install && cd ..`

---

## 브랜치 구조

- `stg` — 활성 개발 브랜치 (gih1214 등 동료 협업)
- `main` — 베이스 (오래됨)
- `temp` — 임시 작업

---

## 빌드

```bash
npm run build:android-apk    # APK
npm run build:android-aab    # Play Store
npm run build:ios-archive    # iOS 아카이브
```
