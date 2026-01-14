import React, { useEffect, useState, useRef } from 'react';
import { View, Pressable, Text, TextInput, Image, ActivityIndicator, Dimensions, Animated, Easing } from 'react-native';
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
  safeAreaInsets?: { top: number; bottom: number };
  headerHeight?: number;
  buttonAreaHeight?: number;
  isActive?: boolean; // 현재 이 웹뷰가 화면에 보여지는지 여부
  skipAnimation?: boolean;
}

const scrollViewPadding = 20;
const webViewTabHeight = 26;
const webViewHeaderHeight = 30;
const webViewBottomToggleHeight = 20;

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
export const WebViewComponent: React.FC<WebViewComponentProps> = ({
  module,
  onLoadComplete,
  safeAreaInsets = { top: 0, bottom: 0 },
  headerHeight = 0,
  buttonAreaHeight = 0,
  isActive = true, // default true
  skipAnimation = false,
}) => {
  // WebViewComponent prerender 체크
  // console.log(
  //   '🌐 WebViewComponent render:',
  //   'isActive =',
  //   isActive,
  //   'tabs =',
  //   module.tabs?.length
  // );

  const [tabList, setTabList] = useState<TabData[]>([]);
  const [tabStacks, setTabStacks] = useState<string[][]>([]);
  const [tabIndexes, setTabIndexes] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [isReadMode, setIsReadMode] = useState<boolean>(true);
  const [tabLoading, setTabLoading] = useState<boolean[]>([]);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState<boolean>(false);
  const [webViewHeights, setWebViewHeights] = useState<number[]>([]); // 각 탭별 높이
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [originalHeight] = useState<number>(200);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));

  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);

  const webViewRefs = useRef<(WebView | null)[]>([]);
  useEffect(() => {
    fetchMetaData(module.tabs).then((data) => {
      setTabList(data);
      // URL이 변경되었을 때 tabStacks 업데이트
      const newStacks = data.map((tab, idx) => {
        // 기존 스택이 있고 URL이 변경되지 않았으면 유지, 변경되었으면 새로 시작
        const existingStack = tabStacks[idx];
        const newUrl = tab.url || tab.content || '';
        if (existingStack && existingStack[0] === newUrl) {
          return existingStack;
        }
        return [newUrl];
      });
      setTabStacks(newStacks);
      setTabIndexes(newStacks.map(() => 0));
      setTabLoading(data.map(() => false));
      setWebViewHeights(data.map(() => 300)); // 초기 높이 설정 (계산된 높이로 업데이트됨)
    });
  }, [module]);

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
    if (!isActive) {
      // 🔹 화면에서 숨겨질 때는 "대기 상태"로 초기화만 해두고 리턴
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      scaleAnim.setValue(0.95);
      return;
    }

    // skipAnimation이 true면 즉시 최종 상태로 설정
    if (skipAnimation) {
      setIsVisible(true);
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      scaleAnim.setValue(1);
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
  }, [isActive, skipAnimation, fadeAnim, slideAnim, scaleAnim]);

  // 화면 크기 변경 감지
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

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
    console.log('🔧 개발자 도구 버튼 클릭됨!');
    setIsDevToolsOpen(!isDevToolsOpen);

    // WebView에 Eruda 토글 메시지 전송
    const currentWebView = webViewRefs.current[activeTab];
    console.log('현재 WebView:', currentWebView);
    console.log('현재 activeTab:', activeTab);

    if (currentWebView) {
      const message = JSON.stringify({
        type: 'toggleEruda'
      });
      console.log('전송할 메시지:', message);
      currentWebView.postMessage(message);
      console.log('✅ postMessage 전송 완료');
    } else {
      console.log('❌ WebView가 없습니다!');
    }
  };

  // 웹뷰 크기 토글 핸들러
  // const handleToggleSize = () => {
  //   if (isExpanded) {
  //     // 축소: 원래 크기로 복원
  //     setWebViewHeight(originalHeight);
  //     setIsExpanded(false);
  //   } else {
  //     // 확장: 가로/세로 중 긴 길이에서 세이프에어리어, 헤더, 바텀, 패딩바텀 20px을 뺀 길이
  //     const { width, height } = screenDimensions;
  //     const maxDimension = Math.max(width, height); // 가로/세로 중 긴 길이

  //     const expandedHeight = maxDimension - safeAreaInsets.top - safeAreaInsets.bottom - headerHeight - buttonAreaHeight - (scrollViewPadding * 2) - webViewTabHeight - webViewHeaderHeight - webViewBottomToggleHeight; // 패딩바텀 20px, 패딩탑 20px
  //     setWebViewHeight(expandedHeight);
  //     setIsExpanded(true);
  //   }
  // };

  // 뷰포트 설정 + Eruda 토글 스크립트
  const viewportScript = `
    (function() {
      // 뷰포트 메타태그 설정 (모바일 최적화)
      function setupViewport() {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
          viewport = document.createElement('meta');
          viewport.name = 'viewport';
          document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes';
      }
      
      // Eruda 토글 기능
      const CDN = 'https://cdn.jsdelivr.net/npm/eruda@3.0.1/eruda.js';
      const KEY = 'eruda';
      
      function loadEruda(cb){
        if (window.eruda) return cb?.();
        const s = document.createElement('script');
        s.src = CDN;
        s.onload = cb || null;
        document.head.appendChild(s);
      }

      function hideErudaEntry(){
        try { eruda.get('entry')?.hide(); } catch (e) {}
        try {
          const host = document.querySelector('#eruda');
          const entry = host?.shadowRoot?.querySelector('.eruda-entry-btn');
          if (entry) entry.style.display = 'none';
        } catch (e) {}
      }

      function enableEruda(){
        loadEruda(() => {
          eruda.init();
          hideErudaEntry();
          eruda.show();
          patchErudaResizer();
          localStorage.setItem(KEY,'true');
        });
      }

      function patchErudaResizer() {
        const host = document.querySelector('#eruda');
        const root = host?.shadowRoot;
        if (!root) return;
        const resizer = root.querySelector('.eruda-resizer');
        if (resizer) {
          resizer.style.height = '20px';
        }
        const style = document.createElement('style');
        style.textContent = \`
          .eruda-dev-tools .eruda-resizer {
            top: -18px !important;
            height: 20px !important;
          }
        \`;
        root.appendChild(style);
      }

      function disableEruda(){
        if (window.eruda) eruda.destroy();
        localStorage.removeItem(KEY);
      }

      function isOn(){ return localStorage.getItem(KEY)==='true'; }

      function toggleErudaFromNative() {
        console.log('🔄 toggleErudaFromNative 호출됨');
        console.log('현재 Eruda 상태:', isOn());
        if (isOn()) {
          console.log('🔧 Eruda 닫기 실행');
          disableEruda();
        } else {
          console.log('🔧 Eruda 열기 실행');
          enableEruda();
        }
      }

      // 전역 함수로 등록
      window.toggleErudaFromNative = toggleErudaFromNative;

      // React Native WebView에서 메시지 수신
      document.addEventListener('message', function(event) {
        console.log('📨 WebView에서 메시지 수신:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('📨 파싱된 데이터:', data);
          if (data.type === 'toggleEruda') {
            console.log('🔧 Eruda 토글 실행!');
            toggleErudaFromNative();
          }
        } catch (e) {
          console.log('❌ 메시지 파싱 실패:', e);
        }
      });

      // window.addEventListener도 추가 (React Native WebView 호환성)
      window.addEventListener('message', function(event) {
        console.log('📨 window에서 메시지 수신:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('📨 window 파싱된 데이터:', data);
          if (data.type === 'toggleEruda') {
            console.log('🔧 window Eruda 토글 실행!');
            toggleErudaFromNative();
          }
        } catch (e) {
          console.log('❌ window 메시지 파싱 실패:', e);
        }
      });

      // 초기화
      console.log('🚀 Eruda 스크립트 초기화 시작');
      console.log('현재 Eruda 상태:', isOn());
      if (isOn()) {
        console.log('🔧 이전 상태 복원 - Eruda 활성화');
        enableEruda();
      } else {
        console.log('🔧 Eruda 비활성화 상태');
      }
      
      // 컨텐츠 높이 측정 및 전송 함수
      let lastSentHeight = 0;
      function measureAndSendHeight() {
        const height = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        
        // 높이가 0이거나 너무 작으면 무시 (최소 50px 이상)
        if (height < 50) {
          return;
        }
        
        // 높이가 이전과 동일하거나 더 작으면 전송하지 않음 (작아지는 것 방지)
        if (height <= lastSentHeight && lastSentHeight > 0) {
          return;
        }
        
        // 높이가 유효하고 변경되었을 때만 전송
        if (height !== lastSentHeight) {
          lastSentHeight = height;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'contentHeight',
              height: height
            }));
          }
        }
      }

      // 초기화 실행
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          console.log('📄 DOMContentLoaded 위');
          setupViewport();
          setTimeout(measureAndSendHeight, 100);
        });
      } else {
        console.log('📄 DOMContentLoaded 아래');
        setupViewport();
        setTimeout(measureAndSendHeight, 100);
      }

      // 컨텐츠 변경 감지 (MutationObserver) - 디바운싱 적용
      let mutationTimeout;
      const observer = new MutationObserver(() => {
        clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(() => {
          measureAndSendHeight();
        }, 200); // 200ms 디바운싱
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // 이미지 로드 완료 시 높이 재측정
      window.addEventListener('load', () => {
        setTimeout(measureAndSendHeight, 100);
      });
      
      console.log('✅ Eruda 스크립트 초기화 완료');
    })();
  `;

  if (!tabList.length || !tabStacks[activeTab]) return null;

  // isLoading -> 현재 탭의 로딩 상태
  const isLoading = tabLoading[activeTab];

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
        // 🔹 isActive가 false면 렌더하지 않음
        ...(!isActive && {
          height: 0,
          marginTop: 0,
          marginBottom: 0,
          opacity: 0,
        }),
      }}
    >
      {module.title && (
        <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">{module.title}</Text>
      )}
      <View
        className="border border-[#E5E5E5] rounded-[16px] overflow-hidden"
        style={{
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 5,
          elevation: 5, // Android용 그림자
        }}
      >
        {/* 탭 영역 */}
        {/* <View className={`flex-row items-end gap-[10px] h-[${webViewTabHeight}px] px-[10px] bg-[#E5E5E5]`}>
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
                  <View className="flex-row gap-[5px] flex-1 items-center">
                    {tab.favicon ? (
                      <Image source={{ uri: tab.favicon }} className="w-[12px] h-[12px]" />
                    ) : (
                      <GlobeHemisphereEast width={12} height={12} fill="#000000" />
                    )}
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
        */}

        {/* 상단 바 */}
        {/* <View className={`flex-row items-center gap-[10px] h-[${webViewHeaderHeight}px] px-[10px] py-[4px] border-b border-[#E5E5E5]`}>
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
        </View> */}

        {/* 웹뷰 */}
        <View style={{ height: webViewHeights[activeTab] || 300, position: 'relative' }}>
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
                key={tab.type === 'html' ? `html-${tab.content?.substring(0, 50)}` : `url-${tabStacks[idx]?.[tabIndexes[idx]]}`}
                ref={(ref) => {
                  webViewRefs.current[idx] = ref;
                }}
                source={
                  tab.type === 'html'
                    ? {
                      html: tab.content,
                      baseUrl: 'https://localhost:3000',
                    }
                    : { uri: tabStacks[idx]?.[tabIndexes[idx]] }
                }
                originWhitelist={['*']}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                webviewDebuggingEnabled={true}
                style={{ flex: 1 }}
                injectedJavaScript={viewportScript}
                scalesPageToFit={true}
                scrollEnabled={true}
                nestedScrollEnabled={true}
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
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    console.log('WebView에서 받은 메시지:', data);

                    // 컨텐츠 높이 업데이트
                    if (data.type === 'contentHeight' && typeof data.height === 'number' && data.height > 0) {
                      setWebViewHeights(prev => {
                        const next = [...prev];
                        const currentHeight = next[idx] || 300; // 기본값 300
                        const newHeight = data.height;

                        // 높이가 너무 작으면 무시 (최소 50px 이상)
                        if (newHeight < 50) {
                          return next; // 현재 높이 유지
                        }

                        // 새로운 높이가 현재 높이보다 크거나 같으면 업데이트
                        if (newHeight >= currentHeight) {
                          next[idx] = newHeight;
                        }
                        // 이미 설정된 높이가 있고 새로운 높이가 더 작으면 유지 (작아지는 것 방지)

                        return next;
                      });
                    }
                  } catch (e) {
                    console.log('WebView 메시지 파싱 실패:', e);
                  }
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

        {/* 크기 토글 버튼 */}
        {/* <Pressable 
          className={`h-[${webViewBottomToggleHeight}px] border-t border-[#ccc] flex items-center justify-center ${isExpanded ? 'bg-[#4CAF50]' : 'bg-[#E5E5E5]'}`}
          onPress={handleToggleSize}
        >
          <View className="flex-row gap-[2px]">
            <View className={`w-[2px] h-[8px] rounded-[1px] ${isExpanded ? 'bg-[#fff]' : 'bg-[#999]'}`}></View>
            <View className={`w-[2px] h-[8px] rounded-[1px] ${isExpanded ? 'bg-[#fff]' : 'bg-[#999]'}`}></View>
            <View className={`w-[2px] h-[8px] rounded-[1px] ${isExpanded ? 'bg-[#fff]' : 'bg-[#999]'}`}></View>
          </View>
        </Pressable> */}

      </View>

    </Animated.View>
  );
};