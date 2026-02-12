import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Text, Pressable, Image, useWindowDimensions, Animated, Easing } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Plus } from '../../assets/SvgIcon';

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
const generateTerminalHTML = (lang: 'js' | 'py' | 'java', script: TerminalScript[], autoRun: boolean, typingDelay: number) => {
  const scriptJson = JSON.stringify(script);
  
  return `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>xterm.js Terminal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    }
    #term { 
      position: fixed; 
      inset: 0; 
      width: 100%;
      height: 100%;
    }
    .xterm { 
      padding: 12px; 
      height: 100%;
    }
    .xterm-viewport {
      overflow: hidden !important;
    }
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
    /* ================== */

    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      convertEol: true,
      theme: { 
        background: '#000',
        foreground: '#fff',
        cursor: '#fff',
        selection: '#333'
      },
      rows: 20,
      cols: 80
    });
    
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('term'));
    
    // 초기 크기 설정
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    
    async function typeText(s, delay = typingDelay) { 
      for (const ch of s) { 
        term.write(ch); 
        await wait(delay); 
      } 
    }
    
    async function typeLine(s, delay = typingDelay) { 
      await typeText(s, delay); 
      term.write("\\r\\n"); 
    }
    
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
        await typeText(prompt, 8);
        
        for (const step of script) {
          if (step.type === "input") {
            await typeLine(step.text, 8);
          } else if (step.type === "output") {
            await typeLine(step.text, 6);
          }
          await wait(200);
        }
        
        await typeText(prompt, 8);
      }
      
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
    }

    // 터미널에 직접 입력 처리
    term.onData((data) => {
      // 사용자 입력을 처리할 수 있도록 확장 가능
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'user_input',
          data: data
        }));
      }
    });

    // 리사이즈 이벤트 처리
    window.addEventListener('resize', () => {
      setTimeout(() => fitAddon.fit(), 100);
    });
  </script>
</body>
</html>`;
};

// 터미널 컴포넌트
export const TerminalComponent: React.FC<TerminalComponentProps> = ({
  module,
  onLoadComplete,
  isActive=true
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isReadMode, setIsReadMode] = useState(true);
  const { width } = useWindowDimensions();
  const [tabLoading, setTabLoading] = useState<boolean[]>([]);

  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);

  // module에서 터미널 파일들 추출 (탭 구조 지원)
  const terminalFiles = module?.files || [];
  
  // 기존 단일 터미널 구조와 호환성을 위한 변환
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

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
    if (!isActive) {
      // 🔹 화면에서 숨겨질 때는 "대기 상태"로 초기화만 해두고 리턴
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      scaleAnim.setValue(0.95);
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);

    return () => clearTimeout(timer);
  }, [isActive, fadeAnim, slideAnim, scaleAnim]);

  const handleMessage = (event: any, tabIndex: number) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      switch (message.type) {
        case 'terminal_complete':
          if (activeTab === tabIndex) {
            onLoadComplete?.();
          }
          break;
        case 'user_input':
          // 사용자 입력 처리 로직 추가 가능
          console.log('User input:', message.data);
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
  };

  const handleLoadStart = (tabIndex: number) => {
    setTabLoading(prev => {
      const next = [...prev];
      next[tabIndex] = true;
      return next;
    });
  };

  // 현재 활성 탭의 파일 정보
  const activeFile = legacyMode ? {
    name: module?.name || 'Terminal',
    language: module?.lang || module?.language || 'py',
    script: module?.script || [],
    autoRun: module?.autoRun !== false,
    typingDelay: module?.typingDelay || 10
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
    <Animated.View 
      className="border border-[#5e5e5e] rounded-[10px] overflow-hidden"
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
      }}
    >
      {/* 탭 */}
      <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#3c3c3c]">
        <View className="flex-row items-center justify-center gap-[5px] h-full">
          {[...Array(3)].map((_, i) => (
            <View key={i} className="w-[10px] h-[10px] rounded-[10px] bg-[#545454]" />
          ))}
        </View>
        <View className="flex-row gap-[5px] flex-1">
          {(legacyMode ? [activeFile] : terminalFiles).map((file: TerminalFile, fileIndex: number) => (
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
        {!isReadMode && (
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
              originWhitelist={['*']}
              source={{ 
                html: generateTerminalHTML(
                  file.language, 
                  file.script, 
                  file.autoRun !== false, 
                  file.typingDelay || 10
                )
              }}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              scrollEnabled={false}
              onLoadStart={() => handleLoadStart(idx)}
              onLoad={() => handleLoad(idx)}
              onMessage={(event) => handleMessage(event, idx)}
              injectedJavaScript={`
                // WebView 로드 완료 후 초기화
                setTimeout(() => {
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'webview_ready'
                    }));
                  }
                }, 100);
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
      </View>
    </Animated.View>
  );
};

export default TerminalComponent;
