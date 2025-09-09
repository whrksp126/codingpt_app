import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Image, Animated, Easing, Vibration, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { FRONT_URL } from '../../utils/service';
import { ActivityIndicator } from 'react-native';

interface CodeFillTheGapProps {
  curSlideIndex: number;
  moduleIndex: number;
  curLesson: any;
  setCurLesson: (curLesson: any) => void;
  setIsNextButtonEnabled?: (isNextButtonEnabled: boolean) => void;
  onLoadComplete?: () => void;
}

const langLogoMap: Record<string, any> = {
  'html': require('../../assets/icons/html-5-icon.png'),
  'css': require('../../assets/icons/css-3-icon.png'),
  'javascript': require('../../assets/icons/js-icon.png'),
  // 필요한 언어 아이콘 추가
};


export const CodeFillTheGapComponent: React.FC<CodeFillTheGapProps> = ({ onLoadComplete, curSlideIndex, moduleIndex, curLesson, setCurLesson, setIsNextButtonEnabled }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const webviewRefs = useRef<Array<React.RefObject<WebViewType | null>>>([]);

  // 애니메이션 상태 관리
  const buttonScales = useRef<{ [key: string]: Animated.Value }>({}).current;
  const buttonOpacities = useRef<{ [key: string]: Animated.Value }>({}).current;
  const [pressedButtons, setPressedButtons] = useState<{ [key: string]: boolean }>({});

  // 슝 올라오는 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);

  const [webHeight, setWebHeight] = useState(220);

  useEffect(() => {
    setWebHeight(curLesson.sliders[curSlideIndex].modules[moduleIndex].files[activeTab].height || 220);
  }, [activeTab]);

  useEffect(()=> {
    
    curLesson.sliders[curSlideIndex].modules[moduleIndex].files.forEach((file: any, fileIndex: number) => {
      let jsCode = '';
      jsCode += `
        (function() {
          document.querySelectorAll('input').forEach(el => el.classList.remove('focus', 'correct', 'incorrect'));
        })();
      `
      // 첫번째 빈칸 포커스
      const firstNullIdx = getFirstNullIdx(activeTab);
      if (firstNullIdx !== -1) {
        jsCode += `
          (function() {
            document.getElementById('blank-${firstNullIdx}').classList.add('focus');
          })();
        `;
      }
      file.answers.forEach((ansObj: any, ansIdx: number) => {
        // 빈칸에 값 채우기
        jsCode += `
          (function() {
            document.getElementById('blank-${ansIdx}').value = '${ansObj.userAnswer || ''}';
            document.getElementById('blank-${ansIdx}').dataset.optionIndex = '${ansObj.optionElIndex}';
            var event = new Event('input', { bubbles: true });
            document.getElementById('blank-${ansIdx}').dispatchEvent(event);
          })();
        `;

        // 정답 여부에 따라 클래스 적용
        if (ansObj.isCorrect !== null && ansObj.isCorrect !== undefined) {
          jsCode += `
            (function() {
              document.getElementById('blank-${ansIdx}').classList.remove('focus', 'rcorrect', 'incorrect');
              document.getElementById('blank-${ansIdx}').classList.add('${ansObj.isCorrect ? 'correct' : 'incorrect'}');
              document.getElementById('blank-${ansIdx}').disabled = true;
            })();
          `;
        }
      });
      indectJavaScriptFun(fileIndex, jsCode);
    });

    isAllFilled();



  },[curLesson])

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

  // WebView에 자바스크립트 주입
  const indectJavaScriptFun = (fileIndex: number, jsCode: string) => {
    if (webviewRefs.current[fileIndex] && webviewRefs.current[fileIndex].current) {
      webviewRefs.current[fileIndex].current.injectJavaScript(jsCode);
    }
  }

  // 현재 파일의 첫번째 null 인덱스를 반환 (answers 구조에 맞게 수정)
  const getFirstNullIdx = (fileIndex: number) => {
    const answers = curLesson.sliders[curSlideIndex].modules[moduleIndex].files[fileIndex].answers;
    if (!answers || !Array.isArray(answers)) return -1;
    return answers.findIndex((ans: any) => ans.userAnswer === null);
  }

  // 옵션 클릭 시
  // 버튼 애니메이션 값 초기화
  const getButtonKey = (optionIndex: number) => `option-${optionIndex}`;
  
  const getButtonScale = (optionIndex: number) => {
    const key = getButtonKey(optionIndex);
    if (!buttonScales[key]) {
      buttonScales[key] = new Animated.Value(1);
    }
    return buttonScales[key];
  };

  const getButtonOpacity = (optionIndex: number) => {
    const key = getButtonKey(optionIndex);
    if (!buttonOpacities[key]) {
      buttonOpacities[key] = new Animated.Value(1);
    }
    return buttonOpacities[key];
  };

  // 버튼 효과 함수들
  const playButtonSound = () => {
    if (Platform.OS === 'ios') {
      console.log('버튼 사운드 재생');
    } else {
      Vibration.vibrate(50);
    }
  };

  const handleButtonPressIn = (optionIndex: number) => {
    const key = getButtonKey(optionIndex);
    setPressedButtons(prev => ({ ...prev, [key]: true }));
    
    const scale = getButtonScale(optionIndex);
    const opacity = getButtonOpacity(optionIndex);
    
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.95,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleButtonPressOut = (optionIndex: number) => {
    const key = getButtonKey(optionIndex);
    setPressedButtons(prev => ({ ...prev, [key]: false }));
    
    const scale = getButtonScale(optionIndex);
    const opacity = getButtonOpacity(optionIndex);
    
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleButtonPress = (option: any, optionIndex: number) => {
    const scale = getButtonScale(optionIndex);
    
    // 클릭 시 살짝 튀는 효과
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.05,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // 햅틱 피드백
    playButtonSound();
    
    // 기존 로직 실행
    onPressOption(option, optionIndex);
  };

  const onPressOption = (option: any, optionIndex: number) => {
    const firstNullIdx = getFirstNullIdx(activeTab);
    if (firstNullIdx === -1) return;

    // 깊은 복사로 새로운 lesson 구조 생성
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[curSlideIndex].modules];
    const newModule = { ...newModules[moduleIndex] };
    const newFiles = [...newModule.files];
    const newFile = { ...newFiles[activeTab] };

    // answers 배열 구조에 맞게 userAnswer 값 할당
    const newAnswers = newFile.answers ? [...newFile.answers] : [];
    if (newAnswers[firstNullIdx]) {
      newAnswers[firstNullIdx] = {
        ...newAnswers[firstNullIdx],
        userAnswer: option.value,
        optionElIndex: optionIndex,
      };
    };
    newFile.answers = newAnswers;


    // interactionOptions 배열 구조에 맞게 disabled 값 할당
    const newInteractionOptions = newFile.interactionOptions ? [...newFile.interactionOptions] : [];
    if (newInteractionOptions[optionIndex]) {
      newInteractionOptions[optionIndex] = {
        ...newInteractionOptions[optionIndex],
        disabled: true
      };
    };
    newFile.interactionOptions = newInteractionOptions;

    newFiles[activeTab] = newFile;
    newModule.files = newFiles;
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);

    isAllFilled();
  }

  // WebView에 주입할 자바스크립트
  const injectedJavaScript = `
    (function() {
      function sendInputInfo(e) {
        var el = e.target;
        if (el && el.tagName === 'INPUT') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'input_click',
            payload: {
              id: el.id,
              value: el.value,
              optionIndex: el.dataset ? el.dataset.optionIndex : undefined,
            }
          }));
        }
      }
      document.addEventListener('click', sendInputInfo, true);

      // style 태그를 동적으로 추가
      var style = document.createElement('style');
      style.type = 'text/css';
      style.innerHTML = \`
        pre {
          background: #272822;
          color: #fff;
          padding: 1rem;
          overflow-x: auto;
          font-size: 15px;
          font-family: 'Fira Mono', 'Menlo', monospace;
        }
        input.blank {
          width: auto;
          padding: 0 4px 0;
          border-radius: 6px;
          border: 1px solid #E5E5E5;
          outline: none;
          color: #4B4B4B;
          background: #fff;
          font-weight: 700;
          text-align: center;
        }
        input.blank.focus {
          background: #DDF4FF;
          border: 1px solid #84D8FF;
        }
        input.blank.correct {
          background: #D7FFB8b3;
          border: 1px solid #58CC02;
        }        
        input.blank.incorrect {
          background: #fee0e2b3;
          border: 1px solid #FE4C4A;
        }
      \`;
      document.head.appendChild(style);
    })();
    true;
  `

  // WebView에서 메시지 받았을 때
  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'input_click') {
        onMessageInputClick({...data.payload})
      }
    } catch (e) {
      // 일반 메시지
      console.log('[WebView message]', event.nativeEvent.data);
    }
  }

  // WebView input click 시 
  const onMessageInputClick = ({id, value, optionIndex}: {id: string, value?: string, optionIndex?: number}) => {
    if (!id || optionIndex === undefined || optionIndex === null) return;
    const blankIndex = Number(id.split('-')[1]);
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[curSlideIndex].modules];
    const newModule = { ...newModules[moduleIndex] };
    const newFiles = [...newModule.files];
    const newFile = { ...newFiles[activeTab] };

    // answers 배열의 해당 인덱스의 userAnswer를 null로 변경
    if (Array.isArray(newFile.answers) && newFile.answers[blankIndex]) {
      newFile.answers[blankIndex] = {
        ...newFile.answers[blankIndex],
        userAnswer: null,
      };
    }
    newFiles[activeTab] = newFile;
    newModule.files = newFiles;
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);
    isAllFilled();

    // interactionOptions의 disabled 해제
    curLesson.sliders[curSlideIndex].modules[moduleIndex].files[activeTab].interactionOptions[optionIndex].disabled = false;

  }


  const isAllFilled = () => {
    // 모든 파일의 answers의 userAnswer가 다 채워졌는지 확인
    const files = curLesson.sliders[curSlideIndex].modules[moduleIndex].files;
    const isAllFilled = files.every((file: any) => 
      Array.isArray(file.answers) && file.answers.every((ans: any) => ans.userAnswer !== null)
    );
    if (isAllFilled) {
      setIsNextButtonEnabled?.(true);
    } else {
      setIsNextButtonEnabled?.(false);
    }
  }


  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
      }}
    >
      {curLesson.sliders[curSlideIndex].modules[moduleIndex].title && (
      <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">{curLesson.sliders[curSlideIndex].modules[moduleIndex].title}</Text>
      )}
      <View className="border border-[#5e5e5e] rounded-[10px] overflow-hidden">
        {/* 탭 */}
        <View className="flex-row items-end gap-[10px] h-[26px] px-[10px] bg-[#3c3c3c]">
          <View className="flex-row items-center justify-center gap-[5px] h-full">
            {[...Array(3)].map((_, i) => (
              <View key={i} className="w-[10px] h-[10px] rounded-[10px] bg-[#545454]" />
            ))}
          </View>
          <View className="flex-row gap-[5px] flex-1">
            {curLesson.sliders[curSlideIndex].modules[moduleIndex].files.map((file: any, fileIndex: number) => (
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
              </View>
            ))}
          </View>
        </View>

        {/* 코드 미리보기 (WebView) - 모든 탭의 WebView를 미리 렌더링하고, activeTab만 보이게 */}
        <View style={{ height: webHeight }} className="bg-[#272822]">
          {curLesson.sliders[curSlideIndex].modules[moduleIndex].files.map((file: any, idx: number) => (
            <View
              key={`webview-${idx}`}
              style={{
                // display: activeTab === idx ? 'flex' : 'none',
                flex: 1,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: activeTab === idx ? 1 : 0,
                width: '100%',
                height: '100%',
                opacity: activeTab === idx ? 1 : 0,
              }}
              pointerEvents={activeTab === idx ? 'auto' : 'none'}
            >
              <WebView
                ref={webviewRefs.current[idx] || (webviewRefs.current[idx] = React.createRef<WebViewType>())}
                originWhitelist={['*']}
                source={{ uri: `${FRONT_URL}${file.url}` }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                onLoadStart={() => setIsLoading(true)}
                onLoad={() => {
                  setIsLoading(false);
                  onLoadComplete?.();
                }}
                onMessage={onMessage}
                injectedJavaScript={injectedJavaScript}
              />
              {isLoading && activeTab === idx && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#27282299', zIndex: 10 }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: '#fff', marginTop: 10 }}>로딩 중...</Text>
                </View>
              )}
            </View>
          ))}
        </View>

      </View>
      {/* 옵션 */}
      <View className="px-[10px] py-[8px] mt-[10px]">
        <View className="flex-row flex-wrap items-center justify-center gap-[12px]">
          {curLesson.sliders[curSlideIndex].modules[moduleIndex].files[activeTab].interactionOptions.map((option: any, index: number) => {
            const key = getButtonKey(index);
            const isPressed = pressedButtons[key] || false;
            
            return (
              <Animated.View
                key={`interaction-option-${index}`}
                style={{
                  transform: [{ scale: getButtonScale(index) }],
                  opacity: getButtonOpacity(index),
                }}
              >
                <Pressable
                  onPress={() => handleButtonPress(option, index)}
                  onPressIn={() => !option.disabled && handleButtonPressIn(index)}
                  onPressOut={() => !option.disabled && handleButtonPressOut(index)}
                  className={`
                    flex-row items-center justify-center gap-[5px] 
                    min-w-[30px]
                    p-[8px] 
                    border border-[#E5E5E5] rounded-[16px] 
                    ${option.disabled ? 'bg-[#E5E5E5]' : 'bg-[#fff]'}
                  `}
                  disabled={option.disabled}
                  style={{
                    shadowColor: option.disabled ? '#E5E5E5' : '#000',
                    shadowOffset: { width: 0, height: isPressed ? 1 : 2 },
                    shadowOpacity: option.disabled ? 0 : (isPressed ? 0.1 : 0.15),
                    shadowRadius: isPressed ? 2 : 4,
                    elevation: option.disabled ? 0 : (isPressed ? 2 : 4),
                  }}
                >
                  <Text className={`text-[16px] font-[500] ${option.disabled ? 'text-[#E5E5E5]' : 'text-[#4B4B4B]'}`}>
                    {option.value}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};