# Mobile App (`codingpt_app/`)

React Native (TypeScript) iOS/Android 앱. **현재 중심 = PC 원격 조작 워크스페이스 셸**
(cmux식 타일링·터미널 라이브 미러·IDE·프리뷰) — 레슨/구독 화면은 레거시 동결.

## 워크스페이스 셸 아키텍처 (핵심)

```
src/contexts/WorkspaceShellContext.tsx  셸 상태 정본 — 풀 리컨실러, 세션 매니페스트 동기화,
                                        호스트 자동 라우팅(setActive), 알림 읽음 트리거
src/workspace/PaneView.tsx              pane 렌더 — 터미널(WebView xterm)/IDE/프리뷰 탭, 드래그 배치
src/components/TerminalWebView.tsx      터미널 WebView — input 델타 방식(한글 IME), blur 시 __resetBuf 필수
src/components/keyboard/KeyAssist.tsx   특수키 패널 싱글턴 — termSeqFor(조합키 셸 시퀀스) 정본
src/components/SidebarContent.tsx       사이드바 — 프로젝트 그룹핑(projectId) 렌더·분리/합치기
src/services/daemonService.ts           back 데몬 API + WSS 이벤트 구독(subscribeDaemonAgentEvents)
src/services/workspaceService.ts        워크스페이스 메타(objectstore 경유 REST)
```

## 절대 함정 (실측으로 확인된 것)

- **터미널 입력은 input 델타**: xterm 키보드 비활성. blur 시 xterm이 textarea를 비우므로 미러 리셋
  필수. 편집 조합키(⌘⌫ 등)는 `termSeqFor`로 셸 시퀀스 직접 전송 — PC와 규칙 공유, 한쪽만 수정 금지.
- **iOS WKWebView**: `opacity:0`은 터치 계층을 재움(불투명 zIndex 겹침으로 해결), 네이티브 포커스만
  뺏기고 DOM blur 미전달 → 키보드 hide 시 DOM blur 선주입 필요.
- **Android 좌표**: `pageY`와 `measureInWindow`는 상태바만큼 어긋남 — 밴드 판정은 `measure()`로 통일.
- E2E 텍스트 입력은 `adb input text`가 아니라 CDP `Input.insertText`(삼성 키보드가 삼킴).
  화면 단언은 `adb exec-out screencap` + `tmux -L codingpt capture-pane`.
- NativeWind에서 Pressable **함수형 style 금지**(크래시). 네이티브 GoogleSigninButton 렌더 금지(NPE).
- 모션/인터랙션(눌림·전환·등장) 항상 챙길 것 — PressableScale 사용.

## 컨벤션

- `src/services/` 타입 필수, 공용 타입은 `src/types/`
- 스타일: NativeWind `className` (StyleSheet은 표현 불가할 때만)
- 전역 상태: `src/contexts/` — 새 Context는 `App.tsx` Provider 중첩에 추가
- 환경: `npm run android:local|dev|stg|prod` / `react-native-config`(`Config.BACK_URL` 등)
- iOS 네이티브 의존성 추가 시 `cd ios && bundle exec pod install`

## 브랜치

- `main` — 활성 개발 브랜치(구 stg는 은퇴, 신규 사용 금지)

## 빌드/검증

```bash
npm run build:android-apk | build:android-aab | build:ios-archive
```

수정 후엔 반드시 리로드/재빌드 후 실기기(에뮬레이터) 스크린샷으로 확인하고 완료 보고
(`.claude/agents/verifier.md`). 커밋 메시지에 Claude/AI 언급 금지(훅이 강제).
