# CodingPT - 코딩 학습 앱

React Native로 개발된 코딩 학습 플랫폼입니다.

## 📁 프로젝트 구조

```
codingpt_app/
├── 📱 네이티브 플랫폼
│   ├── ios/                 # iOS 네이티브 코드 (Swift/Objective-C)
│   └── android/             # Android 네이티브 코드 (Java/Kotlin)
│
├── 🚀 진입점
│   ├── index.js             # React Native 앱 시작점
│   └── App.tsx              # 메인 앱 컴포넌트
│
├── 📦 설정 파일들
│   ├── package.json         # 프로젝트 의존성 및 스크립트
│   ├── tsconfig.json        # TypeScript 설정
│   ├── metro.config.js      # React Native 번들러 설정
│   ├── babel.config.js      # JavaScript/TypeScript 변환 설정
│   └── app.json            # 앱 메타데이터
│
└── src/                     # 메인 소스 코드
    ├── 🖥️ screens/          # 화면 컴포넌트들 (사용자에게 보이는 UI)
    │   ├── HomeScreen.tsx   # 메인 홈 화면
    │   ├── StoreScreen.tsx  # 스토어 화면
    │   ├── MyPageScreen.tsx # 마이페이지 화면
    │   ├── Auth/            # 인증 관련 화면들
    │   │   ├── LoginScreen.tsx    # 로그인 화면
    │   │   └── SignupScreen.tsx   # 회원가입 화면
    │   └── Lesson/          # 강의 관련 화면들
    │       ├── LessonListScreen.tsx   # 강의 목록 화면
    │       ├── LessonDetailScreen.tsx # 강의 상세 화면
    │       └── SlideScreen.tsx       # 슬라이드 화면
    │
    ├── 🧩 components/       # 재사용 가능한 UI 컴포넌트들
    │   ├── Button.tsx       # 공통 버튼 컴포넌트
    │   ├── CodeEditor.tsx   # 코드 편집기 컴포넌트
    │   └── LessonCard.tsx   # 강의 카드 컴포넌트
    │
    ├── 🧭 navigation/       # 화면 간 이동 관리
    │   ├── AppNavigator.tsx # 메인 앱 네비게이션 (로그인 후)
    │   └── AuthNavigator.tsx # 인증 네비게이션 (로그인 전)
    │
    ├── 📊 data/             # 정적 데이터 파일들 (JSON, CSV 등)
    │   ├── lessons/         # 강의 데이터 (강의 내용, 문제 등)
    │   └── quizzes/         # 퀴즈 데이터 (문제, 답안 등)
    │
    ├── 🎨 assets/           # 이미지, 아이콘, 폰트 등 리소스
    │   └── icons/           # 앱에서 사용하는 아이콘들
    │
    ├── 🔧 services/         # 백엔드 API 통신 및 비즈니스 로직
    │   ├── lessonService.ts # 강의 관련 API 호출 (강의 목록, 상세 등)
    │   └── userService.ts   # 사용자 관련 API 호출 (로그인, 회원가입 등)
    │
    ├── 🪝 hooks/            # 커스텀 React Hooks (로직 재사용)
    │   └── useAuth.ts       # 인증 관련 커스텀 훅 (로그인 상태 관리)
    │
    ├── 🏷️ types/            # TypeScript 타입 정의 (데이터 구조)
    │   └── lesson.ts        # 강의 관련 타입 정의 (Lesson, Quiz 등)
    │
    ├── 🛠️ utils/            # 유틸리티 함수들 (공통 기능)
    │   ├── api.ts           # API 통신 유틸리티 (HTTP 요청, 에러 처리)
    │   ├── format.ts        # 데이터 포맷팅 유틸리티 (날짜, 숫자 등)
    │   └── storage.ts       # 로컬 저장소 유틸리티 (AsyncStorage)
    │
    ├── 📋 constants/        # 앱에서 사용하는 상수들
    │   ├── colors.ts        # 색상 상수 (테마 색상)
    │   └── routes.ts        # 화면 경로 상수 (네비게이션 경로)
    │
    └── 🔄 contexts/         # React Context (전역 상태 관리)
        ├── AuthContext.tsx  # 인증 상태 관리 (로그인/로그아웃)
        └── LessonContext.tsx # 강의 상태 관리 (진행률, 완료 등)
```

### 📋 **폴더별 기능 설명**

#### 🖥️ **screens/** - 사용자 화면
- **목적**: 사용자가 직접 보는 화면들을 담는 곳
- **예시**: 로그인 화면, 홈 화면, 강의 목록 화면, 마이페이지 등
- **특징**: 각 화면은 독립적인 컴포넌트로 구성

