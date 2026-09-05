import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as i18n from '../../../i18n/index.ts';
import { WebView } from 'react-native-webview';
import { Clipboard, Platform, TextInput, View } from 'react-native';
import { useDisplayScale } from '../../../utils/displayScaleSetting';
import { useCodeFont, codeFontFamilyCss, codeFontFaceCss } from '../../../utils/fontSetting';
import { useTermScheme } from '../../../utils/termSchemeSetting';
import { termPalette, termMinContrast, TermPalette } from '../../../theme/terminalSchemes';
import { useTheme } from '../../../contexts/ThemeContext';
import { useShortcuts } from '../../../palette/shortcuts';
import { WEBVIEW_KEY_JS, webviewKeyTableJs } from '../../../palette/webviewKeys';
import v2 from '../../../theme/v2Tokens';
import { XTERM_ENGINE_CSS, XTERM_ENGINE_JS } from './terminalWebViewEngine.generated';

// 실시간 인터랙티브 터미널 — xterm.js + WebSocket(백엔드 PTY).
//  · 키 입력/방향키/Tab/Ctrl-C 는 xterm onData → ws(binary) → 서버 셸 stdin.
//  · 서버 셸 raw 출력(ANSI/readline/탭완성)은 ws → term.write 그대로.
//  · 리사이즈는 fit 후 {type:'resize',cols,rows} 텍스트 메시지.
// xterm 은 lessons Terminal.tsx 와 동일하게 unpkg 인라인(버전 고정). 터미널은 서버 연결 필수라 CDN 허용.

export interface TerminalHandle {
  /** PTY stdin 으로 키/바이트 전송(액세서리 키: Ctrl-C=\x03, 방향키 등) */
  sendKey: (s: string) => void;
  /** 화면에만 표시(에이전트 Bash 로그 등 — 셸 입력 아님). \n 은 \r\n 으로 정규화 */
  write: (text: string) => void;
  /** 화면 지우기 */
  clear: () => void;
  /** 컨테이너 크기 변동 시 재맞춤 */
  fit: () => void;
  /** 실물키보드 패널 모디파이어(ctrl/meta) 활성 상태 주입 — OS 키보드 글자를 제어바이트로 변환 */
  setVmods: (flags: { ctrl?: boolean; meta?: boolean }) => void;
  /** xterm 포커스 → OS 소프트 키보드 복귀 */
  focus: () => void;
  /** xterm 입력 블러 → OS 소프트 키보드 내림(특수키 패널로 전환 시) */
  blur: () => void;
  /**
   * 여러 줄 텍스트를 bracketed paste 로 감싸 PTY 에 넣는다(줄마다 즉시 실행되는 것 방지).
   *  · 웹뷰측 window.__term_paste 는 이미 존재하므로 **HTML 문자열 변경 없음 = 터미널 재마운트 없음**.
   *  · sendKey 와의 차이: sendKey 는 원문을 그대로 보내 개행이 곧 Enter 가 된다(단일 키/시퀀스용).
   */
  paste: (text: string) => void;
  /** 크기 소유권 가져오기 — 네이티브 알약 버튼이 부른다. */
  claim: () => void;
}

interface Props {
  /** 터미널 스트림 WS URL — null 이면 "아직 토큰 발급 전"(웹뷰는 미리 부팅해 두고 연결만 미룬다). */
  wsUrl: string | null;
  onReady?: () => void;
  /** 사용자가 터미널에 입력한 한 줄 명령(Enter 확정) — dev 명령 자동 미리보기 등에 사용 */
  onCommand?: (line: string) => void;
  /** 모디파이어 조합키가 실제로 실행됨 → RN 이 once 모디파이어 해제 */
  onVmodConsume?: () => void;
  /** 터미널 입력 포커스 변화(보조바 즉시 노출용) */
  onFocusChange?: (focused: boolean) => void;
  /** OSC 9/777/99 · 벨 알림 → 인앱 알림 패널/배지 */
  onNotify?: (title: string, body: string) => void;
  /** 크기 소유자 상태 — 알약은 RN 이 그린다(WebView 안에 두면 WKWebView 가 유령 타일을 남긴다). */
  onOwner?: (s: { viewer: boolean; name: string }) => void;
  /** 터미널 WS (재)접속 성공 — 재접속 시 서버가 재시작됐을 수 있어 view/크기 재보정 트리거용 */
  onWsOpen?: () => void;
  // 토큰 사망 감지 — 즉시실패(3s 미만 생존) 재접속이 연속 3회면 호출. RN 이 새 토큰을 발급해야
  //  복구된다(웹뷰 내부 루프는 같은 URL 만 재시도 — back 재배포로 토큰이 증발하면 영원히 502).
  onWsDead?: () => void;
  /** 3초 이상 살아남아 "건강한" 연결로 확정됐을 때 — 재연결 실패 하드캡 카운터 리셋용 */
  onWsHealthy?: () => void;
  /** 터미널 내부 터치(이미 포커스된 상태 포함) — "이 기기서 작업" 신호(크기 회수용, 1.2s 스로틀) */
  onInteract?: () => void;
  /**
   * 하드웨어 키보드의 ⌘ 조합이 **앱 단축키 표에 걸려 있을 때** — 셸로 안 보내고 이걸 부른다.
   *  Ctrl·Alt 조합은 여기 오지 않는다(터미널 몫). 판정은 palette/webviewKeys.ts.
   */
  onAppKey?: (combo: string) => void;
}

// xterm 엔진·CSS는 generated.ts에 번들돼 Android/iOS가 동일 버전을 오프라인 사용한다.
// ASSET_BASE는 Android의 내장 한글 폰트 CSS에만 남는다(iOS는 시스템 폰트+Google 폴백).
const ASSET_BASE = Platform.OS === 'android' ? 'file:///android_asset/xterm/' : null;
const vendorUrl = (localName: string, cdnUrl: string) => (ASSET_BASE ? localName : cdnUrl);
/** 배율 1.0 기준 터미널 폰트 크기(px) — 표시 배율 설정이 여기에 곱해진다. */
const TERM_BASE_FONT = 13;

