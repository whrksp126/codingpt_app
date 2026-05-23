import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Text, Pressable, Image, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Plus } from '../../assets/SvgIcon';
import { TerminalScanline } from '../effects/TerminalScanline';

// 터미널 스크립트 타입 정의
export interface TerminalScript {
  type: 'input' | 'output';
  text: string;
}

// 터미널 파일 타입 정의 (탭 구조용)
export interface TerminalFile {
  name: string;
  language: 'js' | 'py' | 'java';
  script: TerminalScript[];
  autoRun?: boolean;
  typingDelay?: number;
  showInput?: boolean; // true일 때만 input 코드 라인을 터미널에 표시 (기본값: false)
}

// 언어 로고 맵
const langLogoMap: Record<string, any> = {
  'py': require('../../assets/icons/python-icon.png'),
  'js': require('../../assets/icons/js-icon.png'),
  'java': require('../../assets/icons/java-icon.png'),
  // 기본 아이콘들
  'html': require('../../assets/icons/html-5-icon.png'),
  'css': require('../../assets/icons/css-3-icon.png'),
};

// 터미널 컴포넌트 Props
interface TerminalComponentProps {
  module: any;
  onLoadComplete?: () => void;
  isActive?: boolean;
}

const simpleModule = {
  height: 300,
  files: [
    {
      name: 'script.js',
      language: 'js',
      script: [
        { type: 'input', text: 'console.log("Hello, world!");' },
        { type: 'output', text: 'Hello, world!' }
      ],
    },
    {
      name: 'script.py',
      language: 'py',
      script: [
        { type: 'input', text: 'print("Hello, world!");' },
        { type: 'output', text: 'Hello, world!' }
      ],
    }
  ]
}

