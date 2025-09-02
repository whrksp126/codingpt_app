import React, { useEffect, useState, useRef } from 'react';
import { View, Pressable, Text, TextInput, Image, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  MagnifyingGlass,
  BracketsAngle,
  Plus,
  GlobeHemisphereEast,
  X
} from '../../assets/SvgIcon';

// 타입 정의
type TabType = 'html' | 'url';

interface TabData {
  type: TabType;
  content: string;
  title?: string;
  favicon?: string | null;
  url?: string | null;
}

interface WebViewComponentProps {
  module: any;
  onLoadComplete?: () => void;
}

// 메타데이터 파싱 함수
const fetchMetaData = async (tabs: TabData[]): Promise<TabData[]> => {
  const newTabList = await Promise.all(
    tabs.map(async (tab) => {
      if (tab.type === 'html') {
        const match = tab.content.match(/<title>(.*?)<\/title>/);
        return {
          ...tab,
          title: match?.[1] || 'Untitled',
          favicon: null,
          url: 'http://localhost:3000'
        };
      }

      if (tab.type === 'url') {
        const result = await getTitleAndFavicon(tab.content);
        return {
          ...tab,
          title: result?.title || tab.content,
          favicon: result?.favicon || null,
          url: tab.content
        };
      }

      return tab;
    })
  );

  return newTabList;
};