// ⚠ wsUrl 은 HTML 에 굽지 않는다(2026-08-15 성능 라운드) — 굽으면 토큰 재발급마다 WebView 통째
//  재마운트(xterm 재로드 + 화면 전부 재생)가 난다. 연결은 __term_connect(url) 주입으로만.
//  덕분에 WebView 를 토큰 발급 REST 와 **병렬로 미리 부팅**할 수 있다(빈 xterm 선마운트).
const buildHtml = (fontPx: number, palette: TermPalette, mcr: number, fontFamilyCss: string, fontFaceCss: string) => {
  // v3 소유권 문구 — 웹뷰 안 문자열은 i18n 스캐너가 못 보므로 TSX 쪽에서 번역해 넣는다.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${XTERM_ENGINE_CSS}</style>
  <!-- CJK 모노스페이스 웹폰트 — 시스템 폰트(Menlo 등)엔 한글 글리프가 없어 빈칸 렌더됨.
       Nanum Gothic Coding(한글 고정폭)을 폴백으로 로드해 한글도 정상 표시.
       Android 는 APK 내장(nanum.css + fonts/) — 네트워크 0, 뜨자마자 최종 글꼴. -->
  ${ASSET_BASE ? '' : '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'}
  <link rel="stylesheet" href="${vendorUrl('nanum.css', 'https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding&display=swap')}" />
  <script>${XTERM_ENGINE_JS}</script>
  <style>
    ${fontFaceCss /* 코드·터미널 글꼴(선택된 것만 내장 — 변경 시 재마운트) */}
    html, body { margin:0; padding:0; height:100%; background:${palette.background}; overflow:hidden; }
    /* Android WebView가 실물 손가락 드래그를 네이티브 pan으로 선점하면 JS touchmove가 중간에
       cancel되어 TUI 스크롤 변환이 실행되지 않는다. 일반 셸도 아래 JS가 scrollLines로 처리하므로
       터미널 표면 전체를 앱 제스처 소유로 고정한다. */
    #t, #t .xterm, #t .xterm-viewport, #t .xterm-scrollable-element, #t .xterm-screen, #t .xterm-helper-textarea { touch-action:none !important; }
    #t .xterm-scrollable-element { overflow-y:hidden !important; }
    #t .xterm-scrollable-element > .xterm-scrollbar, #t .xterm-scrollbar { display:none !important; }
    #t { position:absolute; inset:0; padding:6px; }
    /* 서버 canonical history 뷰 — 라이브 격자와 같은 xterm 인스턴스로 그린다. 예전엔 평문 div 라
       과거로 올라가는 순간 화면이 통째로 단색이 됐다(색·와이드문자·박스문자 전부 유실). */
    #historyViewport { display:none; position:absolute; inset:0; z-index:20; overflow:hidden; padding:6px;
      box-sizing:border-box; background:${palette.background}; }
    /* ⚠ pointer-events:none 으로 두지 말 것(2026-09-05 안드로이드 실기 회귀). 과거를 보는 동안
       라이브 격자(#t)는 display:none 이라, 오버레이가 터치를 안 받으면 스와이프가 **아무 데도**
       닿지 않는다 → 과거로 들어간 뒤 더 올라갈 수도, 라이브로 돌아올 수도 없었다. */
    /* ⚠ 타이포그래피는 **폴백(.plain) 에만** 준다. 컨테이너에 font-size/line-height 를 걸면 자식
       xterm 의 span 이 그걸 상속해 일부 글리프가 위로 들뜬다(Android 실기 실측 — 숫자만 윗첨자처럼 보임). */
    #historyViewport.plain { color:${palette.foreground}; font-family:${fontFamilyCss};
      font-size:${fontPx}px; line-height:1.2; white-space:pre; }
    /* 오버레이 xterm 이 어떤 이유로든 배경을 안 칠해도 흰 화면이 되지 않게 한 겹 더 못 박는다. */
    #historyViewport .xterm, #historyViewport .xterm-screen { background:${palette.background} !important; }
    /* 과거를 보는 동안 라이브 격자는 숨긴다. xterm 캔버스는 글리프가 없는 칸이 투명이라, 겹쳐 두면
       아래 라이브 글자가 비쳐 "숫자만 위로 들뜬 것처럼" 보인다(Android 실기 실측). */
    /* ⚠ visibility:hidden 으로는 부족하다. Android WebView 는 WebGL 캔버스를 별도 하드웨어
       레이어로 합성해서 z-index 와 무관하게 위로 비친다 — 레이어째 없애야 한다. */
    body.hist-on #t { display:none; }
    /* v3 비소유자 뷰 — 소유자 격자를 축소/스크롤로 본다 */
    body.scaled #t { overflow:auto; }
    body.scaled #t .xterm { height:auto; }
    /* 소유자 알약은 **WebView 밖(RN 네이티브)**에서 그린다 — 여기서는 상태만 올린다.
       이유: PC 도 알약을 터미널 DOM 밖에 두고(styles.css .pane-owner-pill) 같은 문제가 없다 =
       플랫폼 간 한 벌. 앱 테마·글꼴을 그대로 쓰고, WebView 합성 레이어라는 변수도 사라진다.
       ※ 2026-09-06 "iPad 에 알약이 하나 더 겹쳐 보인다" 고 적었던 증상은 **실재하지 않았다**.
         전 해상도 픽셀 스캔(알약 배경 #1B1F2A 를 행별로 세기)으로 정지·콜드스타트 14프레임·
         가로/세로·서랍 열림/닫힘과 그날 남긴 스크린샷 전부를 훑었더니 알약은 언제나 정확히 1개.
         근원은 **축소된 스크린샷 눈대중**이었다 — 같은 이미지에서 없는 상태바까지 하나 더 봤다.
         교훈: 겹침·중복처럼 "픽셀로 세면 되는" 주장은 다운샘플 눈대중이 아니라 원본 스캔으로 확정한다. */
    #historyViewport .xterm-viewport, #historyViewport .xterm-scrollable-element { overflow:hidden !important; }
    /* 네이티브 롱프레스 텍스트선택/붙여넣기 메뉴 억제 — 우리 롱프레스 선택과 충돌. 입력은 helper
       textarea 가 별도로 처리하므로 캔버스/뷰포트의 네이티브 콜아웃만 끈다. */
    #t, .xterm, .xterm-viewport, .xterm-screen { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
    .xterm-viewport::-webkit-scrollbar { display:none; width:0; }
    /* 롱프레스 선택 조작 핸들 + 복사 바 — Android 네이티브 텍스트선택 핸들과 동일(물방울/teardrop).
       40px 요소=터치타깃, margin 으로 wrapper 중심을 tip(선택 경계점)에 정렬.
       ::after tip(뾰족 코너)이 wrapper 중심(20,20)에 오도록 배치 → JS 가 넘긴 좌표에 tip 이 붙는다. */
    .selh { position:absolute; width:40px; height:40px; margin-left:-20px; margin-top:-20px; z-index:99999; display:none; touch-action:none; -webkit-tap-highlight-color:transparent; }
    .selh::after { content:''; position:absolute; width:24px; height:24px; background:#4285F4; box-shadow:0 1px 3px rgba(0,0,0,0.4); }
    #selStart::after { left:-4px; top:20px; border-radius:50% 0 50% 50%; }   /* 시작: 우상단 뾰족(tip), 좌하로 물방울 */
    #selEnd::after   { left:20px; top:20px; border-radius:0 50% 50% 50%; }    /* 끝: 좌상단 뾰족(tip), 우하로 물방울 */
    #selbar { position:absolute; z-index:99999; transform:translateX(-50%); display:none; }
    #selbar button { font:600 13px -apple-system,system-ui,sans-serif; color:#E2E8F0; background:rgba(17,22,32,0.97); border:1px solid #2A2F3A; border-radius:9px; padding:8px 22px; box-shadow:0 2px 8px rgba(0,0,0,0.45); -webkit-tap-highlight-color:transparent; }
    #selbar button:active { background:#264F78; }
  </style>
</head>
<body>
  <div id="t"></div>
  <div id="historyViewport" aria-hidden="true"></div>
  <!-- 롱프레스 선택 조작: 모서리 핸들 2개(좌상=시작, 우하=끝) + 복사 바(선택 아래). 복사는 이 바 또는 특수키 ⌘C. -->
  <div id="selStart" class="selh"></div>
  <div id="selEnd" class="selh"></div>
  <div id="selbar"><button id="selcopy" type="button">복사</button></div>
  <script>
    var post = function(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} };
    /* 256색 66번 리맵(terminalSchemes.ts termExtendedAnsi 와 한 벌) — claude 가 COLORTERM 없던
       세션에서 선택색 #264F78 을 66(#5F8787 세이지)으로 강등해 칠한다. 희소 배열은 여기(웹뷰 안)서
       만든다: RN 브리지 JSON 은 희소 구멍을 null 로 바꿔 구버전 xterm 파서에 위험. */
    var remapTheme = function(p){ try { var a = []; a[50] = p.selectionBackground; p.extendedAnsi = a; } catch(e){} return p; };
    try {
      var term = new Terminal({
        // CJK 폴백 폰트 추가 — Menlo/Monaco 엔 한글 글리프가 없어 빈칸으로 렌더됨.
        //  iOS='Apple SD Gothic Neo', Android='Noto Sans (Mono) CJK KR' 로 폴백 → 한글 정상 표시.
        cursorBlink: false, fontSize: ${fontPx},
        // 'Nanum Gothic Coding'(한글+Latin 고정폭)을 스택에 유지 — xterm 은 primary 폰트로만 렌더(per-glyph 폴백 X)라
        //  Menlo 를 앞에 두면 한글이 빈칸이 된다. 코드 글꼴 설정(fontSetting)이 스택 맨 앞을 결정.
        fontFamily: "${fontFamilyCss}",
        // PC와 동일한 정본 범위. 기기마다 한도가 다르면 같은 tmux history를 받아도
        // 좁은 모바일 쪽이 먼저 앞부분을 버려 맨 위 내용이 달라진다.
        scrollback: 10000, convertEol: false,
        // 최소 대비 자동 보정 — 프롬프트(p10k 등)가 팔레트 밖 256색 배경을 써도 글자가 항상 읽히게.
        minimumContrastRatio: ${mcr},
        theme: remapTheme(${JSON.stringify(palette)})
      });
      var fit = new FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(document.getElementById('t'));
      /* normal shell clear(CSI 2 J)를 모든 기기에서 같은 의미로 만든다. xterm 기본 동작은 현재
         화면만 지워 로컬 scrollback이 기기마다 남으므로, normal buffer에서만 과거도 정리한다.
         alternate-screen TUI의 전체 재도장은 절대 건드리지 않는다. */
      try {
        term.parser.registerCsiHandler({ final:'J' }, function(params){
          if (params && params[0] === 2 && term.buffer && term.buffer.active && term.buffer.active.type === 'normal') {
            Promise.resolve().then(function(){ try { term.clear(); term.scrollToBottom(); } catch(e){} });
          }
          return false;
        });
      } catch(e){}
      // ── fit() 의 "마지막 열 잘림" 보정 (PC 와 같은 근본원인) ───────────────────────────────
      //  FitAddon 은 cols 를 (사용가능폭 - scrollBarWidth) / 셀폭 으로 구하는데, 그 scrollBarWidth 는
      //  **뷰포트가 만들어진 시점**(스크롤백이 없어 스크롤바도 없다)의 측정값이라 0 이다. 그 뒤 로그가
      //  쌓여 스크롤바가 생겨도 다시 계산되지 않으므로 cols×셀폭 이 실제 보이는 폭
      //  (.xterm-viewport clientWidth)을 정확히 스크롤바 폭만큼 넘고 **마지막 열이 스크롤바 아래로
      //  잘린다**. PC 실측: 컨테이너 1500px → cols=197, 내용 1490px, viewport clientWidth 1481px
      //  → 초과 9px = 스크롤바 폭.
      //  → fit 직후 **실측**해 넘치는 만큼 열/행을 줄인다. 초과가 0 이면 아무것도 하지 않는다
      //   (모바일은 스크롤바가 없거나 오버레이일 수 있다 — 그때 줄이면 이유 없이 화면이 좁아진다).
      //  내부 API(_core._renderService.dimensions.css.cell)는 방어적으로 읽고 없으면 보정을 건너뛴다
      //  (= 도입 전 동작 그대로. xterm 이 올라가 경로가 바뀌면 잘림만 남고 새 회귀는 생기지 않는다).
      var __cellCss = function(){
        try {
          var d = term._core && term._core._renderService && term._core._renderService.dimensions;
          var cell = d && d.css && d.css.cell;
          if (cell && cell.width > 0 && cell.height > 0) return { w: cell.width, h: cell.height };
        } catch(e){}
        return null;
      };
      // 실측 초과 픽셀 — 양수면 그만큼 화면 밖(스크롤바 아래)이라 보이지 않는다. 진단용으로도 노출.
      window.__term_overflow = function(){
        var el = document.querySelector('.xterm-viewport');
        var cell = __cellCss();
        if (!el || !cell) return null;
        var cw = el.clientWidth, chh = el.clientHeight;
        return {
          x: (cw > 0) ? Math.round((term.cols * cell.w - cw) * 100) / 100 : 0,
          y: (chh > 0) ? Math.round((term.rows * cell.h - chh) * 100) / 100 : 0,
          cols: term.cols, rows: term.rows, cellW: cell.w, cellH: cell.h, clientW: cw, clientH: chh
        };
      };
      // ⚠ 이 블록은 __fitNow 보다 **위**에 있어야 한다(2026-09-06 안드로이드 실기 회귀).
      //  스크립트 전체가 하나의 try 블록이라 함수 선언도 그 자리에 닿아야 값이 생긴다 —
      //  아래로 내려가 있으면 초기화 중 __fitNow() 가 부르는 __applyScale 이 undefined 라
      //  터미널이 통째로 "초기화 오류" 배너만 남는다.
      // ── v3(CPT3): 데몬 VT 정본 + 소유자 1명(codingpt_daemon/docs/terminal-v3-design.md) ──
      //  헤더 14B: 'CPT3' · ver · op · seq(u32 BE) · len(u32 BE). PC pane.js 와 같은 코덱.
      var __v3 = false, __v3Seq = 0, __v3Epoch = null, __grid = null, __owner = null, __isOwner = true, __ownerFree = true;
      var __readV3 = function(data){
        try {
          var b = new Uint8Array(data), v;
          if (b.length < 14 || b[0] !== 67 || b[1] !== 80 || b[2] !== 84 || b[3] !== 51 || b[4] !== 1) return null;
          v = new DataView(b.buffer, b.byteOffset, b.byteLength);
          var len = v.getUint32(10);
          if (b.length < 14 + len) return null;
          return { op:b[5], seq:v.getUint32(6), payload:b.subarray(14, 14 + len) };
        } catch(e){ return null; }
      };
      // 소유자 표시는 RN(네이티브)이 그린다 — 여기서는 상태만 올린다(위 <style> 주석 참조).
      //  같은 상태를 반복해 올리지 않도록 서명으로 눌러 둔다(브리지 왕복 절약).
      var __ownerPosted = '';
      var __syncOwnerUi = function(){
        var name = (__owner && (__owner.name || __owner.deviceId)) || '';
        var viewer = !__isOwner && !__ownerFree;
        var sig = viewer ? ('v:' + name) : 'o';
        if (sig === __ownerPosted) return;
        __ownerPosted = sig;
        post({ type:'owner', viewer: viewer, name: name });
      };
      // 비소유자: 소유자 격자를 폭에 맞춰 축소해 본다. 격자(cols/rows)는 절대 바꾸지 않는다.
      //
      // ⚠ CSS transform 으로 줄이지 말 것(2026-09-06 안드로이드 실기 회귀). Android WebView 는 WebGL
      //  캔버스를 별도 하드웨어 레이어로 합성해 조상의 transform 배율을 먹지 않는다 — iPad(WKWebView)는
      //  줄어드는데 안드로이드만 원래 크기로 그려져 오른쪽이 잘렸다. **글꼴 크기**를 줄이면 xterm 이
      //  실제로 작은 셀로 다시 그리므로 렌더러와 무관하고, 확대/축소된 비트맵이 아니라 또렷하다.
      var __baseFont = ${fontPx};   // 사용자 표시 배율이 반영된 기본 글꼴(소유자일 때 크기)
      var __applyScale = function(){
        var el = document.querySelector('#t .xterm');
        // 예전 transform 방식의 잔재가 남아 있으면 지운다(구버전에서 올라온 화면).
        if (el) { el.style.transform=''; el.style.transformOrigin=''; el.style.width=''; el.style.height=''; }
        var viewer = !__isOwner && !__ownerFree && !!__grid;
        // 세로로 넘치면 스크롤로 본다(폭은 글꼴로 맞추지만 행 수까지 맞추면 글자가 너무 작아진다).
        document.body.classList.toggle('scaled', viewer);
        var want = __baseFont;
        if (viewer) {
          var host = document.getElementById('t');
          var cell = __cellCss();
          if (host && cell) {
            var availW = Math.max(1, (host.clientWidth || window.innerWidth) - 12);
            var cur = term.options.fontSize || __baseFont;
            var perPx = cell.w / cur;            // 글꼴 1px 당 셀 폭 — 이 비율로 필요한 글꼴을 역산
            if (perPx > 0) {
              var fit = (availW / __grid.cols) / perPx;
              want = Math.max(4, Math.min(__baseFont, Math.floor(fit * 2) / 2));   // 0.5px 단위
            }
          }
        }
        var now = term.options.fontSize || __baseFont;
        if (Math.abs(want - now) < 0.25) return;   // 수렴 — 재적용 루프 방지
        try {
          term.options.fontSize = want;
          if (__grid && !__isOwner && !__ownerFree) term.resize(__grid.cols, __grid.rows);
        } catch(e){}
      };

      // 넘치는 만큼만 줄인다(늘리지 않는다 — 늘리는 것은 fit 의 일이다). 바뀌었으면 true.
      //  상한 2회 = 열을 줄여 스크롤바가 사라지는 경우까지만 수렴시킨다(무한 그라인딩 금지).
      var __trimOverflow = function(){
        var changed = false;
        for (var i = 0; i < 2; i++) {
          var o = null; try { o = window.__term_overflow(); } catch(e){}
          if (!o) break;                                    // 내부 API 부재 = 보정 스킵
          var cell = __cellCss(); if (!cell) break;
          var cols = term.cols, rows = term.rows;
          if (o.x > 0.5) cols = Math.max(2, cols - Math.ceil(o.x / cell.w));
          if (o.y > 0.5) rows = Math.max(1, rows - Math.ceil(o.y / cell.h));
          if (cols === term.cols && rows === term.rows) break;   // 초과 0 → 아무것도 하지 않는다
          try { term.resize(cols, rows); } catch(e){ break; }
          changed = true;
        }
        return changed;
      };
      // 이후 모든 fit 경로는 이 함수를 쓴다(초기화·웹폰트 로드·회전/키보드 resize·__term_fit·배율 변경).
      var __fitNow = function(){
        // ★ 과거 보기 중엔 절대 fit 하지 않는다(2026-09-05 실기 실측). 그때 라이브 격자는
        //   body.hist-on #t{display:none} 이라 부모 크기가 0 이고, FitAddon 은 그럴 때 자기
        //   최소값(MINIMUM_COLS=2, MINIMUM_ROWS=1)을 돌려준다. 그 값이 그대로 서버로 나가면
        //   **공유 tmux window 가 2x1 로 접혀** 모든 기기의 터미널이 무너진다(실측: win=2x1).
        if (__histOn) return;
        if (__v3 && __grid && !__isOwner && !__ownerFree) {
          if (term.cols !== __grid.cols || term.rows !== __grid.rows) { try { term.resize(__grid.cols, __grid.rows); } catch(e){} }
          __applyScale();
          return;
        }
        try { fit.fit(); } catch(e){}
        __trimOverflow();
        __applyScale();
      };
      __fitNow();
      // 소프트 키보드/보조키 패널은 WebView 높이만 줄였다가 되돌린다. 이때 xterm+PTY의 rows까지
      // 왕복시키면 셸이 SIGWINCH로 프롬프트를 재도장하고, tmux 정본 화면 자체에 큰 빈 영역과
      // 중복 프롬프트가 생긴다. 폭이 같은 높이 변화는 격자를 유지하고 화면 레이어만 위로 당겨
      // 실제 커서가 키패드 위에 보이게 한다. 회전/분할/폰트 변경(폭 또는 셀 크기 변화)은 기존 fit.
      var __viewportW = window.innerWidth, __viewportH = window.innerHeight;
      var __keyboardShift = 0;
      var __keyboardViewportActive = false;
      var __setKeyboardShift = function(px){
        __keyboardShift = Math.max(0, px | 0);
        var surface = term && term.element;
        if (surface) surface.style.transform = __keyboardShift ? ('translateY(-' + __keyboardShift + 'px)') : '';
      };
      var __fitViewport = function(force){
        var w = window.innerWidth, h = window.innerHeight;
        var sameWidth = Math.abs(w - __viewportW) < 2;
        if (!force && sameWidth && h < __viewportH - 40) {
          __keyboardViewportActive = true;
          // Codex/Claude는 커서 아래에도 상태줄·도움말을 그린다. cursorY만 기준으로 올리면 입력줄은
          // 보이지만 그 아래 마지막 행들이 보조키 바 뒤에 잘린다. 키보드가 열린 동안은 격자 전체의
          // 최하단을 WebView 가시 영역 위에 맞춰 입력줄과 푸터를 모두 보이게 한다.
          var cell = __cellCss();
          var need = cell ? Math.max(0, term.rows * cell.h - Math.max(1, h - 12)) : 0;
          __setKeyboardShift(need);
          return false;
        }
        if (!force && sameWidth && __keyboardShift && h >= __viewportH - 2) {
          __keyboardViewportActive = false;
          __setKeyboardShift(0);
          return false;
        }
        if (!force && sameWidth && __keyboardViewportActive && h >= __viewportH - 2) {
          __keyboardViewportActive = false;
          __setKeyboardShift(0);
          return false;
        }
        __keyboardViewportActive = false;
        __setKeyboardShift(0);
        __viewportW = w; __viewportH = h;
        __fitNow();
        return true;
      };
      // ★ 왜 "스크롤바 등장" 을 따로 감시하지 않는가(ResizeObserver 를 두지 않은 이유) — 실측 근거:
      //  PC 의 잘림은 "fit 시점엔 스크롤바가 없어 0 으로 계산되고 그 뒤 생긴 스크롤바가 폭을 먹는다" 였다.
      //  이 WebView 는 위 <style> 에서 '.xterm-viewport::-webkit-scrollbar { width: 8px }' 를 주고 xterm.css
      //  가 'overflow-y: scroll' 이라 **거터가 처음부터 예약된다** — 헤드리스 Chromium(=Android WebView 엔진)
      //  실측: 빈 화면/로그 300줄 모두 viewport clientWidth 880 고정, xterm 이 측정한 scrollBarWidth 8,
      //  overflowPx −5 → 잘림 자체가 발생하지 않는다. iOS WKWebView 는 ::-webkit-scrollbar 를 무시하는
      //  오버레이 스크롤바라 거터가 0 이고, 그때 xterm 은 측정값 0 을 기본값 15 로 대체해 **오히려 조금
      //  좁게** 잡는다(잘림 아님). 즉 모바일에서 초과는 음수이고 위 trim 은 no-op 이다(하네스로 확인).
      //  그래서 사건 감시 없이 fit 경로에만 보정을 얹는다 — 프레임 콜백에 기대는 감시기를 넣으면 검증도
      //  못 하고(헤드리스는 프레임을 만들지 않아 RO/rAF 가 배달되지 않는다) resize 폭발 위험만 늘어난다.
      // GPU 렌더러 활성. 컨텍스트 유실/미지원이면 xterm 6의 DOM 렌더러로 안전하게 복귀한다.
      try {
        var __gl = new WebglAddon.WebglAddon();
        __gl.onContextLoss(function(){ try { __gl.dispose(); } catch(e){} console.log('[term] renderer=dom'); });
        term.loadAddon(__gl);
        console.log('[term] renderer=webgl');
      } catch(e) { console.log('[term] renderer=dom'); }
      // 웹폰트(Nanum Gothic Coding) 로드 완료 후 재렌더 — 로드 전엔 한글이 빈칸으로 그려지므로.
      try {
        if (document.fonts && document.fonts.load) {
          document.fonts.load("13px 'Nanum Gothic Coding'").catch(function(){});
          document.fonts.ready.then(function(){ try {
            // xterm 은 open() 시점의 폰트로 글자폭을 캐시한다. 웹폰트가 그 뒤 로드되면
            //  fontFamily 를 재할당해 강제 재측정시켜야 웹폰트로 다시 그려진다.
            term.options.fontFamily = 'monospace';
            term.options.fontFamily = "${fontFamilyCss}";
            __fitNow(); term.refresh(0, term.rows - 1);
          } catch(e){} });
        }
      } catch(e){}
      // 소프트 키보드 예측/자동수정 끄기(가능한 키보드 한정).
      var __ta = document.querySelector('.xterm-helper-textarea');
      if (__ta) {
        __ta.setAttribute('autocorrect', 'off');
        __ta.setAttribute('autocapitalize', 'off');
        __ta.setAttribute('autocomplete', 'off');
        __ta.setAttribute('spellcheck', 'false');
        __ta.setAttribute('enterkeyhint', 'send');
        // 포커스 즉시 RN 통지 → 보조바를 keyboardDidShow(느림) 전에 미리 노출.
        __ta.addEventListener('focus', function(){ __padOn = true; if (typeof __applyPad === 'function') __applyPad(); post({ type:'focus', focused:true }); });
        // xterm 은 blur 시 textarea.value 를 비운다 — 미러(__sentBuf)도 함께 비워야
        //  복귀 후 첫 입력의 델타가 "옛 텍스트 길이만큼 백스페이스"를 쏘지 않는다.
        __ta.addEventListener('blur', function(){ __padOn = false; try { __commitComp(); __resetBuf(); } catch(e){} post({ type:'focus', focused:false }); });
      }
      term.focus();
      // 터미널 내부 터치 = "이 기기서 작업" 신호 — 이미 포커스된 상태면 focus 이벤트가 다시 안 떠서
      //  크기 회수(select)가 안 나가므로, 터치 자체를 RN 에 통지(1.2s 스로틀로 브리지/RPC 폭주 방지).
      var __lastTouch = 0;
      document.addEventListener('touchstart', function(){
        var n = Date.now();
        if (n - __lastTouch > 1200) { __lastTouch = n; post({ type:'interact' }); }
      }, true);
      // OSC 알림(iTerm 9 / 777 notify;title;body / 99) + 벨 → RN 으로 통지(인앱 알림 패널·배지).
      try {
        term.parser.registerOscHandler(9, function(d){ post({ type:'notify', title:'', body:String(d) }); return true; });
        term.parser.registerOscHandler(777, function(d){ var p=String(d).split(';'); if(p[0]==='notify') post({ type:'notify', title:p[1]||'', body:p.slice(2).join(';') }); return true; });
        term.parser.registerOscHandler(99, function(d){ post({ type:'notify', title:'', body:String(d).replace(/^.*?;/,'') }); return true; });
        if (term.onBell) term.onBell(function(){ post({ type:'notify', title:'', body:'알림' }); });
      } catch(e){}
      // 앱의 마우스 트래킹(스크롤 캡처) 모드 추적 — claude 같은 alt-screen TUI 는 대화 스크롤을
      //  "마우스 휠"로 받는다(모드 1000/1002/1003 DECSET). 모드가 켜졌는지 알아야 터치 스와이프를
      //  휠로 변환할지(TUI) 네이티브 스크롤백 스크롤에 맡길지(일반 셸) 구분한다. registerCsiHandler 는
      //  false 를 반환해 xterm 기본 처리도 그대로 태운다(모드 자체는 xterm 이 적용).
      var __mouseOn = false, __sgrMouse = false, __pixelMouse = false;
      try {
        term.parser.registerCsiHandler({ prefix:'?', final:'h' }, function(params){
          for (var i=0;i<params.length;i++){ var p=params[i]; if(p===9||p===1000||p===1002||p===1003) __mouseOn=true; if(p===1006){__sgrMouse=true;__pixelMouse=false;} if(p===1016){__pixelMouse=true;__sgrMouse=false;} }
          return false;
        });
        term.parser.registerCsiHandler({ prefix:'?', final:'l' }, function(params){
          for (var i=0;i<params.length;i++){ var p=params[i]; if(p===9||p===1000||p===1002||p===1003) __mouseOn=false; if(p===1006) __sgrMouse=false; if(p===1016) __pixelMouse=false; }
          return false;
        });
      } catch(e){}
      // 마우스 모드 활성 여부 — xterm 5.3 의 term.modes 우선, 없으면 위 플래그 폴백.
      var __mouseActive = function(){
        // 일부 Android WebView/xterm 조합은 DECSET 핸들러는 보면서 term.modes 를 한 프레임 늦게
        // 갱신한다. 공개값 'none' 을 즉시 반환하면 그 순간 Codex 휠을 일반 alt-scroll 로 오판한다.
        if (__mouseOn) return true;
        try { if (term.modes && typeof term.modes.mouseTrackingMode === 'string') return term.modes.mouseTrackingMode !== 'none'; } catch(e){}
        return __mouseOn;
      };
      // Codex 는 alternate screen 을 쓰면서도 마우스 추적(1000/1002/1003)을 켜지 않는 경우가 있다.
      // 데스크톱 xterm 은 실제 wheel 을 alternate-scroll 방향키로 바꿔 주지만 Android/iOS 의 touch
      // 스크롤은 wheel 이벤트가 아니어서 그대로 두면 아무 일도 일어나지 않는다. 따라서 alt buffer 도
      // TUI 스와이프 대상으로 본다. normal buffer 는 제외해 셸의 로컬 scrollback 동작을 보존한다.
      var __alternateActive = function(){
        try { return !!(term.buffer && term.buffer.active && term.buffer.active.type === 'alternate'); } catch(e){}
        return false;
      };
      var enc = new TextEncoder();
      var WS_URL = null;   /* RN 이 __term_connect(url) 로 넣는다 — 그 전엔 연결 시도 없음 */
      var ws = null;
      var __keepalive = null, __reconnTimer = null, __retryDelay = 1000, __firstConn = true, __healthyTimer = null;
      var __v2Seq = 0, __v2Snapshot = false, __v2Desynced = false, __v2HistoryBootstrap = false, __v2SnapshotChunks = [], __canonicalModel = false;
      var __setGrid = function(cols, rows){
        var c = Math.max(2, cols|0), r = Math.max(2, rows|0);
        __grid = { cols:c, rows:r };
        if (term.cols !== c || term.rows !== r) { try { term.resize(c, r); } catch(e){} }
        __lastSentC = c; __lastSentR = r;
        __applyScale();
      };
      var __setOwner = function(m){
        __owner = m.owner || null; __isOwner = !!m.self || !!m.free; __ownerFree = !!m.free;
        __syncOwnerUi(); __applyScale();
        if (__isOwner) { try { __fitNow(); queueResize(); } catch(e){} }
      };
      var __claimOwnership = function(){
        try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type:'claim' })); } catch(e){}
        __isOwner = true; __syncOwnerUi(); __applyScale();
        try { __fitNow(); sendResize(); } catch(e){}
      };
      window.__term_claim = function(){ try { __claimOwnership(); } catch(e){} };
      var __applyV3 = function(f, done){
        __v3 = true; __canonicalModel = true;
        if (f.op === 1) {
          if (__v3Seq && f.seq !== __v3Seq + 1 && f.seq > __v3Seq) { try { ws.send(JSON.stringify({ type:'hello', lastSeq: __v3Seq, epoch: __v3Epoch })); } catch(e){} }
          if (f.seq > __v3Seq) { __v3Seq = f.seq; term.write(f.payload, done); }
          return;
        }
        var m = null; try { m = JSON.parse(new TextDecoder().decode(f.payload)); } catch(e){ m = null; }
        if (!m) return;
        if (f.op === 2) {          // SNAPSHOT — 소유자 격자 + 입력 모드 + 화면
          __v3Seq = Number(m.seq) || 0;
          // 세대 — 데몬이 재시작하면 seq 가 0 부터 다시 센다. 같이 보내야 이어받기 오판(=화면 정지)이 없다.
          __v3Epoch = m.epoch || null;
          __resetHistoryCache();
          __setOwner(m); __setGrid(m.cols, m.rows);
          try { term.reset(); } catch(e){}
          var md = m.modes || {}, pre = '';
          if (md.altScreen) pre += '\\x1b[?1049h';
          if (md.appCursor) pre += '\\x1b[?1h';
          if (md.bracketedPaste) pre += '\\x1b[?2004h';
          if (md.mouseTracking) pre += '\\x1b[?1000h\\x1b[?1006h';
          term.write(pre + (m.ansi || ''), function(){ try { term.refresh(0, term.rows-1); __applyScale(); } catch(e){} });
          return;
        }
        if (f.op === 3) { __setGrid(m.cols, m.rows); return; }
        if (f.op === 4) { __setOwner(m); return; }
        if (f.op === 5) { __ingestHistoryPage(m); return; }
        if (f.op === 6) { __v3Seq = 0; try { term.write('\\r\\n\\x1b[90m[세션 종료]\\x1b[0m\\r\\n'); } catch(e){} post({ type:'exit', code: m.code }); return; }
        if (f.op === 7) { try { term.write('\\r\\n\\x1b[31m' + String(m.message||'error') + '\\x1b[0m\\r\\n'); } catch(e){} }
      };
      var __readV2 = function(data){
        try {
          var b = new Uint8Array(data), v;
          if (b.length < 16 || b[0] !== 67 || b[1] !== 80 || b[2] !== 84 || b[3] !== 50 || b[4] !== 1) return null;
          v = new DataView(b.buffer, b.byteOffset, b.byteLength);
          var len = v.getUint32(12, true);
          if (b.length !== 16 + len) return null;
          return { op:b[5], seq:v.getUint32(8, true), payload:b.slice(16) };
        } catch(e){ return null; }
      };
      var __applyV2 = function(f, done){
        if (f.op === 2) {
          __v2Seq = f.seq; __v2Snapshot = true; __v2Desynced = false;
          __v2SnapshotChunks=[];
          __resetHistoryCache();
          try { var sm=JSON.parse(new TextDecoder().decode(f.payload)); __v2HistoryBootstrap=!!sm.historyBootstrap; __canonicalModel=!!(sm.canonicalModel||sm.serverHistory); } catch(e){ __v2HistoryBootstrap=false; __canonicalModel=false; }
          try { term.scrollToBottom(); } catch(e){}
          return;
        }
        if (__v2Desynced) return;
        if (__v2Seq && f.seq !== __v2Seq + 1) {
          __v2Desynced = true;
          try {
            if (ws && ws.readyState === 1) {
              // alternate TUI는 capture-pane 텍스트로 복원하면 모드가 깨진다. 재attach snapshot을 받는다.
              if (__alternateActive()) ws.close(4001, 'seq-gap');
              else ws.send(JSON.stringify({ type:'sync', sinceSeq:__v2Seq }));
            }
          } catch(e){}
          post({ type:'termdbg', kind:'seq-gap', expected:__v2Seq + 1, got:f.seq });
          return;
        }
        __v2Seq = f.seq;
        if (f.op === 3 && __v2Snapshot) { __v2SnapshotChunks.push(f.payload); return; }
        if (f.op === 1) { term.write(f.payload, done); return; }
        if (f.op === 4) {
          var chunks=__v2SnapshotChunks; __v2SnapshotChunks=[]; __v2Snapshot=false;
          if (__v2HistoryBootstrap && chunks.length) {
            term.write(chunks.shift());
            term.write('\\r\\n'.repeat(Math.max(1,term.rows))+'\\x1b[H\\x1b[2J');
          }
          __v2HistoryBootstrap=false;
          for(var ci=0;ci<chunks.length;ci++) term.write(chunks[ci]);
          try { if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'history',before:null,limit:200})); } catch(e){}
          __refreshModes(true);
          try { term.refresh(0, term.rows - 1); } catch(e){} return;
        }
        if (f.op === 5) return; // RESIZED — 서버가 이 기기 크기를 확정했다는 통지(클라 동작 없음)
        if (f.op === 6) {
          try {
            var md=JSON.parse(new TextDecoder().decode(f.payload));
            if(md && md.kind==='modes'){ __srvModes=md; __srvModesAt=Date.now(); }
          } catch(e){}
          return;
        }
        if (f.op === 7) {
          try { __ingestHistoryPage(JSON.parse(new TextDecoder().decode(f.payload))); }
          catch(e){ post({type:'termdbg',kind:'history-decode',message:String(e)}); }
          return;
        }
      };
      var __lastSentC = 0, __lastSentR = 0, __rzTimer = null;
      // 퇴화 크기(= 격자가 숨겨졌을 때 FitAddon 이 주는 최소값)는 **절대 보내지 않는다**.
      //  이 값은 공유 tmux window 를 통째로 접어 다른 기기까지 망가뜨린다 — 되돌릴 방법도 없다.
      var __sane = function(){ return term.cols >= 8 && term.rows >= 3; };
      // v3: 크기는 소유자만 주장한다 — 비소유자는 소유자 격자를 축소해 볼 뿐 resize 를 보내지 않는다.
      var sendResize = function(){ if (__v3 && !__isOwner && !__ownerFree) return; try { if (ws && ws.readyState === 1 && __sane()) { __lastSentC = term.cols; __lastSentR = term.rows; ws.send(JSON.stringify({ type:'resize', cols: term.cols, rows: term.rows })); } } catch(e){} };
      // fit 기반 리사이즈 전송은 400ms 디바운스 + 동일 크기 스킵 — 웹뷰 간 포커스 이동으로 소프트
      //  키보드가 잠깐 내려갔다 올라오면 grow→shrink 가 연달아 오는데, 크기 변경마다 셸이(SIGWINCH)
      //  프롬프트를 새 줄에 다시 찍어 스크롤백에 쌓였다(실측: 높이 플립 10회 = 프롬프트 12줄).
      //  정착된 크기가 직전 전송과 같으면 아예 보내지 않는다. 로컬 fit(화면 맞춤)은 즉시라 시각 지연 없음.
      var queueResize = function(){
        if (__rzTimer) clearTimeout(__rzTimer);
        __rzTimer = setTimeout(function(){
          __rzTimer = null;
          if (term.cols === __lastSentC && term.rows === __lastSentR) return;
          sendResize();
        }, 400);
      };
      var connect = function(){
        if (!WS_URL) return;
        try { ws = new WebSocket(WS_URL); } catch(e){ return; }
        ws.binaryType = 'arraybuffer';
        var __openAt = Date.now();
        ws.onopen = function(){
          __openAt = Date.now();
          post({ type:'wsopen' });
          var wasReconnect = !__firstConn;
          __firstConn = false;
          // 백오프/재연결 표시는 back 릴레이 소켓이 "열린 것"만으로 리셋하지 않는다 — 데몬쪽 pty attach
          //  가 실패하면(can't find session 등) 소켓은 열렸다가 곧 닫히는데, onopen 에서 리셋하면
          //  백오프가 매번 1초로 되돌아가 무한 1초 재연결 루프가 되고 [재연결됨] 스팸이 찍힌다.
          //  "3초 이상 살아남음 = 진짜 건강함" 일 때만 백오프 리셋 + [재연결됨] 표시(wshealthy).
          if (__healthyTimer) clearTimeout(__healthyTimer);
          __healthyTimer = setTimeout(function(){
            __healthyTimer = null;
            __retryDelay = 1000;
            post({ type:'wshealthy' });
            if (wasReconnect) { try { term.write('\\r\\n\\x1b[90m[재연결됨]\\x1b[0m\\r\\n'); } catch(e){} }
          }, 3000);
          if (__v3Seq > 0) { try { ws.send(JSON.stringify({ type:'hello', lastSeq: __v3Seq, epoch: __v3Epoch })); } catch(e){} }
          sendResize();
          // Keepalive — resize 를 재사용하면 서로 다른 크기의 PC/iPad/Android 가 25초마다
          // window-size latest 소유권을 빼앗는다. 그때마다 SIGWINCH/TUI 재도장이 tmux history 로
          // 밀려 기기별 로컬 scrollback 이 달라진다. 화면 크기와 무관한 명시적 no-op 프레임만 보낸다.
          if (__keepalive) clearInterval(__keepalive);
          __keepalive = setInterval(function(){ if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type:'keepalive' })); post({ type:'ka' }); } }, 25000);
        };
        ws.onmessage = function(e){ try {
          var done = function(){ if (__keyboardViewportActive) __fitViewport(false); };
          if (typeof e.data === 'string') term.write(e.data, done);
          else {
            var f3 = __readV3(e.data);
            if (f3) { __applyV3(f3, done); return; }
            var f = __readV2(e.data);
            if (f) __applyV2(f, done); else term.write(new Uint8Array(e.data), done);
          }
        } catch(err){} };
        ws.onclose = function(ev){
          if (this !== ws) return; /* __term_connect(새 URL)로 교체된 구 소켓 — 재연결 루프 금지 */
          post({ type:'wsclose', code: ev && ev.code, reason: (ev && ev.reason) || '', clean: !!(ev && ev.wasClean), aliveMs: Date.now() - __openAt });
          if (__healthyTimer) { clearTimeout(__healthyTimer); __healthyTimer = null; }
          if (__keepalive) { clearInterval(__keepalive); __keepalive = null; }
          // 자동 재연결 — 같은 토큰(TTL 1h) 으로 재접속해 "세션 종료" 없이 유지. (새 셸이라 cwd 는 프로젝트 루트로)
          //  즉시 실패(3초 미만 생존 = 서버측 스폰 실패 등)가 반복되면 백오프 상한을 30초로 올려
          //  재접속 폭주가 데몬 자원(pty)을 갉아먹지 않게 한다.
          if (__reconnTimer) clearTimeout(__reconnTimer);
          __reconnTimer = setTimeout(connect, __retryDelay);
          var __cap = (Date.now() - __openAt < 3000) ? 30000 : 10000;
          __retryDelay = Math.min(__retryDelay * 2, __cap);
        };
        ws.onerror = function(){ if (this !== ws) return; post({ type:'wserror' }); try { ws.close(); } catch(e){} };
      };
      /* 연결 시작/토큰 교체 — RN 주입 전용. 같은 URL 재호출은 죽어 있을 때만 재연결. */
      window.__term_connect = function(url){
        try {
          if (!url) return;
          if (url === WS_URL) { if (!ws || ws.readyState > 1) connect(); return; }
          WS_URL = url;
          __retryDelay = 1000;
          if (__reconnTimer) { clearTimeout(__reconnTimer); __reconnTimer = null; }
          if (ws && ws.readyState <= 1) { var __old = ws; ws = null; try { __old.close(); } catch(e){} }
          connect();
        } catch(e){}
      };
      // 사용자가 이 기기에서 입력하는 순간에는 로컬 xterm도 반드시 실제 셸 커서가 있는 맨 아래를
      // 보여야 한다. 스크롤백을 보던 상태로 stdin만 보내면 공유 PTY에는 정상 입력돼 PC에는 보이지만,
      // 입력한 모바일은 과거 viewport에 머물러 "내 글자가 안 찍힌" 것처럼 보인다.
      var send = function(s){ try {
        term.scrollToBottom();
        if (ws && ws.readyState === 1) { ws.send(enc.encode(String(s))); }
      } catch(e){} };
      // === 입력을 우리가 단독 처리(xterm 기본 전송은 전부 차단) — 모바일 IME 중복/충돌 방지 ===
      //  document 캡처 단계에서 가로채 stopImmediatePropagation 으로 xterm 의 textarea 핸들러를 막는다.
      //  (캡처는 target(텍스트영역)보다 먼저 실행 → xterm 이 같은 키/입력을 또 보내는 중복을 원천 차단)
      //  · 특수키(Enter/Tab/방향키/Backspace/Ctrl-x): keydown 에서 시퀀스 직접 전송 + preventDefault
      //  · 텍스트(조합 포함): input 의 증가분(delta)만 즉시 전송 → 예측 입력 켜둬도 한 글자씩 실시간
      //  · 조합 중 백스페이스/자동수정(앞글자 변경): 공통 접두사 이후를 \\x7f 로 지우고 새 꼬리 전송
      var __sentBuf = '';
      // 실물키보드 특수키 패널: ctrl 잠금 상태 — OS 키보드로 친 글자를 제어바이트로 변환.
      //  meta(⌘)는 터미널 제어키가 아니므로 무시(⌘ 잠근 채 터미널 오면 입력이 다 컨트롤문자로 바뀌는 버그 방지).
      var __vmods = { ctrl:false, meta:false };
      window.__term_setVmods = function(m){ __vmods = { ctrl: !!(m && m.ctrl), meta: !!(m && m.meta) }; };
      // 복사/붙여넣기 — 터미널 레벨 동작(셸로 보내지 않음). ⌘C=선택 복사, ⌘V=클립보드 붙여넣기, ⌘A=전체선택.
      var __doCopy = function(){ try { var t = term.getSelection(); if (t) post({ type:'clipboard', text: t }); } catch(e){} };
      var __doPaste = function(){ post({ type:'paste-request' }); };   // RN 이 네이티브 클립보드 읽어 __term_paste 로 주입
      var __doSelectAll = function(){ try { term.selectAll(); } catch(e){} };
      // RN → 붙여넣기: bracketed paste 모드면 마커로 감싸 앱(claude 등)이 리터럴로 받게(자동실행 방지).
      window.__term_paste = function(s){ try { var txt = String(s == null ? '' : s); if (!txt) return; var bp = false; try { bp = !!(term.modes && term.modes.bracketedPasteMode); } catch(e){} send(bp ? ('\\x1b[200~' + txt + '\\x1b[201~') : txt); } catch(e){} };
      window.__term_focus = function(){ try { term.focus(); } catch(e){} };
      window.__term_blur = function(){ try { if (__ta && __ta.blur) __ta.blur(); if (term.blur) term.blur(); } catch(e){} };
      // 현재 입력 라인 추정(명령 감지용) — Enter 시 onCommand 로 보고, 백스페이스/Ctrl-C 로 보정.
      var __line = '';
      // iOS 백스페이스 연속삭제: iOS 소프트 키보드는 "지울 내용이 있을 때만" 백스페이스 keydown 을
      //  반복 발화한다(빈 필드면 1회 후 홀드가 저절로 풀림 — 실측 확인). 그래서 포커스 중엔 helper
      //  textarea 를 항상 패딩(마침표들)해 두고, 백스페이스 keydown 마다 셸에 \x7f 를 보낸다.
      //  네이티브가 패딩을 지우며 반복을 이어가고, 패딩이 줄면 다시 채운다(항상 지울 게 있게).
      var __isIOSpad = /iP(ad|hone|od)/.test(navigator.userAgent);
      var IOS_PAD = ''; for (var __pp = 0; __pp < 24; __pp++) IOS_PAD += '.';
      var __padOn = false;   // iOS 포커스 중 = 패딩 유지
      var __composing = false;
      var __applyPad = function(){ if (!(__isIOSpad && __padOn) || !__ta) return; try { __ta.value = IOS_PAD; __ta.setSelectionRange(IOS_PAD.length, IOS_PAD.length); } catch(e){} __sentBuf = IOS_PAD; };
      var __topUpPad = function(){ if (!(__isIOSpad && __padOn) || !__ta) return; if (((__ta.value||'').length) < 10) __applyPad(); };
      var __resetBuf = function(){
        if (__isIOSpad && __padOn) { __applyPad(); return; } // iOS 포커스 시 빈 필드 대신 패딩 유지
        __sentBuf = ''; if (__ta) { try { __ta.value = ''; } catch(e){} }
      };
      // 셋업 시점에 이미 포커스돼 있으면(term.focus) 지금 패딩 — 포커스 핸들러 실행 땐 __applyPad 미정의였음.
      if (__isIOSpad && __ta && (document.activeElement === __ta || __padOn)) { __padOn = true; __applyPad(); }
      var SEQ = {
        'Enter':'\\r', 'Tab':'\\t', 'Backspace':'\\x7f', 'Escape':'\\x1b', 'Delete':'\\x1b[3~',
        'ArrowUp':'\\x1b[A', 'ArrowDown':'\\x1b[B', 'ArrowRight':'\\x1b[C', 'ArrowLeft':'\\x1b[D',
        'Home':'\\x1b[H', 'End':'\\x1b[F'
      };
      var __isTermTarget = function(t){ return !__ta || t === __ta || t === document.body || t === document; };
      // iOS(WKWebView)는 일반 ASCII 글자를 칠 때 helper textarea 에 'input' 이벤트를 안 냄(keydown 만 옴)
      //  → 아래 input 델타 로직이 안 돌아 글자가 전송 안 됨. iOS 는 keydown 에서 직접 보낸다.
      //  (한글 등 조합 문자는 keydown key 가 non-ASCII 로 오고 iOS 가 input insertText/deleteContentBackward
      //   로 조합을 처리하므로 여기서 보내지 않고 그대로 input 핸들러에 맡긴다.)
      var __isIOS = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // ── 한글 조합기(자모 → 음절) ──
      //  iOS(실물/맥 키보드)는 한글 자모를 조합 없이 낱자(keydown)로 흘려보내 'ㄱㅏㄴㅏㄷㅏ' 처럼 찍힌다.
      //  표준 2벌식 오토마타로 음절('가나다')을 조합한다. 조합 중 음절은 백스페이스-치환으로 갱신.
      var HG = (function(){
        var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
        var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
        var JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
        var choI={}, jungI={}, jongI={};
        for (var a=0;a<CHO.length;a++) choI[CHO.charAt(a)]=a;
        for (var b=0;b<JUNG.length;b++) jungI[JUNG.charAt(b)]=b;
        for (var c=0;c<JONG.length;c++) if (JONG[c]) jongI[JONG[c]]=c;
        var vowel = { '8,0':9,'8,1':10,'8,20':11,'13,4':14,'13,5':15,'13,20':16,'18,20':19 }; // 겹모음
        var jcomb = { '1,ㅅ':3,'4,ㅈ':5,'4,ㅎ':6,'8,ㄱ':9,'8,ㅁ':10,'8,ㅂ':11,'8,ㅅ':12,'8,ㅌ':13,'8,ㅍ':14,'8,ㅎ':15,'17,ㅅ':18 }; // 겹받침 합치기
        var jsplit = { '3':['ㄱ','ㅅ'],'5':['ㄴ','ㅈ'],'6':['ㄴ','ㅎ'],'9':['ㄹ','ㄱ'],'10':['ㄹ','ㅁ'],'11':['ㄹ','ㅂ'],'12':['ㄹ','ㅅ'],'13':['ㄹ','ㅌ'],'14':['ㄹ','ㅍ'],'15':['ㄹ','ㅎ'],'18':['ㅂ','ㅅ'] }; // 겹받침 쪼개기
        var cho=-1, jung=-1, jong=0;
        function cur(){
          if (cho>=0 && jung>=0) return String.fromCharCode(0xAC00 + (cho*21+jung)*28 + jong);
          if (cho>=0) return CHO.charAt(cho);
          if (jung>=0) return JUNG.charAt(jung);
          return '';
        }
        function reset(){ cho=-1; jung=-1; jong=0; }
        function isJamo(ch){ return choI[ch]!==undefined || jungI[ch]!==undefined; }
        function feed(ch){
          var flush='';
          if (jungI[ch]!==undefined){                    // 모음
            var v=jungI[ch];
            if (cho>=0 && jung<0 && jong===0){ jung=v; }
            else if (cho>=0 && jung>=0 && jong===0){
              var cm=vowel[jung+','+v];
              if (cm!==undefined){ jung=cm; } else { flush=cur(); cho=-1; jung=v; jong=0; }
            }
            else if (cho>=0 && jung>=0 && jong!==0){       // 받침이 다음 초성으로 이동
              var sp=jsplit[String(jong)], movedCh, rem;
              if (sp){ rem=jongI[sp[0]]; movedCh=sp[1]; } else { rem=0; movedCh=JONG[jong]; }
              jong=rem; flush=cur();
              cho=choI[movedCh]; jung=v; jong=0;
            }
            else if (jung>=0){
              var cm2=vowel[jung+','+v];
              if (cm2!==undefined){ jung=cm2; } else { flush=cur(); cho=-1; jung=v; jong=0; }
            }
            else { jung=v; }
          }
          else if (choI[ch]!==undefined){                // 자음
            var cc2=choI[ch], jg=jongI[ch];
            if (cho<0 && jung<0){ cho=cc2; }
            else if (cho>=0 && jung<0){ flush=cur(); cho=cc2; jung=-1; jong=0; }
            else if (cho>=0 && jung>=0 && jong===0){
              if (jg!==undefined){ jong=jg; } else { flush=cur(); cho=cc2; jung=-1; jong=0; }
            }
            else if (cho>=0 && jung>=0 && jong!==0){
              var jc=jcomb[jong+','+ch];
              if (jc!==undefined){ jong=jc; } else { flush=cur(); cho=cc2; jung=-1; jong=0; }
            }
            else if (cho<0 && jung>=0){ flush=cur(); cho=cc2; jung=-1; jong=0; }
            else { cho=cc2; }
          }
          return { flush: flush, marked: cur() };
        }
        return { feed:feed, reset:reset, isJamo:isJamo };
      })();
      // 현재 화면에 떠 있는(지울 수 있는) 조합 음절.
      var __compMarked = '';
      function __eraseMarked(){ for (var q=0;q<__compMarked.length;q++){ send('\\x7f'); } if (__compMarked){ __line=__line.slice(0, Math.max(0, __line.length - __compMarked.length)); } }
      function __applyComp(res){ __eraseMarked(); var out=res.flush+res.marked; if (out){ send(out); __line+=out; } __compMarked=res.marked; }
      function __commitComp(){ HG.reset(); __compMarked=''; }   // 조합 확정(화면 유지, 상태만 리셋)

      document.addEventListener('keydown', function(e){
        if (!__isTermTarget(e.target)) return;
        // iOS 플레인 백스페이스(패딩 유지 중): keydown 마다 \x7f 전송(연속삭제). preventDefault 는 안 해
        //  네이티브가 패딩을 지우며 keydown 반복을 이어가게 하고, 패딩이 줄면 보충한다. xterm 중복은
        //  stopImmediatePropagation 으로 차단. (모디파이어 조합 백스페이스는 아래 seq/termSeqFor 로.)
        if (__isIOSpad && __padOn && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          __commitComp(); send('\\x7f'); __line = __line.slice(0, -1); __topUpPad();
          e.stopImmediatePropagation(); return;
        }
        // ⌘(meta) + 글자 → 터미널 명령(복사/붙여넣기/전체선택) — 셸로 안 보냄(실물 키보드).
        if (e.metaKey && !e.ctrlKey && e.key && e.key.length === 1) {
          var mk = e.key.toLowerCase();
          if (mk === 'c') { __doCopy(); e.preventDefault(); e.stopImmediatePropagation(); return; }
          if (mk === 'v') { __doPaste(); e.preventDefault(); e.stopImmediatePropagation(); return; }
          if (mk === 'a') { __doSelectAll(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        // ⌘ + 그 밖의 키 → **앱 단축키 표에 걸려 있을 때만** 앱으로. 표에 없으면 아래로 흘려보낸다.
        //  복사·붙여넣기·전체선택(위)이 표보다 먼저인 건 의도다 — 터미널 안에서 ⌘C 는 복사여야 한다.
        if (typeof window.__cptAppKey === 'function') {
          var __ak = window.__cptAppKey(e);
          if (__ak) { post({ type:'appKey', combo: __ak }); e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        // Ctrl + 글자 → 제어문자(Ctrl-C=\x03 등)
        if (e.ctrlKey && e.key && e.key.length === 1) {
          var cc = e.key.toLowerCase().charCodeAt(0);
          if (cc >= 97 && cc <= 122) { __commitComp(); send(String.fromCharCode(cc - 96)); __resetBuf(); __line = ''; e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        var seq = SEQ[e.key];
        if (e.key === 'Tab' && e.shiftKey) seq = '\\x1b[Z';   // 역탭(CSI Z) — Claude Code 모드 전환 등
        if (seq) {
          __commitComp();
          send(seq); __resetBuf();
          if (e.key === 'Enter') { var __c = __line.trim(); __line = ''; if (__c) post({ type:'command', line: __c }); }
          else if (e.key === 'Backspace') { __line = __line.slice(0, -1); }
          e.preventDefault(); e.stopImmediatePropagation(); return;
        }
        // iOS: input 이벤트가 안 오는 인쇄가능 글자는 여기서 직접 처리.
        //  · 한글 자모 → 조합기(HG)로 음절 조합
        //  · ASCII·완성형 한글·기타 non-ASCII → 조합 확정 후 그대로 전송
        //  조합 중(isComposing)·조합키(keyCode 229)는 제외 → 소프트 키보드 조합은 아래 input 이 처리.
        if (__isIOS && !e.isComposing && e.keyCode !== 229 && e.key && e.key.length === 1) {
          if (HG.isJamo(e.key)) { __applyComp(HG.feed(e.key)); e.preventDefault(); e.stopImmediatePropagation(); return; }
          var kc0 = e.key.charCodeAt(0);
          if (kc0 >= 0x20 && kc0 !== 0x7f) { __commitComp(); send(e.key); __line += e.key; __resetBuf(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        // 일반 글자 keydown 은 안드로이드에서 keyCode 229(조합) 로만 오므로 무시 — 아래 input 이 처리.
      }, true);
      document.addEventListener('input', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();                 // xterm 이 같은 입력을 또 보내지 못하게
        // iOS: 백스페이스는 keydown 에서 이미 처리(패딩이 네이티브로 지워지며 발생하는 input 은 무시+재패딩).
        //  조합(dictation 등) 중에는 정상 델타 경로로(패딩은 안정 접두사라 공통 prefix 로 자연 스킵).
        if (__isIOSpad && __padOn && !__composing && !__vmods.meta && !__vmods.ctrl) { __applyPad(); return; }
        var v = (__ta && __ta.value) || '';
        if (v === __sentBuf) return;
        var i = 0, n = Math.min(v.length, __sentBuf.length);
        while (i < n && v.charAt(i) === __sentBuf.charAt(i)) i++;
        var __tail = v.slice(i);
        // 패널에서 ⌘(meta) 를 잠근 뒤 OS 키보드로 글자 1개 → 터미널 명령. c=복사 v=붙여넣기 a=전체선택.
        //  그 외 ⌘+글자는 글자 미입력(⌘는 명령 모디파이어). 처리 후 once 모디파이어 해제 통지.
        if (__vmods.meta && __tail.length === 1) {
          var __mk = __tail.toLowerCase();
          if (__mk === 'c') __doCopy(); else if (__mk === 'v') __doPaste(); else if (__mk === 'a') __doSelectAll();
          else if (typeof window.__cptAppKey === 'function') {
            // 특수키 패널로 ⌘ 를 잠그고 글자를 친 경우 — 하드웨어 키보드와 같은 표를 쓴다.
            //  (예전엔 c/v/a 가 아니면 아무 일도 안 일어났다.)
            var __vk = window.__cptAppKey({ key: __tail, metaKey: true });
            if (__vk) post({ type:'appKey', combo: __vk });
          }
          __resetBuf(); post({ type:'vmodConsume' }); return;
        }
        // 패널에서 ctrl 을 잠근 뒤 OS 키보드로 글자 1개를 치면 → 제어바이트(Ctrl-C=\x03 등)로 변환.
        if (__vmods.ctrl && __tail.length === 1) {
          var __cc = __tail.toLowerCase().charCodeAt(0);
          if (__cc >= 97 && __cc <= 122) { send(String.fromCharCode(__cc - 96)); __resetBuf(); __line = ''; post({ type:'vmodConsume' }); return; }
        }
        for (var k = __sentBuf.length; k > i; k--) { send('\\x7f'); __line = __line.slice(0, -1); } // 바뀐/지운 뒷부분 제거
        if (v.length > i) { send(v.slice(i)); __line += v.slice(i); }                               // 새로 추가된 꼬리 전송
        __sentBuf = v;
      }, true);
      document.addEventListener('compositionend', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();
        __composing = false;
        __resetBuf();                                 // 단어 확정 후 버퍼 리셋(다음 입력은 새로 시작)
      }, true);
      document.addEventListener('compositionstart', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();
        __composing = true;
      }, true);
      // 스크롤 처리(2모드):
      //  · 일반 셸 = xterm 네이티브 터치 스크롤(스크롤백은 메인 버퍼에 쌓임) — 아무것도 안 함.
      //  · TUI(claude 등, 마우스 트래킹 ON) = alt-screen 이라 xterm 스크롤백이 비어 네이티브 스크롤이
      //    무의미하다. 앱은 대화 스크롤을 "마우스 휠"로 받으므로, 터치 스와이프를 휠 SGR(1006)로 변환해
      //    전송한다. 예전엔 이걸 무조건 주입해 copy-mode/경계 누수가 났으므로 __mouseActive() 로 게이팅.
      //    자연 방향: 손가락 아래로(dy>0) = 이전 대화(위, 휠 up=btn64), 위로 = 최신(아래, 휠 down=btn65).
      // 터치 → 셀 좌표(마우스 SGR 리포트용). 뷰포트 기준이 아니라 term.element 기준 상대좌표로
      //  환산해야(#t 패딩·오프셋 보정) 클릭이 정확한 셀에 떨어진다("Jump to bottom" 같은 1줄 타깃).
      var __cell = function(x, y){
        var r = (term.element && term.element.getBoundingClientRect) ? term.element.getBoundingClientRect() : { left:0, top:0, width:0, height:0 };
        var cw = (term.cols && r.width) ? (r.width / term.cols) : 8;
        var ch = (term.rows && r.height) ? (r.height / term.rows) : 16;
        return {
          col: Math.max(1, Math.min(term.cols || 80, Math.ceil(((x - r.left) || 1) / (cw || 8)))),
          row: Math.max(1, Math.min(term.rows || 24, Math.ceil(((y - r.top) || 1) / (ch || 16))))
        };
      };
      var __repeat = function(s,n){ var out=''; for(var i=0;i<Math.min(32,Math.abs(n));i++) out+=s; return out; };
      var __arrowScroll = function(lines){
        var app=false;
        if(__srvModes && (Date.now()-__srvModesAt)<MODES_TTL) app=!!__srvModes.appCursor;
        else { try { app=!!(term.modes&&term.modes.applicationCursorKeysMode); } catch(e){} }
        return '\\x1b'+(app?'O':'[')+(lines<0?'A':'B');
      };
      var __wheelScroll = function(lines,x,y){
        var c=__cell(x,y), code=lines<0?64:65;
        if (__pixelMouse) return '\\x1b[<'+code+';'+Math.max(0,Math.floor(x))+';'+Math.max(0,Math.floor(y))+'M';
        if (__sgrMouse) return '\\x1b[<'+code+';'+c.col+';'+c.row+'M';
        var b=code+32, col=c.col+32, row=c.row+32;
        if (b>126||col>126||row>126) return '';
        return '\\x1b[M'+String.fromCharCode(b)+String.fromCharCode(col)+String.fromCharCode(row);
      };
      // canonical normal-buffer history는 서버 절대 offset을 사용한다. 이 viewport는 기기 로컬이라
      // Android가 과거를 읽어도 PC/iPad의 포커스·스크롤 위치를 움직이지 않는다.
      // ── 서버 canonical history 뷰어 ────────────────────────────────────────────
      //  설계: 과거 행들을 **오버레이 xterm 에 한 번만 써 넣고**, 그다음부터는 그 xterm 자신의
      //  스크롤(scrollLines)로 움직인다. 스크롤 스텝마다 페이지를 다시 그리던 예전 방식은
      //  Android WebView 의 부분 무효화 때문에 바뀐 글자만 이전 글리프 위에 덧그려졌다
      //  (실기 실측: 바뀐 숫자만 다른 폰트로 겹쳐 보임). 다시 쓰는 일은 더 오래된 페이지를
      //  받아올 때만 일어난다.
      var __histEl=document.getElementById('historyViewport');
      var __histRows=new Map(), __histTotal=0, __histPending=false, __histTerm=null;
      var __histLoadedFrom=Infinity;   // 받아 둔 가장 오래된 offset. 0 은 "맨 앞까지 다 받았다"라 센티넬로 못 쓴다
      var __histOn=false;        // 오버레이가 떠 있는가
      var __histWritten=-1;      // 지금 오버레이에 써 넣은 history 총량(재작성 판단용)
      var __histWantScroll=0;    // 첫 페이지를 기다리는 동안 쌓인 스크롤량
      var __histFailed=false;

      // ⚠ 반드시 **보이는 상태에서** open 한다. display:none 인 요소에 open 하면 xterm 이
      //   글자 크기를 0 으로 재서 빈(흰) 화면이 된다(2026-09-04 Android 실기 실측).
      //   WebGL 은 쓰지 않는다 — 라이브 격자와 달리 여기는 통째 재작성이 섞여 잔상에 취약하다.
      var __histView=function(){
        if(__histTerm||__histFailed) return __histTerm;
        try {
          __histTerm=new Terminal({
            cursorBlink:false, disableStdin:true,
            fontSize:${fontPx}, fontFamily:"${fontFamilyCss}", convertEol:false,
            scrollback:10000, minimumContrastRatio:${mcr},
            theme:remapTheme(${JSON.stringify(palette)}),
            cols:Math.max(2,term.cols), rows:Math.max(2,term.rows)
          });
          __histTerm.open(__histEl);
          if(!__histEl.querySelector('.xterm-rows')) throw new Error('history xterm did not mount');
        } catch(e){
          // 어떤 이유로든 실패하면 흰 화면 대신 평문으로 떨어뜨린다 — 과거를 못 보는 것보다 낫다.
          __histFailed=true; __histTerm=null;
          try { __histEl.innerHTML=''; } catch(_e){}
          post({type:'error',message:'history view fallback: '+String(e&&e.message||e)});
        }
        return __histTerm;
      };
      var __requestHistory=function(before){
        if(__histPending) return; __histPending=true;
        try { if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'history',before:before,limit:500})); } catch(e){ __histPending=false; }
      };
      // 지금 갖고 있는 구간([__histLoadedFrom, __histTotal))만 만든다. 아직 안 받은 더 오래된 구간을
      //  빈 줄로 메우면 사용자가 수백 줄의 공백을 긁어 올리게 된다(2026-09-05 안드로이드 실기).
      var __histLines=function(){
        var out=[];
        var from = isFinite(__histLoadedFrom) ? __histLoadedFrom : __histTotal;
        for(var i=from;i<__histTotal;i++){
          var row=__histRows.get(i);
          // ansi 가 없는 구 데몬과 섞여 돌 수 있다 — 그 경우만 평문으로 폴백.
          out.push(row ? (typeof row.ansi==='string'?row.ansi:String(row.text||'').replace(/\\s+$/,'')) : '');
        }
        return { lines: out, missingBefore: -1 };
      };
      var __showHistory=function(){
        if(__histOn) return true;
        __histEl.style.display='block';          // ★ open 전에 먼저 보이게(위 주석 참조)
        document.body.classList.add('hist-on');
        __histOn=true;
        return true;
      };
      var __hideHistory=function(){
        if(!__histOn) return;
        __histOn=false;
        __histEl.style.display='none';
        document.body.classList.remove('hist-on');
        // display:none 에서 돌아온 라이브 격자는 한 번 다시 그려 줘야 빈 화면으로 남지 않는다.
        try { term.refresh(0, term.rows-1); } catch(e){}
        // 과거 보기 동안 건너뛴 fit 을 여기서 한 번 따라잡는다(회전·키보드 변화가 있었을 수 있다).
        try { __fitNow(); } catch(e){}
      };
      // 오버레이에 전체 history 를 새로 써 넣는다(진입 시 1회 + 더 오래된 페이지를 받았을 때).
      var __writeHistory=function(keepFromBottom){
        var v=__histView();
        var data=__histLines();
        if(!v){
          __histEl.classList.add('plain');
          __histEl.textContent=data.lines.map(function(l){ return String(l).replace(/\\x1b\\[[0-9;]*m/g,''); }).join('\\n');
          __histWritten=__histTotal;
          return;
        }
        if(v.cols!==term.cols||v.rows!==term.rows){ try{ v.resize(Math.max(2,term.cols),Math.max(2,term.rows)); }catch(e){} }
        try{ v.reset(); }catch(e){}
        v.write('\\x1b[H'+data.lines.join('\\r\\n'), function(){
          try {
            v.scrollToBottom();
            if(keepFromBottom>0) v.scrollLines(-keepFromBottom);
            v.refresh(0, v.rows-1);
          } catch(e){}
        });
        __histWritten=__histTotal;
        if(data.missingBefore>=0) __requestHistory(data.missingBefore+1);
      };
      var __histFromBottom=function(v){
        try { var b=v.buffer.active; return Math.max(0, Number(b.baseY)-Number(b.viewportY)); } catch(e){ return 0; }
      };
      var __canonicalScroll=function(lines){
        var n=Number(lines)||0; if(!n) return;
        if(!__histOn){
          if(n>0) return;                       // 이미 라이브 화면 맨 아래
          // 진입은 **항상 새로 물어본다**. 캐시된 total 로 바로 열면 그새 clear 로 비워졌거나 더
          //  쌓인 과거를 낡은 상태로 보여 준다(PC 와 같은 규율).
          __histWantScroll+=n; __requestHistory(null); return;
        }
        var v=__histTerm;
        if(!v) return;                          // 평문 폴백은 스크롤 없이 전체를 보여 준다
        v.scrollLines(n);
        var b=v.buffer.active;
        // 맨 아래로 돌아왔으면 라이브 화면 복귀. 맨 위에 닿았고 더 있으면 더 받아온다.
        if(n>0 && Number(b.viewportY)>=Number(b.baseY)) { __hideHistory(); return; }
        if(n<0 && Number(b.viewportY)<=0 && __histLoadedFrom>0 && isFinite(__histLoadedFrom)) __requestHistory(__histLoadedFrom);
      };
      var __resetHistoryCache=function(){
        __histRows.clear(); __histTotal=0; __histLoadedFrom=Infinity; __histPending=false; __histWantScroll=0; __histWritten=-1;
        __hideHistory();
      };
      var __ingestHistoryPage=function(page){
        __histPending=false; if(!page) return;
        var total=Math.max(0,Number(page.total)||0);
        // 과거가 줄었다 = clear 됐거나 스크롤백 상한을 넘겨 오래된 줄이 버려졌다. 절대 offset 이
        //  통째로 밀리므로 캐시를 버린다(안 그러면 남의 줄을 내 offset 으로 그린다).
        if(total<__histTotal){ __histRows.clear(); __histLoadedFrom=Infinity; __histWritten=-1; }
        __histTotal=total;
        var rows=Array.isArray(page.rows)?page.rows:[];
        for(var i=0;i<rows.length;i++){ var r=rows[i]; if(r&&Number.isFinite(Number(r.offset))) __histRows.set(Number(r.offset),r); }
        if(rows.length) __histLoadedFrom=Math.min(__histLoadedFrom, Number(page.start)||0);
        // 페이지를 기다리며 쌓아 둔 스크롤을 이제 적용한다(맨 아래에서 그만큼 위로).
        if(!__histOn && __histWantScroll<0 && __histTotal){
          var want=-__histWantScroll; __histWantScroll=0;
          __showHistory(); __writeHistory(want);
          return;
        }
        // 이미 보고 있는 중에 더 오래된 페이지가 왔다 — 보던 위치를 유지한 채 다시 써 넣는다.
        if(__histOn && __histWritten!==__histTotal && __histTerm) __writeHistory(__histFromBottom(__histTerm));
      };

      // 스크롤을 어디로 보낼지는 **서버 VT 모드**가 정본이다. 클라이언트가 DECSET 을 엿보면
      //  (a) tmux 가 alternate-screen off 로 1049 를 안 보내 less/vim 을 일반 셸로 오판하고
      //  (b) term.modes 갱신이 한 프레임 늦어 Codex 휠을 놓친다.
      //  서버 응답이 아직 없거나 낡았으면 예전 로컬 추론으로 폴백한다(구 데몬 호환).
      var __srvModes=null, __srvModesAt=0, __modesReqAt=0;
      var MODES_TTL=1500;
      var __refreshModes=function(force){
        if (__v3) return;   // v3: 모드는 로컬 xterm 이 안다(원시 PTY 바이트가 그대로 온다)
        var now=Date.now();
        if(!force && now-__modesReqAt<300) return;
        __modesReqAt=now;
        try { if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'modes'})); } catch(e){}
      };
      var __routeScrollLines = function(lines,x,y){
        if (!lines) return;
        var fresh=__srvModes && (Date.now()-__srvModesAt)<MODES_TTL;
        if(!fresh) __refreshModes(false);
        var mouseOn = fresh ? !!__srvModes.mouseTracking : __mouseActive();
        var altOn   = fresh ? !!__srvModes.altScreen     : __alternateActive();
        if (mouseOn) { var mouse=__wheelScroll(lines,x,y); send(__repeat(mouse||__arrowScroll(lines),lines)); return; }
        if (altOn) { send(__repeat(__arrowScroll(lines),lines)); return; }
        // 서버가 과거를 줄 수 있으면(canonical VT 든 tmux 든) 그쪽이 정본이다 — 자기 스크롤백은
        //  tmux 재도장 잔재가 섞여 있어 기기마다 다른 "과거"를 보여 준다(2026-09-04 사용자 신고).
        if (__canonicalModel) { __canonicalScroll(lines); return; }
        __localScroll(lines);
      };
      var __sendClick = function(x, y){ var c = __cell(x, y); send('\\x1b[<0;' + c.col + ';' + c.row + 'M'); send('\\x1b[<0;' + c.col + ';' + c.row + 'm'); }; // btn0 press+release
      // ── 롱프레스 텍스트 선택(모드 무관, 문자 단위) ──────────────────────
      //  길게 누르면 선택 시작 → 드래그로 문자 단위 범위 조절 → 손 떼면 하이라이트 유지. 복사는 ⌘C.
      //  xterm 공개 API(select/selectLines)는 여러 줄 부분선택을 못 해 줄 단위가 된다 → PC 처럼 임의
      //  범위(문자 단위)를 얻으려고 xterm 네이티브 선택을 쓴다: shift+마우스 합성 이벤트를 주입하면
      //  마우스 트래킹(claude) 중에도 xterm 이 셀렉션으로 처리한다(shift = 마우스모드 우회 = PC 관례).
      var __hStart = document.getElementById('selStart');
      var __hEnd = document.getElementById('selEnd');
      var __selbar = document.getElementById('selbar');
      var __selcopy = document.getElementById('selcopy');
      var __selVisible = false;
      var __selecting = false;
      var __selMoveX = 0, __selMoveY = 0;   // 마지막 선택 이동 지점(손 뗄 때 mouseup 좌표)
      var __dragging = false;               // 단어선택 후 손가락을 끌어 확장 중인지
      var __scrEl = null;
      var __getScr = function(){ if (!__scrEl && term.element) __scrEl = term.element.querySelector('.xterm-screen') || term.element; return __scrEl; };
      var __mev = function(type, x, y, el, detail){   // shift+마우스 합성(button0). down=screen, move/up=document(xterm 이 down 시 document 리스너 부착). detail=2 면 더블클릭(단어선택).
        var ev; try { ev = new MouseEvent(type, { bubbles:true, cancelable:true, view:window, detail:(detail || 1), button:0, buttons:(type === 'mouseup' ? 0 : 1), clientX:x, clientY:y, screenX:x, screenY:y, shiftKey:true }); } catch(e){ return; }
        try { (el || document).dispatchEvent(ev); } catch(e){}
      };
      var __hasSel = function(){ try { return !!term.getSelection(); } catch(e){ return false; } };
      // ── IDE 식 선택 조작 UI: 모서리 핸들 2개 + 복사 바 ──────────────────
      //  버퍼 좌표(col, 절대행) → 화면 픽셀(셀 좌상단). viewportY 로 스크롤 보정.
      var __bufPx = function(col, bufY){
        var scr = __getScr(); if (!scr) return null;
        var r = scr.getBoundingClientRect();
        var cw = r.width / (term.cols || 80), ch = r.height / (term.rows || 24);
        var vy = 0; try { vy = term.buffer.active.viewportY; } catch(e){}
        var vrow = bufY - vy;
        return { x: r.left + col * cw, y: r.top + vrow * ch, cw: cw, ch: ch, vrow: vrow, rL: r.left, rR: r.right, rT: r.top, rB: r.bottom };
      };
      var __posH = function(el, x, y, vis){ if (!vis) { el.style.display = 'none'; return; } el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px'; };
      var __hideSelUI = function(){ __selVisible = false; __hStart.style.display = 'none'; __hEnd.style.display = 'none'; __selbar.style.display = 'none'; };
      // 선택 하이라이트에 맞춰 핸들(좌상=시작, 우하=끝) + 복사 바 재배치.
      var __updateHandles = function(){
        if (!__selVisible) return;
        var sp; try { sp = term.getSelectionPosition(); } catch(e){ sp = null; }
        if (!sp) { __hideSelUI(); return; }
        var a = __bufPx(sp.start.x, sp.start.y);
        var b = __bufPx(sp.end.x, sp.end.y);
        if (!a || !b) return;
        __posH(__hStart, a.x, a.y + a.ch, a.vrow >= 0 && a.vrow < term.rows);      // 시작 셀 좌하단(라인 아래로 매달림)
        __posH(__hEnd, b.x, b.y + b.ch, b.vrow >= 0 && b.vrow < term.rows);        // 끝 셀 우하단
        if (__dragH) { __selbar.style.display = 'none'; return; }                  // 드래그 중엔 바 숨김
        var midX = (a.x + b.x) / 2;
        midX = Math.max(a.rL + 44, Math.min(a.rR - 44, midX));
        var below = b.y + b.ch + 46;                                              // 아래로 매달린 핸들 물방울 아래
        var top = (below <= a.rB - 20) ? below : (a.y - 26);                       // 아래 공간 없으면 위로
        top = Math.max(a.rT + 20, top);
        __selbar.style.left = midX + 'px'; __selbar.style.top = top + 'px'; __selbar.style.display = 'block';
      };
      var __showSelUI = function(){ __selVisible = true; try { __selcopy.textContent = '복사'; } catch(e){} __updateHandles(); };
      var __clearSel = function(){ try { term.clearSelection(); } catch(e){} __hideSelUI(); __selecting = false; };
      // 선택 활성 중엔 새 출력/스크롤로 하이라이트가 밀려도 핸들이 따라붙게.
      try { if (term.onRender) term.onRender(function(){ if (__selVisible) __updateHandles(); }); } catch(e){}
      // ── 핸들 드래그로 범위 조절 ── 반대쪽 모서리를 앵커로 shift+마우스 재선택(문자 단위).
      var __dragH = null, __hLX = 0, __hLY = 0;
      var __hStartDrag = function(which){ return function(e){
        if (!e.touches || e.touches.length !== 1) return;
        e.preventDefault(); e.stopPropagation();
        var sp; try { sp = term.getSelectionPosition(); } catch(_){ sp = null; }
        if (!sp) return;
        __dragH = which; __selbar.style.display = 'none';
        var aCol, aRow;
        if (which === 'start') { aCol = Math.max(0, sp.end.x - 1); aRow = sp.end.y; }   // 앵커 = 끝(마지막 셀)
        else { aCol = sp.start.x; aRow = sp.start.y; }                                   // 앵커 = 시작(첫 셀)
        var ap = __bufPx(aCol, aRow); if (!ap) { __dragH = null; return; }
        try { term.clearSelection(); } catch(_){}
        __mev('mousedown', ap.x + ap.cw / 2, ap.y + ap.ch / 2, __getScr());
        var t = e.touches[0]; __hLX = t.clientX; __hLY = t.clientY;
        __mev('mousemove', __hLX, __hLY, document); __updateHandles();
      }; };
      var __hMoveDrag = function(e){
        if (!__dragH || !e.touches || e.touches.length !== 1) return;
        e.preventDefault(); e.stopPropagation();
        var t = e.touches[0]; __hLX = t.clientX; __hLY = t.clientY;
        __mev('mousemove', __hLX, __hLY, document); __updateHandles();
      };
      var __hEndDrag = function(e){
        if (!__dragH) return;
        e.preventDefault(); e.stopPropagation();
        __mev('mouseup', __hLX, __hLY, document); __dragH = null;
        if (__hasSel()) __updateHandles(); else __hideSelUI();
      };
      __hStart.addEventListener('touchstart', __hStartDrag('start'), { passive:false });
      __hEnd.addEventListener('touchstart', __hStartDrag('end'), { passive:false });
      __hStart.addEventListener('touchmove', __hMoveDrag, { passive:false });
      __hEnd.addEventListener('touchmove', __hMoveDrag, { passive:false });
      __hStart.addEventListener('touchend', __hEndDrag, { passive:false });
      __hEnd.addEventListener('touchend', __hEndDrag, { passive:false });
      __hStart.addEventListener('touchcancel', __hEndDrag, { passive:false });
      __hEnd.addEventListener('touchcancel', __hEndDrag, { passive:false });
      // 복사 바 — 선택 텍스트 복사 후 선택 해제(네이티브 동일: 복사하면 툴바+선택 사라짐).
      var __copyTap = function(e){ e.preventDefault(); e.stopPropagation(); __doCopy(); __clearSel(); };
      __selcopy.addEventListener('touchend', __copyTap, { passive:false });
      __selcopy.addEventListener('click', __copyTap);
      // 스와이프 = 휠. 성능: 매 touchmove 마다 즉시 휠을 쏘면 빠른 스와이프가 원격 claude 에 휠 폭주를
      //  일으켜(라운드트립마다 전체 재그리기) 버벅인다. rAF 로 프레임당 최대 MAXN notch 만 합쳐 전송.
      var WHEEL_STEP_PX = 20, WHEEL_MAX_PER_FRAME = 5, LONGPRESS_MS = 380, MOVE_TOL = 12;
      var __swActive = false, __swMoved = false, __swT0 = 0;
      var __swX0 = 0, __swY0 = 0, __swPrevY = 0, __swAcc = 0, __swLX = 0, __swLY = 0, __rafOn = false, __lpTimer = null;
      var __clearLp = function(){ if (__lpTimer) { clearTimeout(__lpTimer); __lpTimer = null; } };
      var __localScroll = function(lines){
        try {
          var n = Number(lines) || 0;
          if (!n) return;
          term.scrollLines(n);
        } catch(e){}
      };
      var __flushWheel = function(){
        __rafOn = false;
        var n = 0;
        while (Math.abs(__swAcc) >= WHEEL_STEP_PX && n < WHEEL_MAX_PER_FRAME) {
          var dir = __swAcc > 0 ? -1 : 1;                    // 손가락 아래로 = older(위)
          __routeScrollLines(dir, __swLX, __swLY);
          if (__swAcc > 0) __swAcc -= WHEEL_STEP_PX; else __swAcc += WHEEL_STEP_PX;
          n++;
        }
        if (Math.abs(__swAcc) >= WHEEL_STEP_PX * 8) __swAcc = 0; // 과한 잔량은 폐기(폭주 방지)
      };
      // 과거 오버레이 위의 스와이프 — 아래 __tEl 핸들러는 라이브 격자(#t)에만 걸리는데, 과거를
      //  보는 동안 그건 display:none 이라 한 번도 발화하지 않는다. 오버레이 자신이 받아야 한다.
      var __hSwY = 0, __hSwAcc = 0;
      __histEl.addEventListener('touchstart', function(e){
        if (!e.touches || e.touches.length !== 1) return;
        __hSwY = e.touches[0].clientY; __hSwAcc = 0;
      }, { passive:true });
      __histEl.addEventListener('touchmove', function(e){
        if (!e.touches || e.touches.length !== 1) return;
        var y = e.touches[0].clientY;
        __hSwAcc += (y - __hSwY); __hSwY = y;
        var n = 0;
        while (Math.abs(__hSwAcc) >= WHEEL_STEP_PX && n < WHEEL_MAX_PER_FRAME) {
          __canonicalScroll(__hSwAcc > 0 ? -1 : 1);          // 손가락 아래로 = 더 과거로
          if (__hSwAcc > 0) __hSwAcc -= WHEEL_STEP_PX; else __hSwAcc += WHEEL_STEP_PX;
          n++;
        }
        if (Math.abs(__hSwAcc) >= WHEEL_STEP_PX * 8) __hSwAcc = 0;
        try { e.preventDefault(); } catch(_e){}
      }, { passive:false });
      var __tEl = document.getElementById('t');
      // 네이티브 컨텍스트(붙여넣기) 메뉴 억제 — 롱프레스 선택과 충돌 방지.
      document.addEventListener('contextmenu', function(e){ try { e.preventDefault(); } catch(_){} }, false);
      // 우리 선택 제스처 중엔 Android 의 실제 터치→마우스 호환 이벤트(isTrusted, shift 없음)가 xterm 에
      //  닿아 선택을 지우는 걸 막는다(우리 합성 이벤트는 isTrusted=false 라 통과). 캡처 단계에서 선차단.
      ['mousedown','mouseup','click','dblclick','auxclick'].forEach(function(__t){
        document.addEventListener(__t, function(e){ if (e.isTrusted && (__swActive || __selecting || __selVisible)) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
      });
      __tEl.addEventListener('touchstart', function(e){
        if (!e.touches || e.touches.length !== 1) { __swActive = false; __clearLp(); return; }
        if (__hasSel()) __clearSel();                          // 선택 있으면 터치로 해제(PC 동일)
        var x = e.touches[0].clientX, y = e.touches[0].clientY;
        __swActive = true; __swMoved = false; __swT0 = Date.now();
        __refreshModes(false);   // 제스처 시작에 서버 모드를 미리 받아 첫 휠부터 올바로 라우팅
        __swX0 = __swLX = x; __swY0 = __swPrevY = __swLY = y; __swAcc = 0;
        __selecting = false;
        __clearLp();
        __lpTimer = setTimeout(function(){                     // 안 움직이고 유지 → 선택 시작
          __lpTimer = null;
          if (!__swActive || __swMoved) return;
          // helper textarea 를 blur — 포커스된 편집영역의 네이티브 '붙여넣기' 메뉴(롱프레스)가 뜨는 걸 막는다.
          //  (Android 롱프레스 임계 ~500ms 보다 먼저 380ms 에 blur → 메뉴 미출현. 이후 탭으로 재포커스)
          try { if (__ta && __ta.blur) __ta.blur(); } catch(e){}
          __selecting = true;
          try { term.clearSelection(); } catch(e){}
          // 네이티브 동일: 롱프레스 = 단어 선택. xterm 네이티브 더블클릭 워드선택을 합성(단어 경계는
          //  xterm 이 직접 계산 = 광폭/한글 안전). shift = 마우스모드(claude) 우회. 더블클릭을 mouseup 까지
          //  완결해 버튼을 떼야 단어 선택이 유지된다(버튼 누른 채 두면 xterm 자동스크롤이 선택을 지움).
          //  이어지는 드래그 확장은 touchmove 에서 shift+mousedown(기존 선택 확장) + 이동으로 처리.
          __mev('mousedown', __swLX, __swLY, __getScr(), 1);
          __mev('mouseup', __swLX, __swLY, document, 1);
          __mev('mousedown', __swLX, __swLY, __getScr(), 2);    // detail 2 = 더블클릭 → 단어 선택
          __mev('mouseup', __swLX, __swLY, document, 2);
          __dragging = false; __selMoveX = __swLX; __selMoveY = __swLY;
          __hideSelUI();                                        // 이전 핸들/바 정리(선택 확정은 손 뗄 때)
        }, LONGPRESS_MS);
      }, { capture:true, passive:false });

      __tEl.addEventListener('touchmove', function(e){
        if (!__swActive || !e.touches || e.touches.length !== 1) return;
        // touch-action:none의 구형 Android WebView 폴백. 처음 move부터 네이티브 pan을 막아야 이후
        // move가 touchcancel로 끊기지 않는다(임계값을 넘은 뒤 막으면 이미 늦다).
        e.preventDefault();
        var y = e.touches[0].clientY, x = e.touches[0].clientX;
        __swLX = x; __swLY = y;
        if (!__swMoved && (Math.abs(y - __swY0) > MOVE_TOL || Math.abs(x - __swX0) > MOVE_TOL)) __swMoved = true;
        if (__selecting) {                                     // 단어선택 후 손가락을 끌면 확장
          e.preventDefault();
          __selMoveX = x; __selMoveY = y;
          if (!__dragging) {                                   // 첫 이동: 단어 시작셀을 앵커로 새 마우스선택 개시(검증된 방식)
            __dragging = true;
            var __ax = x, __ay = y, __sp0 = null;
            try { __sp0 = term.getSelectionPosition(); } catch(e){}
            if (__sp0) { var __ap0 = __bufPx(__sp0.start.x, __sp0.start.y); if (__ap0) { __ax = __ap0.x + __ap0.cw * 0.3; __ay = __ap0.y + __ap0.ch / 2; } }
            try { term.clearSelection(); } catch(e){}
            __mev('mousedown', __ax, __ay, __getScr());
          }
          __mev('mousemove', x, y, document);
          return;
        }
        if (__swMoved) __clearLp();                            // 움직임 = 스크롤 → 롱프레스 취소
        __swAcc += (y - __swPrevY); __swPrevY = y;
        if (Math.abs(__swAcc) >= WHEEL_STEP_PX) {
          if (!__rafOn) { __rafOn = true; requestAnimationFrame(__flushWheel); }
        }
      }, { capture:true, passive:false });
      __tEl.addEventListener('touchend', function(){
        var was = __swActive; __swActive = false; __clearLp();
        if (__selecting) { __selecting = false; if (__dragging) __mev('mouseup', __selMoveX, __selMoveY, document); if (__hasSel()) __showSelUI(); else __hideSelUI(); return; }   // 선택 확정 → 핸들+복사 바
        // Android/iOS WebView는 키보드를 내린 뒤 textarea가 focused 상태만 유지할 수 있다.
        // 실제 사용자 탭에서 blur→focus를 다시 수행해야 IME가 재요청된다.
        if (was && !__swMoved) post({ type:'request-native-keyboard' });
        // 탭(이동 거의 없음 + 짧게) = claude 클릭 UI("Jump to bottom" 등) 실행 → 마우스 클릭 리포트.
        if (was && __mouseActive() && !__swMoved && (Date.now() - __swT0) <= 500) __sendClick(__swLX, __swLY);
      }, { capture:true, passive:false });
      __tEl.addEventListener('touchcancel', function(){ __swActive = false; __clearLp(); if (__selecting) { __selecting = false; if (__dragging) __mev('mouseup', __selMoveX, __selMoveY, document); if (__hasSel()) __showSelUI(); else __hideSelUI(); } }, { capture:true, passive:false });
      window.addEventListener("resize", function(){ try { if (__fitViewport(false)) queueResize(); } catch(e){} });
      // RN → WebView 브리지
      window.__term_send = function(s){ send(s); };
      window.__term_native_input = function(delCount, text){
        try {
          var out=''; for(var i=0;i<(Number(delCount)||0);i++) out+='\\x7f';
          out+=String(text||'').replace(/\\r?\\n/g,'\\r');
          if(out) send(out);
        } catch(e){}
      };
      // 삼성 Android WebView는 터미널 canvas의 touchmove를 네이티브 pan으로 선점할 수 있다.
      // RN responder가 포착해도 WebView touch와 같은 모드 라우터를 타야 Codex TUI와 셸이 갈리지 않는다.
      window.__term_routeScroll = function(lines){
        __routeScrollLines(Number(lines)||0, Math.max(1, window.innerWidth/2), Math.max(1, window.innerHeight/2));
      };
      window.__term_history_request = function(before,limit){
        try { if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'history',before:before,limit:limit||200})); } catch(e){}
      };
      window.__term_write = function(s){ try { term.write(String(s).replace(/\\r?\\n/g, '\\r\\n')); } catch(e){} };
      window.__term_clear = function(){ try { term.clear(); } catch(e){} };
      window.__term_fit = function(){ try { if (__fitViewport(false)) queueResize(); } catch(e){} };
      // 표시 배율(기기 로컬 설정) — 폰트 크기 변경 후 fit 재실행 → cols/rows 재계산 → 기존 경로로 리사이즈 전송.
      window.__term_setFontSize = function(px){ try {
        if (__baseFont === px) return;
        __baseFont = px;                       // 소유자 기준 글꼴 — 비소유자면 __applyScale 이 다시 줄인다
        if (!__isOwner && !__ownerFree && __grid) { __applyScale(); return; }
        if (term.options.fontSize !== px) { term.options.fontSize = px; __fitViewport(true); queueResize(); }
      } catch(e){} };
      // 터미널 스타일/테마 — 재마운트 없이 팔레트+최소대비 라이브 교체(스타일·앱 테마 변경 시 RN 이 주입).
      window.__term_setTheme = function(p, mcr){ try { term.options.theme = remapTheme(p); if (mcr) term.options.minimumContrastRatio = mcr; document.body.style.background = p.background || ''; term.refresh(0, term.rows - 1); } catch(e){} };
      post({ type:'ready' });
    } catch (e) {
      document.body.innerHTML = '<div style="color:#F87171;font-family:monospace;font-size:12px;padding:12px;">터미널 초기화 오류: ' + (e && e.message ? e.message : e) + '</div>';
      post({ type:'error', message: String(e && e.message ? e.message : e) });
    }
  </script>
</body>
</html>`;
};

const TerminalWebView = forwardRef<TerminalHandle, Props>(({ wsUrl, onReady, onCommand, onVmodConsume, onFocusChange, onNotify, onWsOpen, onWsDead, onWsHealthy, onInteract, onAppKey, onOwner }, ref) => {
  const webRef = useRef<WebView>(null);
  const nativeInputRef = useRef<TextInput>(null);
  const nativeValueRef = useRef('');
  const focusNativeInput = useCallback(() => {
    const input = nativeInputRef.current;
    if (!input) return;
    input.blur();
    setTimeout(() => nativeInputRef.current?.focus(), 30);
  }, []);
  const deadRef = useRef(0); // 즉시실패 재접속 연속 카운트(onWsDead 판정)
  // 기기별 표시 배율 — 폰트 크기(기본 13px)에 곱해 적용. 변경 시 remount 없이 injectJavaScript 로 즉시 반영.
  const displayScale = useDisplayScale();
  const fontPx = Math.max(8, Math.round(TERM_BASE_FONT * displayScale * 2) / 2);
  const fontPxRef = useRef(fontPx);
  fontPxRef.current = fontPx;
  // 테마(다크/라이트) — 전환은 앱 전체 리마운트(App.tsx key)라 마운트 시점 값으로 굽는다.
  const { resolvedScheme } = useTheme();
  const dark = resolvedScheme !== 'light';
  // 터미널 컬러 스킴 — 변경은 remount 없이 __term_setTheme 주입으로 라이브 반영.
  const scheme = useTermScheme();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  // 코드·터미널 글꼴 — @font-face 는 선택된 폰트만 굽는다(D2Coding 등 대용량) → 변경 시 재마운트.
  const codeFont = useCodeFont();
  // 글꼴이 바뀔 때만 WebView 재마운트. wsUrl 은 HTML 에 안 굽는다(토큰 재발급=__term_connect 주입,
  //  재마운트 없음). 배율/스킴/앱 테마도 주입으로 라이브 갱신.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(fontPxRef.current, termPalette(schemeRef.current, dark), termMinContrast(dark), codeFontFamilyCss(), codeFontFaceCss()), [codeFont]);
  // ── 연결 주입 — 웹뷰 ready 와 wsUrl 발급 중 늦게 오는 쪽이 쏜다(선마운트로 둘이 병렬로 진행됨) ──
  const readyRef = useRef(false);
  const wsUrlRef = useRef<string | null>(wsUrl);
  wsUrlRef.current = wsUrl;
  useEffect(() => {
    if (wsUrl && readyRef.current) {
      webRef.current?.injectJavaScript(`window.__term_connect && window.__term_connect(${JSON.stringify(wsUrl)}); true;`);
    }
  }, [wsUrl]);
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.__term_setFontSize && window.__term_setFontSize(${fontPx}); true;`);
  }, [fontPx]);
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.__term_setTheme && window.__term_setTheme(${JSON.stringify(termPalette(scheme, dark))}, ${termMinContrast(dark)}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, dark]);
  // 하드웨어 키보드 조합표 — 단축키를 바꾸면 즉시 반영된다. **HTML 에 넣지 않는다**(넣으면
  //  단축키를 하나 고칠 때마다 터미널이 재마운트되어 접속이 끊긴다).
  const binds = useShortcuts();
  const bindsRef = useRef(binds);
  bindsRef.current = binds;
  useEffect(() => {
    webRef.current?.injectJavaScript(webviewKeyTableJs(binds));
  }, [binds]);

  useImperativeHandle(ref, () => ({
    sendKey: (s: string) => { webRef.current?.injectJavaScript(`window.__term_send && window.__term_send(${JSON.stringify(s)}); true;`); },
    write: (text: string) => { webRef.current?.injectJavaScript(`window.__term_write && window.__term_write(${JSON.stringify(text)}); true;`); },
    clear: () => { webRef.current?.injectJavaScript('window.__term_clear && window.__term_clear(); true;'); },
    fit: () => { webRef.current?.injectJavaScript('window.__term_fit && window.__term_fit(); true;'); },
    setVmods: (flags) => { webRef.current?.injectJavaScript(`window.__term_setVmods && window.__term_setVmods(${JSON.stringify(flags || {})}); true;`); },
    focus: focusNativeInput,
    blur: () => { nativeInputRef.current?.blur(); webRef.current?.injectJavaScript('window.__term_blur && window.__term_blur(); true;'); },
    claim: () => { webRef.current?.injectJavaScript('window.__term_claim && window.__term_claim(); true;'); },
    paste: (text: string) => { webRef.current?.injectJavaScript(`window.__term_paste && window.__term_paste(${JSON.stringify(text)}); true;`); },
  }), [focusNativeInput]);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        // HTML 은 마운트 시점 배율/스킴으로 구워짐 — 그 사이 저장값 로드/변경이 있었을 수 있어 ready 때 재적용.
        //  키 판정기+조합표도 여기서 심는다(HTML 에 굽지 않는 이유는 위 useEffect 주석).
        readyRef.current = true;
        webRef.current?.injectJavaScript(`${WEBVIEW_KEY_JS} ${webviewKeyTableJs(bindsRef.current)} true;`);
        webRef.current?.injectJavaScript(`window.__term_setFontSize && window.__term_setFontSize(${fontPxRef.current}); window.__term_setTheme && window.__term_setTheme(${JSON.stringify(termPalette(schemeRef.current, dark))}, ${termMinContrast(dark)}); true;`);
        // 선마운트 중 발급이 먼저 끝났으면 여기서 연결(늦게 오는 쪽이 쏜다).
        if (wsUrlRef.current) {
          webRef.current?.injectJavaScript(`window.__term_connect && window.__term_connect(${JSON.stringify(wsUrlRef.current)}); true;`);
        }
        onReady?.();
      }
      else if (msg.type === 'command') onCommand?.(String(msg.line || ''));
      else if (msg.type === 'vmodConsume') onVmodConsume?.();
      else if (msg.type === 'appKey') onAppKey?.(String(msg.combo || ''));
      else if (msg.type === 'clipboard') { try { Clipboard.setString(String(msg.text ?? '')); } catch (_) { /* noop */ } }
      else if (msg.type === 'paste-request') {
        // ⌘V — 네이티브 클립보드를 읽어 WebView 로 주입(터미널 stdin 으로 전송). data: origin WebView 엔 클립보드 없음.
        try { Promise.resolve(Clipboard.getString()).then((text) => { webRef.current?.injectJavaScript(`window.__term_paste && window.__term_paste(${JSON.stringify(String(text || ''))}); true;`); }).catch(() => { /* noop */ }); } catch (_) { /* noop */ }
      }
      else if (msg.type === 'notify') onNotify?.(String(msg.title || ''), String(msg.body || ''));
      else if (msg.type === 'focus') onFocusChange?.(!!msg.focused);
      else if (msg.type === 'owner') onOwner?.({ viewer: !!msg.viewer, name: String(msg.name || '') });
      else if (msg.type === 'request-native-keyboard') focusNativeInput();
      else if (msg.type === 'interact') onInteract?.();
      else if (msg.type === 'error') console.warn('[Terminal]', msg.message);
      // 소켓 open 자체로는 죽음 카운터를 리셋하지 않는다 — pty attach 실패 시에도 back 릴레이 소켓은
      //  잠깐 열리므로, open 마다 리셋하면 deadRef 가 3까지 못 쌓여 onWsDead(토큰 재발급 복구)가 영영
      //  안 돈다. 리셋은 "3초 생존=건강" 신호(wshealthy)에서만.
      else if (msg.type === 'wsopen') { onWsOpen?.(); console.warn('[TermWS]', JSON.stringify(msg)); }
      else if (msg.type === 'wshealthy') { deadRef.current = 0; onWsHealthy?.(); console.warn('[TermWS]', JSON.stringify(msg)); }
      else if (msg.type === 'wsclose') {
        console.warn('[TermWS]', JSON.stringify(msg));
        // 즉시실패 연속 카운트 — 3회면 토큰이 죽은 것(만료/서버 재배포). 정상 수명 후 끊김은 리셋.
        if (typeof msg.aliveMs === 'number' && msg.aliveMs < 3000) {
          deadRef.current += 1;
          if (deadRef.current >= 3) { deadRef.current = 0; onWsDead?.(); }
        } else deadRef.current = 0;
      }
      else if (msg.type === 'wserror' || msg.type === 'ka' || msg.type === 'termdbg') console.warn('[TermWS]', JSON.stringify(msg));
    } catch (_) { /* noop */ }
  }, [onReady, onCommand, onVmodConsume, onFocusChange, onNotify, onWsOpen, onWsDead, onWsHealthy, onInteract, onAppKey, dark, focusNativeInput]);

  const onNativeText = useCallback((next: string) => {
    const prev = nativeValueRef.current;
    let i = 0;
    while (i < prev.length && i < next.length && prev[i] === next[i]) i++;
    const del = prev.length - i;
    const add = next.slice(i);
    nativeValueRef.current = next;
    webRef.current?.injectJavaScript(`window.__term_native_input && window.__term_native_input(${del}, ${JSON.stringify(add)}); true;`);
    if (next.length > 64) {
      nativeValueRef.current = '';
      nativeInputRef.current?.clear();
    }
  }, []);

  // 실물 손가락은 WebView 자식이 네이티브 pan recognizer로 소유하므로 부모 responder는
  // Android/iOS 모두 안정적으로 인계받지 못한다. 실제 WebView의 native touch 콜백에서 직접
  // 이동량을 읽어 HTML과 동일한 모드 라우터로 전달한다. 탭 자체는 막지 않아 키보드도 유지한다.
  const nativeScrollPrevY = useRef<number | null>(null);
  const nativeScrollRemainder = useRef(0);
  const nativeTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent?.touches?.[0];
    nativeScrollPrevY.current = typeof touch?.pageY === 'number' ? touch.pageY : null;
    nativeScrollRemainder.current = 0;
  }, []);
  const nativeTouchMove = useCallback((e: any) => {
      const touch = e.nativeEvent?.touches?.[0];
      const y = touch?.pageY;
      if (typeof y !== 'number' || nativeScrollPrevY.current == null) return;
      nativeScrollRemainder.current += y - nativeScrollPrevY.current;
      nativeScrollPrevY.current = y;
      const steps = Math.trunc(nativeScrollRemainder.current / 20);
      if (!steps) return;
      nativeScrollRemainder.current -= steps * 20;
      webRef.current?.injectJavaScript(
        `window.__term_routeScroll && window.__term_routeScroll(${-steps}); true;`,
      );
  }, []);
  const nativeTouchEnd = useCallback(() => {
    nativeScrollPrevY.current = null;
    nativeScrollRemainder.current = 0;
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        // baseUrl=android_asset → xterm/폰트를 APK 에서 로드(네트워크 0). iOS 는 CDN(ASSET_BASE null).
        source={{ html, baseUrl: ASSET_BASE ?? undefined }}
        allowFileAccess
        allowFileAccessFromFileURLs
        onMessage={onMessage}
        onTouchStart={nativeTouchStart}
        onTouchMove={nativeTouchMove}
        onTouchEnd={nativeTouchEnd}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        androidLayerType="hardware"
        overScrollMode="never"
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: v2.colors.base }}
      />
      <TextInput
        ref={nativeInputRef}
        defaultValue=""
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        multiline={false}
        // ★ Enter 를 눌러도 포커스를 놓지 않는다(2026-09-06 iPad 실기 회귀).
        //  단일행 TextInput 의 RN 기본값은 "제출하면 blur" 다. 터미널에서 그건 명령 한 줄마다 입력이
        //  죽는다는 뜻 — 소프트 키보드면 키보드가 내려가 눈에 보이기라도 하지만, **물리 키보드에선
        //  아무 표시 없이 그냥 키가 안 먹는다**(실측: echo AAA 는 실행, 이어 친 echo BBB 는 한 글자도
        //  도달 안 함). submit = onSubmitEditing 은 쏘고 포커스는 유지.
        submitBehavior="submit"
        onChangeText={onNativeText}
        onSubmitEditing={() => {
          webRef.current?.injectJavaScript("window.__term_native_input && window.__term_native_input(0, '\\r'); true;");
          nativeValueRef.current = '';
          nativeInputRef.current?.clear();
        }}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Backspace' && nativeValueRef.current.length === 0) {
            webRef.current?.injectJavaScript("window.__term_native_input && window.__term_native_input(1, ''); true;");
          }
        }}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        style={{ position: 'absolute', width: 1, height: 1, left: 1, bottom: 1, opacity: 0.01, padding: 0 }}
      />
    </View>
  );
});

TerminalWebView.displayName = 'TerminalWebView';
export default TerminalWebView;
