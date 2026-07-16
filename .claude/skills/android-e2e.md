---
name: android-e2e
description: 유선 안드로이드 실기기에서 앱 E2E 검증(스크린샷·터치·텍스트 입력·터미널 단언). 수정 후 실기기 확인이 필요할 때 사용.
---

# 안드로이드 실기기 E2E 레시피

## 화면 캡처·좌표

```bash
adb exec-out screencap -p > <스크래치패드>/shot.png
```
- Read로 이미지를 보면 축소 표시됨 — **표시 배율(예: ×1.48)을 곱해 원본 좌표로 환산** 후 tap.
- 탭: `adb shell input tap <x> <y>` (원본 해상도 기준)

## 텍스트 입력 — adb input text 금지

삼성 키보드가 `adb input text`를 삼킨다. **CDP `Input.insertText`**(IME 커밋 경로)를 사용:
1. `adb forward tcp:9222 localabstract:webview_devsocket_<pid>` 로 WebView CDP 연결
2. 기존 스크립트 재사용: 스크래치패드의 `cdp_eval.mjs`/`cdp_cmd.mjs` 패턴
- RN 네이티브 TextInput은 CDP 불가 — 이 경우 좌표 탭 + `adb shell input keyevent`로 우회하거나 사용자에게 요청.

## 터미널 상태 단언 (스크린샷보다 결정론적)

터미널 pane 내용은 Mac 쪽 tmux가 정본:
```bash
tmux -L codingpt list-windows -t =<세션명>          # 타겟은 반드시 = 정확 일치
tmux -L codingpt capture-pane -pt =<세션명>:<idx> | tail -20
```

## 리로드/재빌드

- JS 변경: metro 리로드(`adb shell input text "RR"` 대신 메뉴/딥링크) 또는 앱 재시작
  `adb shell am force-stop <pkg> && adb shell monkey -p <pkg> 1`
- 네이티브/환경 변경: `npm run android:local|dev|prod` 재빌드
- **검증 전 리로드 누락 금지** — 수정이 반영 안 된 화면으로 판정하는 사고 방지.

## 정리

테스트 중 만든 워크스페이스/파일/서버는 검증 후 반드시 정리. 스크린샷은 스크래치패드에만 저장.
