import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Image, useWindowDimensions, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { X, Plus } from '../../assets/SvgIcon';

interface CodeComponentProps {
  module: any;
  onLoadComplete?: () => void;
  isActive?: boolean;
  skipAnimation?: boolean;
}

const langLogoMap: Record<string, any> = {
  'html': require('../../assets/icons/html-5-icon.png'),
  'css': require('../../assets/icons/css-3-icon.png'),
  'javascript': require('../../assets/icons/js-icon.png'),
  // 필요한 언어 아이콘 추가
};


export const CodeComponent: React.FC<CodeComponentProps> = ({ module, onLoadComplete, isActive = true, skipAnimation = false }) => {
  // CodeComponent prerender 체크
  // console.log(
  //   '🔁 CodeComponent render:',
  //   'isActive =', isActive,
  //   'tabs =', module.files.length
  // );

  const [activeTab, setActiveTab] = useState(0);
  const [isReadMode, setIsReadMode] = useState(true);
  const { width } = useWindowDimensions();
  const [tabLoading, setTabLoading] = useState<boolean[]>(module.files.map(() => false));

  // 애니메이션 상태
  const opacity = useSharedValue(0);
  const ty = useSharedValue(20);
  const sc = useSharedValue(0.95);
  const [isVisible, setIsVisible] = useState(false);

  // 모듈에서 height 추출 (기본값: 220)
  const codeHeight = module?.height || 220;
  const renderHTML = (language: string, content: string) => {
    const lang = language || 'markup'; // fallback
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <!-- 핀치 줌 차단 — user-scalable=no + maximum-scale=1.0 -->
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <link href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism-okaidia.css" rel="stylesheet" />
          <script src="https://cdn.jsdelivr.net/npm/prismjs/prism.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-${lang}.min.js"></script>
          <style>
          html, body {
            /* 한 손가락 스크롤만 허용 — 핀치 줌 차단 */
            touch-action: pan-y;
          }
          body {
            margin: 0;
            padding: 0;
            background: #0A0D14;
            font-size: 14px;
          }
          pre, code {
            font-size: 14px;
            line-height: 1.4;
            padding: 0px;
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            background: #0A0D14 !important;
          }
          pre {
            background: #0A0D14 !important;
          }
          code {
            background: #0A0D14 !important;
          }
          </style>
        </head>
        <body>
          <pre><code class="language-${lang}">${escapedContent}</code></pre>
          <script>Prism.highlightAll();</script>
          <script>
            // 멀티 터치(핀치 줌) 차단 — user-scalable=no 만으로 차단 안 되는 WKWebView 보강
            document.addEventListener('touchstart', function (e) {
              if (e.touches.length >= 2) e.preventDefault();
            }, { passive: false });
            document.addEventListener('touchmove', function (e) {
              if (e.touches.length >= 2) e.preventDefault();
            }, { passive: false });
            // 더블탭 줌 차단
            var lastTap = 0;
            document.addEventListener('touchend', function (e) {
              var now = Date.now();
              if (now - lastTap < 300) e.preventDefault();
              lastTap = now;
            }, { passive: false });
          </script>
        </body>
      </html>
    `;
  };

  useEffect(() => {
    // 탭 개수 변경 시 로딩 상태 배열도 맞춰줌
    setTabLoading(module.files.map(() => false));
  }, [module.files.length]);

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
    if (!isActive) {
      opacity.value = 0;
      ty.value = 20;
      sc.value = 0.95;
      return;
    }
    if (skipAnimation) {
      setIsVisible(true);
      opacity.value = 1;
      ty.value = 0;
      sc.value = 1;
      return;
    }
    const timer = setTimeout(() => {
      setIsVisible(true);
      opacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      ty.value = withSpring(0, { damping: 14, stiffness: 110 });
      sc.value = withSpring(1, { damping: 12, stiffness: 130 });
    }, 80);
    return () => clearTimeout(timer);
  }, [isActive, skipAnimation, opacity, ty, sc]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  const activeFile = module.files[activeTab];

  // isLoading -> 현재 탭의 로딩 상태
  const isLoading = tabLoading[activeTab];

  return (
    <Animated.View
      style={[
        animStyle,
        !isActive && {
          height: 0,
          marginTop: 0,
          marginBottom: 0,
          opacity: 0,
          pointerEvents: 'none' as const,
        },
      ]}
    >
      {module.title && (
        <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">{module.title}</Text>
      )}
      <View className="bg-Background-Black_Base rounded-[16px] overflow-hidden">
        {/* 헤더 영역 */}
        <View className="flex-row items-center gap-[6px] h-[30px] p-[16px]">
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Danger-Pressed-900" />
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Warning-Pressed-900" />
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Success-Pressed-900" />
        </View>
        {/* 탭 */}
        {/* <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-Background-Black_Base">
          <View className="flex-row gap-[5px] flex-1">
            {module.files.map((file: any, fileIndex: number) => (
              <View key={`tab-${fileIndex}`} className="relative flex-row items-end flex-1 max-w-[125px] h-full overflow-visible">
                {activeTab === fileIndex && (
                  <>
                    <View className="absolute bottom-0 right-[100%] z-[10] w-[5px] h-[5px] bg-Background-Black_Base">
                      <View className="w-[5px] h-[5px] rounded-br-[5px] bg-Background-Black_Base" />
                    </View>
                    <View className="absolute bottom-0 left-[100%] z-[10] w-[5px] h-[5px] bg-Background-Black_Base">
                      <View className="w-[5px] h-[5px] rounded-bl-[5px] bg-Background-Black_Base" />
                    </View>
                  </>
                )}
                <Pressable
                  onPress={() => setActiveTab(fileIndex)}
                  className={`flex-row gap-[5px] flex-1 h-[20px] px-[3px] rounded-t-[5px] ${activeTab === fileIndex ? 'bg-Background-Black_Base' : 'bg-Background-Black_Base'}`}>
                  <View className="flex-row gap-[5px] flex-1 items-center">
                    <Image source={langLogoMap[file.language]} className="w-[12px] h-[12px]" />
                    <Text className="flex-1 text-[#fff] text-[12px] font-[400]">{file.name || ''}</Text>
                  </View>
                </Pressable>
                {!isReadMode && (
                  <View className={`absolute top-0 right-0 h-[20px] p-[5px] rounded-[5px] ${activeTab === fileIndex ? 'bg-[#fff]' : 'bg-Background-Black_Base'}`}>
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
        </View> */}

        {/* 코드 미리보기 (WebView) */}
        <View style={{ height: codeHeight, position: 'relative' }} className="bg-Background-Black_Base">
          {module.files.map((file: any, idx: number) => (
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
                originWhitelist={['*']}
                source={{ html: renderHTML(file.language, file.content) }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
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
              />
              {tabLoading[idx] && activeTab === idx && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0D1499', zIndex: 10 }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#fff', marginTop: 10 }}>로딩 중...</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
};