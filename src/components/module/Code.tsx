import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Image, useWindowDimensions, ActivityIndicator, Animated, Easing } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Plus } from '../../assets/SvgIcon';

interface CodeComponentProps {
  module: any;
  onLoadComplete?: () => void;
}

const langLogoMap: Record<string, any> = {
  'html': require('../../assets/icons/html-5-icon.png'),
  'css': require('../../assets/icons/css-3-icon.png'),
  'javascript': require('../../assets/icons/js-icon.png'),
  // 필요한 언어 아이콘 추가
};


export const CodeComponent: React.FC<CodeComponentProps> = ({ module, onLoadComplete }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isReadMode, setIsReadMode] = useState(true);
  const { width } = useWindowDimensions();
  const [tabLoading, setTabLoading] = useState<boolean[]>(module.files.map(() => false));
  
  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism-okaidia.css" rel="stylesheet" />
          <script src="https://cdn.jsdelivr.net/npm/prismjs/prism.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-${lang}.min.js"></script>
          <style>
          body {
            margin: 0;
            padding: 0;
            background: #272822;
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
          }
          </style>
        </head>
        <body>
          <pre><code class="language-${lang}">${escapedContent}</code></pre>
          <script>Prism.highlightAll();</script>
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
  }, [fadeAnim, slideAnim, scaleAnim]);

  const activeFile = module.files[activeTab];

  // isLoading -> 현재 탭의 로딩 상태
  const isLoading = tabLoading[activeTab];

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
      {module.title && (
      <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">{module.title}</Text>
      )}
      {/* 탭 */}
      <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#3c3c3c]">
        <View className="flex-row items-center justify-center gap-[5px] h-full">
          {[...Array(3)].map((_, i) => (
            <View key={i} className="w-[10px] h-[10px] rounded-[10px] bg-[#545454]" />
          ))}
        </View>
        <View className="flex-row gap-[5px] flex-1">
          {module.files.map((file: any, fileIndex: number) => (
            <View key={`tab-${fileIndex}`} className="relative flex-row items-end flex-1 max-w-[125px] h-full overflow-visible">
              {activeTab === fileIndex && (
                <>
                  <View className="absolute bottom-0 right-[100%] z-[10] w-[5px] h-[5px] bg-[#272822]">
                    <View className="w-[5px] h-[5px] rounded-br-[5px] bg-[#3c3c3c]" />
                  </View>
                  <View className="absolute bottom-0 left-[100%] z-[10] w-[5px] h-[5px] bg-[#272822]">
                    <View className="w-[5px] h-[5px] rounded-bl-[5px] bg-[#3c3c3c]" />
                  </View>
                </>
              )}
              <Pressable
                onPress={() => setActiveTab(fileIndex)}
                className={`flex-row gap-[5px] flex-1 h-[20px] px-[3px] rounded-t-[5px] ${activeTab === fileIndex ? 'bg-[#272822]' : 'bg-[#3c3c3c]'}`}>
                <View className="flex-row gap-[5px] flex-1 items-center">
                  <Image source={langLogoMap[file.language]} className="w-[12px] h-[12px]" />
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

      {/* 코드 미리보기 (WebView) */}
      <View style={{ height: codeHeight, position: 'relative' }} className="bg-[#272822]">
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
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#27282299', zIndex: 10 }}>
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