// HTML 템플릿 생성 함수
const generateTerminalHTML = (lang: 'js' | 'py' | 'java', script: TerminalScript[], autoRun: boolean, typingDelay: number, showInput: boolean = false) => {
  const scriptJson = JSON.stringify(script);

  // 읽기 전용 모드 CSS (showInput=false일 때 커서 숨기고 입력 차단)
  const readOnlyCSS = !showInput ? `
    #term { pointer-events: none; }
    .xterm-cursor { display: none !important; }
    .xterm-cursor-layer { display: none !important; }
  ` : '';

  return `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>xterm.js Terminal</title>
  <!-- 핀치 줌 차단 — user-scalable=no + maximum-scale=1.0 -->
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css" />
  <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <style>
    :root { color-scheme: dark; }
    html, body {
      height: 100%;
      margin: 0;
      background: #000;
      overflow: hidden;
      /* 한 손가락 수직 스크롤만 허용 — 핀치/더블탭 줌 차단 */
      touch-action: pan-y;
    }
    #term {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      touch-action: pan-y;
    }
    .xterm {
      padding: 12px;
      height: 100%;
    }
    /* xterm 내부 스크롤(scrollback) 활성화 — 콘텐츠가 터미널 높이를 넘으면 위로 스크롤해서 이전 출력 확인 가능 */
    .xterm-viewport {
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
    }
    ${readOnlyCSS}
  </style>
</head>
<body>
  <div id="term"></div>
  <script>
    /* ====== 설정 ====== */
    const lang = '${lang}';
    const script = ${scriptJson};
    const autoRun = ${autoRun};
    const typingDelay = ${typingDelay};
    const showInput = ${showInput};
    /* ================== */

    // 에러 바운더리 설정: CDN 로드 실패나 파싱 에러를 잡아서 RN에 넘깁니다.
    window.onerror = function(message, source, lineno, colno, error) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'webview_error', 
          error: message + ' at ' + lineno + ':' + colno 
        }));
      }
    };

    let term = null;
    let fitAddon = null;
    try {
      term = new Terminal({
        fontFamily: 'Menlo, Consolas, monospace',
        fontSize: 14,
        cursorBlink: showInput ? true : false,
        cursorStyle: showInput ? 'block' : 'block',
        disableStdin: !showInput,
        convertEol: true,
        theme: { 
          background: '#000',
          foreground: '#fff',
          cursor: showInput ? '#fff' : 'transparent',
          selection: '#333'
        },
        rows: 20,
        cols: 80
      });
      
      fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(document.getElementById('term'));
      
      // 초기 크기 설정
      setTimeout(() => {
        if (fitAddon) fitAddon.fit();
      }, 100);
    } catch(initError) {
      // xterm CDN 로드 실패 시 폴백 터미널 생성
      var pre = document.createElement('pre');
      pre.style.cssText = 'margin:0;padding:12px;color:#fff;font-family:Menlo,Consolas,monospace;font-size:14px;height:100%;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;background:#000;';
      document.getElementById('term').appendChild(pre);
      term = {
        write: function(text) {
          // ANSI escape 코드 제거 후 출력
          pre.textContent += text.replace(/\\x1b\\[[0-9;]*m/g, '');
        },
        onData: function() {}
      };
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'webview_error', 
          error: 'xterm init failed: ' + (initError.message || initError) 
        }));
      }
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    
    async function typeText(s, delay = typingDelay) { 
      for (const ch of s) { 
        if (term) term.write(ch); 
        await wait(delay); 
      } 
    }
    
    async function typeLine(s, delay = typingDelay) { 
      await typeText(s, delay); 
      term.write("\\r\\n"); 
    }
    
    // [실시간 스트림 수신] RN에서 보낸 메시지 처리
    // 자동 input 타이핑(runScript)이 진행 중일 때 stream 데이터가 도착하면
    // 큐에 쌓아두었다가 타이핑이 끝난 후 flush — race condition 으로
    // 터미널 출력이 뒤섞이는 문제 회피.
    let inputTypingDone = false;
    const pendingStreams = [];

    const writeStream = (data, isError) => {
      if (!term) return;
      if (isError) {
        term.write('\\x1b[31m' + data + '\\x1b[0m');
      } else {
        term.write(data);
      }
    };

    const flushPendingStreams = () => {
      while (pendingStreams.length > 0) {
        const item = pendingStreams.shift();
        writeStream(item.data, item.isError);
      }
    };

    const handleIncomingMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'stream_data' || message.type === 'stream_error') {
          const isError = message.type === 'stream_error';
          if (!inputTypingDone) {
            pendingStreams.push({ data: message.data, isError });
          } else {
            writeStream(message.data, isError);
          }
        } else if (term) {
          term.write(event.data);
        }
      } catch (e) {
        if (term) term.write(event.data);
      }
    };

    window.addEventListener('message', (event) => {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', data: '🌐 [WebView] 메시지 수신됨: ' + event.data }));
      }
      handleIncomingMessage(event);
    });

    // iOS/Android 브릿지 차이 대응 (document vs window)
    document.addEventListener('message', handleIncomingMessage);
    
    function getPrompt(lang) { 
      if (lang === "py") return ">>> ";
      if (lang === "java") return "$ ";
      return "> "; 
    }

    async function runScript() {
      const prompt = getPrompt(lang);
      
      if (lang === "java") {
        // Java: 컴파일 → 실행 흐름으로 표시
        await typeText(prompt, 8);
        await typeLine("javac Main.java", 30);
        await wait(500);
        await typeText(prompt, 8);
        await typeLine("java Main", 30);
        await wait(300);
        
        // output만 표시 (input은 위에서 컴파일/실행 명령으로 대체)
        for (const step of script) {
          if (step.type === "output" && step.text) {
            // 여러 줄 출력을 한 줄씩 표시
            const lines = step.text.split("\\n");
            for (const line of lines) {
              await typeLine(line, 6);
              await wait(100);
            }
          }
        }
        
        await typeText(prompt, 8);
      } else {
        // JS, Python 등 기존 방식
        if (showInput) await typeText(prompt, 8);
        
        for (const step of script) {
          if (step.type === "input" && showInput) {
            await typeLine(step.text, 8);
          } else if (step.type === "output") {
            await typeLine(step.text, 6);
          }
          await wait(200);
        }
        
        if (showInput) await typeText(prompt, 8);
      }

      // input 자동 타이핑이 끝났으므로 큐에 쌓여 있던 stream 데이터를 일괄 출력
      inputTypingDone = true;
      flushPendingStreams();

      // 완료 신호 전송
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'terminal_complete'
        }));
      }
    }

    // 자동 실행 여부에 따라 스크립트 실행
    if (autoRun) {
      setTimeout(() => {
        runScript();
      }, 500);
    } else {
      // autoRun 비활성화 시에는 input 자동 타이핑이 없으므로 stream 을 즉시 출력
      inputTypingDone = true;
      flushPendingStreams();
    }

    // 터미널에 직접 입력 처리
    if (term) {
      term.onData((data) => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'user_input',
            data: data
          }));
        }
      });
    }

    // 리사이즈 이벤트 처리
    window.addEventListener('resize', () => {
      setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 100);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 터치 스크롤 지원 — xterm.js 는 wheel 이벤트만 지원하므로 touchmove 를 직접
    // xterm 의 scrollLines() API 로 매핑. 동시에 두 손가락 제스처(핀치/줌)는 차단.
    // ─────────────────────────────────────────────────────────────────────
    let lastTouchY = null;
    const ROW_PIXEL_HEIGHT = 14 * 1.2; // fontSize 14 * 기본 line-height

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) {
        // 핀치 등 멀티 터치 차단
        e.preventDefault();
        lastTouchY = null;
        return;
      }
      lastTouchY = e.touches[0].clientY;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        return;
      }
      if (lastTouchY == null || !term) return;
      const y = e.touches[0].clientY;
      const dy = lastTouchY - y;
      const lines = Math.trunc(dy / ROW_PIXEL_HEIGHT);
      if (lines !== 0) {
        term.scrollLines(lines);
        lastTouchY = y + (dy - lines * ROW_PIXEL_HEIGHT) * -1; // 잔여 픽셀 보정 (자연스러운 연속 스크롤)
      }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      lastTouchY = null;
    });

    // 더블탭 줌 차단 (iOS Safari/WKWebView)
    let lastTapTime = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        e.preventDefault();
      }
      lastTapTime = now;
    }, { passive: false });

    // 모든 초기화가 끝난 후 RN 쪽에 준비 완료 신호 전송
    let readyAttempts = 0;
    const sendReady = () => {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webview_ready' }));
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', data: 'WebView 내부에서 webview_ready 신호를 보냈습니다.' }));
      } else if (readyAttempts < 50) {
        readyAttempts++;
        setTimeout(sendReady, 100);
      }
    };
    sendReady();
  </script>
</body>
</html>`;
};