const getTitleAndFavicon = async (url: string): Promise<{ title: string; favicon: string } | null> => {
  try {
    const response = await fetch(url);
    const html = await response.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const faviconMatch = html.match(
      /<link[^>]*rel=["']?(icon|shortcut icon)["']?[^>]*href=["']([^"']+)["']/i
    );

    const title = titleMatch?.[1] || '';
    let favicon = '';

    if (faviconMatch?.[2]) {
      favicon = faviconMatch[2].startsWith('http')
        ? faviconMatch[2]
        : new URL(faviconMatch[2], url).href;
    } else {
      favicon = new URL('/favicon.ico', url).href;
    }

    return { title, favicon };
  } catch (err) {
    console.warn('Meta fetch error:', err);
    return null;
  }
};

// 컴포넌트 본문
export const WebViewComponent: React.FC<WebViewComponentProps> = ({ module, onLoadComplete }) => {
  const [tabList, setTabList] = useState<TabData[]>([]);
  const [tabStacks, setTabStacks] = useState<string[][]>([]);
  const [tabIndexes, setTabIndexes] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [isReadMode, setIsReadMode] = useState<boolean>(true);
  const [tabLoading, setTabLoading] = useState<boolean[]>([]);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState<boolean>(false);
  const webViewRefs = useRef<(WebView | null)[]>([]);
  useEffect(() => {
    fetchMetaData(module.tabs).then((data) => {
      setTabList(data);
      setTabStacks(data.map((tab) => [tab.url || '']));
      setTabIndexes(data.map(() => 0));
      setTabLoading(data.map(() => false));
    });
  }, [module]);

  const currentUrl = tabStacks[activeTab]?.[tabIndexes[activeTab]];

  const onPressBack = () => {
    if (tabIndexes[activeTab] > 0) {
      const newIndexes = [...tabIndexes];
      newIndexes[activeTab] -= 1;
      setTabIndexes(newIndexes);
    }
  };

  const onPressForward = () => {
    if (tabIndexes[activeTab] < tabStacks[activeTab].length - 1) {
      const newIndexes = [...tabIndexes];
      newIndexes[activeTab] += 1;
      setTabIndexes(newIndexes);
    }
  };

  const onPressRefresh = () => {
    setTabIndexes([...tabIndexes]);
  };

  const onPressDeveloperMode = () => {
    setIsDevToolsOpen(!isDevToolsOpen);
    // 현재 활성 탭의 웹뷰에 개발자 도구 토글 명령 전송
    const currentWebView = webViewRefs.current[activeTab];
    if (currentWebView) {
      const toggleScript = `
        if (window.devTools) {
          window.devTools.toggle();
        }
      `;
      currentWebView.injectJavaScript(toggleScript);
    }
  };

  // 웹뷰 최적화 및 개발자 도구 JavaScript 코드
  const devToolsScript = `
    (function() {
      // 모바일 최적화 설정
      function setupMobileOptimization() {
        // 뷰포트 메타태그 추가/업데이트
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
          viewport = document.createElement('meta');
          viewport.name = 'viewport';
          document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes';
        
        // 기본 스타일 추가
        const style = document.createElement('style');
        style.textContent = \`
          * {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
          
          input, textarea, [contenteditable] {
            -webkit-user-select: text;
            -khtml-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            user-select: text;
          }
          
          body {
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
          }
          
          img {
            max-width: 100%;
            height: auto;
          }
          
          /* 스크롤 최적화 */
          * {
            -webkit-overflow-scrolling: touch;
          }
        \`;
        document.head.appendChild(style);
      }
      
      // 스크롤 충돌 방지
      function setupScrollConflictPrevention() {
        let isScrolling = false;
        let scrollTimeout;
        
        function handleTouchStart(e) {
          isScrolling = true;
          clearTimeout(scrollTimeout);
        }
        
        function handleTouchEnd(e) {
          scrollTimeout = setTimeout(() => {
            isScrolling = false;
          }, 150);
        }
        
        function handleScroll(e) {
          if (isScrolling) {
            e.stopPropagation();
          }
        }
        
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
        document.addEventListener('scroll', handleScroll, { passive: false });
        
        // 휠 이벤트도 처리
        document.addEventListener('wheel', handleScroll, { passive: false });
      }
      
      // 초기화 실행
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setupMobileOptimization();
          setupScrollConflictPrevention();
        });
      } else {
        setupMobileOptimization();
        setupScrollConflictPrevention();
      }
      
      // 개발자 도구 설정
      if (window.devTools) return;
      
      let isOpen = false;
      let devToolsElement = null;
      
      function createDevTools() {
        const devTools = document.createElement('div');
        devTools.id = 'react-native-dev-tools';
        devTools.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 999999;
          display: none;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 12px;
        \`;
        
        const panel = document.createElement('div');
        panel.style.cssText = \`
          position: absolute;
          top: 20px;
          left: 20px;
          right: 20px;
          bottom: 20px;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
        \`;
        
        const header = document.createElement('div');
        header.style.cssText = \`
          background: #2d2d30;
          padding: 8px 12px;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
        \`;
        
        const title = document.createElement('span');
        title.textContent = 'Developer Tools';
        title.style.color = '#fff';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = \`
          background: none;
          border: none;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
        \`;
        
        const content = document.createElement('div');
        content.style.cssText = \`
          flex: 1;
          padding: 12px;
          overflow: auto;
          color: #d4d4d4;
        \`;
        
        // 콘솔 로그 표시
        const consoleLog = document.createElement('div');
        consoleLog.innerHTML = \`
          <h3 style="color: #569cd6; margin: 0 0 10px 0;">Console</h3>
          <div id="console-output" style="background: #0c0c0c; padding: 8px; border-radius: 3px; min-height: 100px; white-space: pre-wrap; font-family: monospace;"></div>
        \`;
        
        // DOM 정보 표시
        const domInfo = document.createElement('div');
        domInfo.innerHTML = \`
          <h3 style="color: #569cd6; margin: 20px 0 10px 0;">DOM Info</h3>
          <div id="dom-info" style="background: #0c0c0c; padding: 8px; border-radius: 3px; font-family: monospace;"></div>
        \`;
        
        content.appendChild(consoleLog);
        content.appendChild(domInfo);
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        panel.appendChild(content);
        devTools.appendChild(panel);
        
        closeBtn.onclick = () => {
          devTools.style.display = 'none';
          isOpen = false;
        };
        
        return devTools;
      }
      
      function updateConsoleOutput() {
        const output = document.getElementById('console-output');
        if (output) {
          output.textContent = 'Console logs will appear here...';
        }
      }
      
      function updateDOMInfo() {
        const domInfo = document.getElementById('dom-info');
        if (domInfo) {
          const info = \`
            Document Title: \${document.title}
            URL: \${window.location.href}
            Elements: \${document.querySelectorAll('*').length}
            Images: \${document.querySelectorAll('img').length}
            Links: \${document.querySelectorAll('a').length}
            Scripts: \${document.querySelectorAll('script').length}
          \`;
          domInfo.textContent = info;
        }
      }
      
      window.devTools = {
        toggle: function() {
          if (!devToolsElement) {
            devToolsElement = createDevTools();
            document.body.appendChild(devToolsElement);
          }
          
          isOpen = !isOpen;
          devToolsElement.style.display = isOpen ? 'block' : 'none';
          
          if (isOpen) {
            updateConsoleOutput();
            updateDOMInfo();
          }
        }
      };
      
      // 콘솔 오버라이드
      const originalLog = console.log;
      console.log = function(...args) {
        originalLog.apply(console, args);
        const output = document.getElementById('console-output');
        if (output && isOpen) {
          output.textContent += args.join(' ') + '\\n';
        }
      };
    })();
  `;

  if (!tabList.length || !tabStacks[activeTab]) return null;

  // isLoading -> 현재 탭의 로딩 상태
  const isLoading = tabLoading[activeTab];

  return (
    <View className="border border-[#E5E5E5] rounded-[10px] overflow-hidden">

      {/* 탭 영역 */}
      <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#E5E5E5]">
        <View className="flex-row items-center justify-center gap-[5px] h-full">
          <View className="w-[10px] h-[10px] rounded-[10px] bg-[#ccc]"></View>
          <View className="w-[10px] h-[10px] rounded-[10px] bg-[#ccc]"></View>
          <View className="w-[10px] h-[10px] rounded-[10px] bg-[#ccc]"></View>
        </View>
        <View className="flex-row gap-[5px] flex-1">
          {tabList.map((tab, tabIndex) => (
            <View key={`tab-${tabIndex}`} className="relative flex-row items-end flex-1 max-w-[125px] h-full overflow-visible">
              {activeTab === tabIndex && (
                <>
                  <View className="absolute bottom-0 right-[100%] z-[10] w-[5px] h-[5px] bg-[#fff]">
                    <View className="w-[5px] h-[5px] rounded-br-[5px] bg-[#E5E5E5]" />
                  </View>
                  <View className="absolute bottom-0 left-[100%] z-[10] w-[5px] h-[5px] bg-[#fff]">
                    <View className="w-[5px] h-[5px] rounded-bl-[5px] bg-[#E5E5E5]" />
                  </View>
                </>
              )}
              <Pressable onPress={() => setActiveTab(tabIndex)} className={`flex-row gap-[5px] flex-1 h-[20px] px-[3px] rounded-t-[5px] ${activeTab === tabIndex ? 'bg-[#fff]' : 'bg-[#E5E5E5]'}`}>
                <View className="flex-row gap-[5px] flex-1 items-start">
                  <View className="pt-[4px]">
                  {tab.favicon ? (
                    <Image source={{ uri: tab.favicon }} className="w-[12px] h-[12px]" />
                  ) : (
                    <GlobeHemisphereEast width={12} height={12} fill="#000000" />
                  )}
                  </View>
                  <Text className="flex-1 text-[#000000] text-[12px] font-[400]">{tab.title || ''}</Text>
                </View>
              </Pressable>
              {!isReadMode && (
                <View className={`absolute top-0 right-0 h-[20px] p-[5px] rounded-[5px] ${activeTab === tabIndex ? 'bg-[#fff]' : 'bg-[#E5E5E5]'}`}>
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

      {/* 상단 바 */}
      <View className="flex-row items-center gap-[10px] h-[30px] px-[10px] py-[4px] border-b border-[#E5E5E5]">
        <Pressable onPress={onPressBack}>
          <ArrowLeft width={17} height={17} fill={tabIndexes[activeTab] > 0 ? "#000000" : "#00000080"} />
        </Pressable>
        <Pressable onPress={onPressForward}>
          <ArrowRight width={17} height={17} fill={tabIndexes[activeTab] < tabStacks[activeTab].length - 1 ? "#000000" : "#00000080"} />
        </Pressable>
        <Pressable onPress={onPressRefresh}>
          <ArrowClockwise width={17} height={17} fill="#000000" />
        </Pressable>
        <View className="relative flex-1">
          <View className="absolute top-[4px] left-[4px] z-[10] w-[14px] h-[14px] bg-[#ccc] rounded-[10px] flex items-center justify-center">
            <MagnifyingGlass width={10} height={10} fill="#4B4B4B" />
          </View>
          <TextInput
            value={currentUrl}
            style={{
              color: '#4B4B4B',
              fontSize: 12,
              fontWeight: '400',
              paddingLeft: 23,
              height: '100%',
              flex: 1,
              padding: 4,
              borderRadius: 20,
              backgroundColor: '#F1F1F1',
            }}
          />
        </View>
        <Pressable onPress={onPressDeveloperMode}>
          <BracketsAngle width={17} height={17} fill="#000000" />
        </Pressable>
      </View>

      {/* 웹뷰 */}
      <View className="h-[200px]" style={{ position: 'relative' }}>
        {tabList.map((tab, idx) => (
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
              // display: activeTab === idx ? 'flex' : 'none',
            }}
          >
            <WebView
              ref={(ref) => {
                webViewRefs.current[idx] = ref;
              }}
              source={
                tab.type === 'html'
                  ? { html: tab.content }
                  : { uri: tabStacks[idx]?.[tabIndexes[idx]] }
              }
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              webviewDebuggingEnabled={true}
              style={{ flex: 1 }}
              injectedJavaScript={devToolsScript}
              scalesPageToFit={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bounces={false}
              scrollEnabled={true}
              // 스크롤 충돌 방지
              onTouchStart={() => {
                // 웹뷰 터치 시작 시 앱 스크롤 비활성화
              }}
              onTouchEnd={() => {
                // 웹뷰 터치 종료 시 앱 스크롤 활성화
              }}
              onLoadStart={() => {
                setTabLoading(prev => {
                  const next = [...prev];
                  next[idx] = true;
                  return next;
                });
              }}
              onLoad={() => {
                setTabLoading(prev => {
                  const next = [...prev];
                  next[idx] = false;
                  return next;
                });
                if (activeTab === idx) {
                  onLoadComplete?.();
                }
              }}
              onNavigationStateChange={(navState) => {
                if (tab.type === 'url' && activeTab === idx) {
                  const newStacks = [...tabStacks];
                  const newIndexes = [...tabIndexes];
                  const stack = newStacks[idx].slice(0, newIndexes[idx] + 1);
                  if (stack[stack.length - 1] !== navState.url) {
                    stack.push(navState.url);
                    newStacks[idx] = stack;
                    newIndexes[idx] = stack.length - 1;
                    setTabStacks(newStacks);
                    setTabIndexes(newIndexes);
                  }
                }
              }}
              onMessage={(event) => {
                // 웹뷰에서 메시지를 받을 때 처리
              }}
            />
            {tabLoading[idx] && activeTab === idx && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#27282299', zIndex: 10 }}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={{ color: '#fff', marginTop: 10 }}>로딩 중...</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};