#### 🧩 **components/** - 재사용 UI 컴포넌트
- **목적**: 여러 화면에서 공통으로 사용하는 UI 요소들
- **예시**: 버튼, 카드, 모달, 로딩 스피너 등
- **특징**: props를 받아서 다양한 상황에서 재사용 가능

#### 🧭 **navigation/** - 화면 이동 관리
- **목적**: 화면 간 이동과 네비게이션 구조 정의
- **예시**: 탭 네비게이션, 스택 네비게이션, 인증 플로우 등
- **특징**: 사용자 경험을 위한 화면 전환 로직

#### 📊 **data/** - 정적 데이터
- **목적**: 앱에서 사용하는 고정된 데이터들
- **예시**: 강의 내용, 퀴즈 문제, 설정값 등
- **특징**: JSON, CSV 등 구조화된 데이터 파일

#### 🎨 **assets/** - 리소스 파일
- **목적**: 이미지, 아이콘, 폰트 등 시각적 리소스
- **예시**: 앱 아이콘, 배경 이미지, UI 아이콘 등
- **특징**: 앱 크기에 영향을 주므로 최적화 필요

#### 🔧 **services/** - API 통신
- **목적**: 백엔드 서버와의 통신 로직
- **예시**: 사용자 인증, 데이터 조회, 파일 업로드 등
- **특징**: 비즈니스 로직과 UI 로직을 분리

#### 🪝 **hooks/** - 커스텀 로직
- **목적**: 여러 컴포넌트에서 재사용할 수 있는 로직
- **예시**: 인증 상태 관리, 데이터 페칭, 폼 처리 등
- **특징**: React Hooks 패턴을 활용한 로직 재사용

#### 🏷️ **types/** - 타입 정의
- **목적**: TypeScript로 데이터 구조 정의
- **예시**: API 응답 타입, 컴포넌트 props 타입 등
- **특징**: 타입 안정성과 개발 생산성 향상

#### 🛠️ **utils/** - 유틸리티 함수
- **목적**: 공통으로 사용하는 헬퍼 함수들
- **예시**: 날짜 포맷팅, 문자열 처리, 유효성 검사 등
- **특징**: 순수 함수로 구성하여 테스트하기 쉬움

#### 📋 **constants/** - 상수 정의
- **목적**: 앱에서 사용하는 고정값들
- **예시**: 색상, 크기, 경로, 메시지 등
- **특징**: 한 곳에서 관리하여 유지보수성 향상

#### 🔄 **contexts/** - 전역 상태 관리
- **목적**: 여러 컴포넌트에서 공유하는 상태
- **예시**: 사용자 정보, 테마 설정, 앱 설정 등
- **특징**: React Context API를 활용한 상태 관리

## 🏗️ 아키텍처 특징

### ✅ **TypeScript 기반**
- 타입 안정성으로 개발 생산성 향상
- 컴파일 타임 에러 방지

### ✅ **컴포넌트 기반 구조**
- 재사용 가능한 컴포넌트로 코드 중복 최소화
- 유지보수성 향상

### ✅ **Context API 상태 관리**
- 전역 상태를 효율적으로 관리
- 컴포넌트 간 데이터 공유

### ✅ **서비스 레이어 패턴**
- API 통신 로직을 별도 레이어로 분리
- 비즈니스 로직과 UI 로직 분리

### ✅ **훅 기반 로직**
- 커스텀 훅으로 로직 재사용
- 함수형 컴포넌트 중심 개발

## 🚀 실행 방법

### Metro 개발 서버 시작
```bash
npm start
```

### 앱 실행

#### Android
```bash
# 기본 실행
npm run android

# 환경별 실행
npm run android:local    # .env.local 환경
npm run android:dev      # .env.dev 환경  
npm run android:stg      # .env.stg 환경
npm run android:prod     # .env 환경 (프로덕션)
```

#### iOS
```bash
# 기본 실행
npm run ios

# 환경별 실행
npm run ios:local    # .env.local 환경
npm run ios:dev      # .env.dev 환경  
npm run ios:stg      # .env.stg 환경
npm run ios:prod     # .env 환경 (프로덕션)
```

**iOS 초기 설정 (최초 1회만 필요):**
```bash
cd ios && pod install && cd ..
```

### 개발 도구

#### 코드 품질 관리
```bash
npm run lint    # ESLint로 코드 검사
npm run test    # Jest로 테스트 실행
```

#### 환경 설정
프로젝트는 `react-native-config`를 사용하여 환경별 설정을 관리합니다:
- `.env.local` - 로컬 개발 환경
- `.env.dev` - 개발 서버 환경
- `.env.stg` - 스테이징 환경
- `.env` - 프로덕션 환경