// 터미널 컴포넌트
export const TerminalComponent = React.forwardRef<any, TerminalComponentProps>(({
  module,
  onLoadComplete,
  isActive = true
}, ref) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isReadMode, setIsReadMode] = useState(true);
  const { width } = useWindowDimensions();
  const [tabLoading, setTabLoading] = useState<boolean[]>([]);
  const webviewRefs = useRef<any[]>([]);
  const isWebviewReady = useRef<Record<number, boolean>>({});
  const messageBuffer = useRef<Record<number, { text: string, isError: boolean }[]>>({});

  // 탭 변경 시 혹은 초기화 시 명시적으로 false 설정
  React.useEffect(() => {
    if (isWebviewReady.current[activeTab] === undefined) {
      isWebviewReady.current[activeTab] = false;
    }
  }, [activeTab]);

  // 외부(부모)에서 스트림 데이터를 직접 집어넣을 수 있도록 메서드 노출
  React.useImperativeHandle(ref, () => ({
    addStreamText: (text: string, isError = false) => {
      // 명시적으로 false로 초기화 (undefined 방지)
      if (isWebviewReady.current[activeTab] === undefined) {
        isWebviewReady.current[activeTab] = false;
      }

      console.log(`[Terminal] 📢 addStreamText 호출됨 (text: ${text.substring(0, 20)}..., isError: ${isError})`);
      // 현재 활성화된 탭의 웹뷰로 메시지 전송
      const currentRef = webviewRefs.current[activeTab];
      console.log('[Terminal] currentRef', currentRef);
      console.log('[Terminal] isWebviewReady', isWebviewReady.current[activeTab]);

      if (isWebviewReady.current[activeTab] && currentRef) {
        console.log(`[Terminal] ✅ 웹뷰가 준비됨. 바로 전송합니다. (Tab: ${activeTab})`);
        currentRef.postMessage(JSON.stringify({
          type: isError ? 'stream_error' : 'stream_data',
          data: text
        }));
      } else {
        // 웹뷰가 아직 준비 안됐으면 버퍼에 저장
        console.log(`[Terminal] ⏳ 웹뷰 미준비. 버퍼에 저장합니다. (Tab: ${activeTab}, CurrentReady: ${!!isWebviewReady.current[activeTab]})`);
        if (!messageBuffer.current[activeTab]) {
          messageBuffer.current[activeTab] = [];
        }
        messageBuffer.current[activeTab].push({ text, isError });
      }
    }
  }), [activeTab]);

  // module에서 터미널 파일들 추출 (다중 탭 구조)
  const terminalFiles = module?.files || [];

  // 단일 탭 모드 판정 — 어드민 detectMode 와 동일한 우선순위:
  // files[] 가 비어있고 루트에 script[] 또는 language 가 있으면 단일 탭 모드.
  // 단일 탭 모드는 탭 헤더 버튼을 그리지 않고 traffic lights 만 노출 (어드민 PreviewView 와 동일).
  const legacyMode = !terminalFiles.length && (module?.lang || module?.language || module?.script);

  useEffect(() => {
    if (legacyMode) {
      // 기존 단일 터미널 모드
      setTabLoading([false]);
    } else {
      // 탭 구조 모드
      setTabLoading(terminalFiles.map(() => false));
    }
  }, [terminalFiles.length, legacyMode]);

  const handleMessage = (event: any, tabIndex: number) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        case 'terminal_complete':
          if (activeTab === tabIndex) {
            onLoadComplete?.();
          }
          break;
        case 'webview_ready':
          console.log(`[Terminal] 🌐 WebView ${tabIndex} 준비 완료. 버퍼를 비웁니다.`);
          handleLoad(tabIndex); // 로딩 상태 해제
          isWebviewReady.current[tabIndex] = true;

          // 버퍼에 쌓인 메시지들 일괄 전송
          const buffer = messageBuffer.current[tabIndex] || [];
          const currentRef = webviewRefs.current[tabIndex];
          if (currentRef && buffer.length > 0) {
            buffer.forEach(msg => {
              currentRef.postMessage(JSON.stringify({
                type: msg.isError ? 'stream_error' : 'stream_data',
                data: msg.text
              }));
            });
            messageBuffer.current[tabIndex] = []; // 버퍼 비우기
          }
          break;
        case 'user_input':
          // 사용자 입력 처리 로직 추가 가능
          console.log('User input:', message.data);
          break;
        case 'webview_error':
          console.error(`[Terminal] 🚨 WebView ${tabIndex} Error:`, message.error);
          // 에러 발생 시 로딩 해제 + ready 상태 전환 + 버퍼 flush
          handleLoad(tabIndex);
          isWebviewReady.current[tabIndex] = true;
          const errBuffer = messageBuffer.current[tabIndex] || [];
          const errRef = webviewRefs.current[tabIndex];
          if (errRef && errBuffer.length > 0) {
            errBuffer.forEach(msg => {
              errRef.postMessage(JSON.stringify({
                type: msg.isError ? 'stream_error' : 'stream_data',
                data: msg.text
              }));
            });
            messageBuffer.current[tabIndex] = [];
          }
          break;
        case 'log':
          console.log(`[Terminal WebView]`, message.data);
          break;
      }
    } catch (error) {
      console.error('Terminal message parsing error:', error);
    }
  };

  const handleLoad = (tabIndex: number) => {
    setTabLoading(prev => {
      const next = [...prev];
      next[tabIndex] = false;
      return next;
    });

    // 안전장치: webview_ready가 3초 안에 도착하지 않으면 강제로 ready 처리
    setTimeout(() => {
      if (!isWebviewReady.current[tabIndex]) {
        console.log(`[Terminal] ⏰ WebView ${tabIndex} 타임아웃 - 강제 ready 설정`);
        isWebviewReady.current[tabIndex] = true;
        // 버퍼 flush
        const buffer = messageBuffer.current[tabIndex] || [];
        const ref = webviewRefs.current[tabIndex];
        if (ref && buffer.length > 0) {
          buffer.forEach(msg => {
            ref.postMessage(JSON.stringify({
              type: msg.isError ? 'stream_error' : 'stream_data',
              data: msg.text
            }));
          });
          messageBuffer.current[tabIndex] = [];
        }
      }
    }, 3000);
  };

  const handleLoadStart = (tabIndex: number) => {
    setTabLoading(prev => {
      const next = [...prev];
      next[tabIndex] = true;
      return next;
    });
  };

  // 현재 활성 탭의 파일 정보
  // 단일 탭 모드(legacyMode)는 어드민이 항상 showInput: true 로 저장하므로 기본값을 true 로 둔다.
  const activeFile = legacyMode ? {
    name: module?.name || 'Terminal',
    language: module?.lang || module?.language || 'py',
    script: module?.script || [],
    autoRun: module?.autoRun !== false,
    typingDelay: module?.typingDelay || 10,
    showInput: module?.showInput !== false,
  } : terminalFiles[activeTab];

  // 전체 터미널 높이 (모든 탭 공통)
  const terminalHeight = module?.height || 300;

  // isLoading -> 현재 탭의 로딩 상태
  const isLoading = tabLoading[activeTab] || false;

  // 탭이 없는 경우 (빈 상태)
  if (!legacyMode && !terminalFiles.length) {
    return (
      <View className="border border-[#5e5e5e] rounded-[10px] overflow-hidden">
        <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#3c3c3c]">
          <View className="flex-row items-center justify-center gap-[5px] h-full">
            {[...Array(3)].map((_, i) => (
              <View key={i} className="w-[10px] h-[10px] rounded-[10px] bg-[#545454]" />
            ))}
          </View>
        </View>
        <View style={{ height: terminalHeight }} className="bg-[#000] flex items-center justify-center">
          <Text className="text-[#fff] text-[14px]">터미널 파일이 없습니다</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className="border border-[#5e5e5e] rounded-[10px] overflow-hidden"
    >
      {/* 탭 헤더 — 단일 탭 모드는 traffic lights 만, 다중 탭은 탭 버튼까지 표시 */}
      <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#3c3c3c]">
        <View className="flex-row items-center justify-center gap-[5px] h-full">
          {[...Array(3)].map((_, i) => (
            <View key={i} className="w-[10px] h-[10px] rounded-[10px] bg-[#545454]" />
          ))}
        </View>
        {!legacyMode && (
          <View className="flex-row gap-[5px] flex-1">
            {terminalFiles.map((file: TerminalFile, fileIndex: number) => (
              <View key={`tab-${fileIndex}`} className="relative flex-row items-end flex-1 max-w-[125px] h-full overflow-visible">
                {activeTab === fileIndex && (
                  <>
                    <View className="absolute bottom-0 right-[100%] z-[10] w-[5px] h-[5px] bg-[#000]">
                      <View className="w-[5px] h-[5px] rounded-br-[5px] bg-[#3c3c3c]" />
                    </View>
                    <View className="absolute bottom-0 left-[100%] z-[10] w-[5px] h-[5px] bg-[#000]">
                      <View className="w-[5px] h-[5px] rounded-bl-[5px] bg-[#3c3c3c]" />
                    </View>
                  </>
                )}
                <Pressable
                  onPress={() => setActiveTab(fileIndex)}
                  className={`flex-row gap-[5px] flex-1 h-[20px] px-[3px] rounded-t-[5px] ${activeTab === fileIndex ? 'bg-[#000]' : 'bg-[#3c3c3c]'}`}>
                  <View className="flex-row gap-[5px] flex-1 items-center">
                    <Image
                      source={langLogoMap[file.language] || langLogoMap['py']}
                      className="w-[12px] h-[12px]"
                    />
                    <Text className="flex-1 text-[#fff] text-[12px] font-[400]">{file.name || ''}</Text>
                  </View>
                </Pressable>
                {!isReadMode && (
                  <View className={`absolute top-0 right-0 h-[20px] p-[5px] rounded-[5px] ${activeTab === fileIndex ? 'bg-[#fff]' : 'bg-[#3c3c3c]'}`}>
                    <X width={12} height={12} fill="#00000080" />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        {!isReadMode && !legacyMode && (
          <View className="flex-row items-end h-full">
            <View className="flex-row items-center justify-center h-[20px] px-[3px]">
              <Plus width={10} height={10} fill="#00000080" />
            </View>
          </View>
        )}
      </View>

      {/* 터미널 미리보기 (WebView) */}
      <View style={{ height: terminalHeight, position: 'relative' }} className="bg-[#000]">
        {(legacyMode ? [activeFile] : terminalFiles).map((file: TerminalFile, idx: number) => (
          <View
            key={`webview-${idx}`}
            style={{
              flex: 1,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              opacity: activeTab === idx ? 1 : 0,
              zIndex: activeTab === idx ? 1 : 0,
            }}
          >
            <WebView
              ref={el => { webviewRefs.current[idx] = el; }}
              originWhitelist={['*']}
              source={{
                html: generateTerminalHTML(
                  file.language,
                  file.script,
                  file.autoRun !== false,
                  file.typingDelay || 10,
                  file.showInput === true
                ),
                baseUrl: 'https://localhost'
              }}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              // xterm-viewport 내부 스크롤(scrollback)을 WebView 가 가로채지 않도록 활성화
              scrollEnabled={true}
              nestedScrollEnabled={true}
              onLoadStart={() => handleLoadStart(idx)}
              onLoad={() => handleLoad(idx)}
              onMessage={(event) => handleMessage(event, idx)}
              injectedJavaScript={`
                // xterm.js focus 및 iOS 키보드 이슈 등 기타 설정용 스크립트 공간
                true;
              `}
            />
            {tabLoading[idx] && activeTab === idx && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000099', zIndex: 10 }}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={{ color: '#fff', marginTop: 10 }}>로딩 중...</Text>
              </View>
            )}
          </View>
        ))}
        {/* CRT scanline 오버레이 — 미세한 green band 가 위→아래로 천천히 반복 */}
        <TerminalScanline height={terminalHeight} />
      </View>
    </View>
  );
});

export default TerminalComponent;
