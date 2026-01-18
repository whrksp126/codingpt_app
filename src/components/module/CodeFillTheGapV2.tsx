import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable, Image, Animated, Easing, Vibration, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { assembleCodeHtml } from '../../utils/htmlAssembler';
import lessonService from '../../services/lessonService';

interface CodeFillTheGapProps {
  curSlideIndex: number;
  moduleIndex: number;
  curLesson: any;
  setCurLesson: (curLesson: any) => void;
  setIsNextButtonEnabled?: (isNextButtonEnabled: boolean) => void;
  onLoadComplete?: () => void;
  isActive?: boolean;
  isReviewMode?: boolean;
  onSubmitComplete?: (completedModuleId: number) => void;
}

export const CodeFillTheGapV2Component: React.FC<CodeFillTheGapProps> = ({ 
  onLoadComplete, 
  curSlideIndex, 
  moduleIndex, 
  curLesson, 
  setCurLesson, 
  setIsNextButtonEnabled, 
  isActive = true,
  isReviewMode: isReviewModeProp = false,
  onSubmitComplete,
}) => {
  // console.log(
  //   "🧩 CodeFillTheGap render",
  //   "slide:", curSlideIndex,
  //   "module:", moduleIndex,
  //   "isActive:", isActive
  // );
  
  const [activeTab, setActiveTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const webviewRefs = useRef<Array<React.RefObject<WebViewType | null>>>([]);
  // 각 WebView의 로드 완료 상태를 추적
  const [loadedWebviews, setLoadedWebviews] = useState<Set<number>>(new Set());
  // 백엔드에서 받은 텍스트를 저장할 상태 추가
  const [dbContent, setDbContent] = useState<string | null>(null);

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

  // 현재 모듈 데이터를 메모이제이션
  const currentModule = useMemo(() => {
    const module = curLesson.sliders[curSlideIndex]?.modules[moduleIndex];
    return curLesson.sliders[curSlideIndex]?.modules[moduleIndex];
  }, [curLesson.sliders, curSlideIndex, moduleIndex]);
  
  // 
  const currentFiles = useMemo(() => {
    if (dbContent) {
      return [{
        name: 'index.html',
        language: 'html',
        dbContent: dbContent, // 여기에 백엔드 데이터 주입
        answers: currentModule?.answers || [], // 정답 데이터 연결
        interactionOptions: currentModule?.interactionOptions || []
      }];
    }

    return [];
  }, [currentModule, dbContent]);

  // 각 파일의 assembledSource를 미리 계산 (map 내부에서 useMemo 사용 방지)
  const assembledSources = useMemo(() => {
    return currentFiles.map((file: any) => 
      assembleCodeHtml(file.dbContent || "")
    );
  }, [currentFiles]);

  const isReviewMode = useMemo(() => {
    return isReviewModeProp || currentModule?.readonly || false;
  }, [isReviewModeProp, currentModule]);

  // 현재 모듈에서 height 정보를 가져옴
  const initialHeight = useMemo(() => {
    return currentModule?.height || 220; // 데이터에 없으면 기본값 220
  }, [currentModule]);

  useEffect(() => {
    setWebHeight(initialHeight);
  }, [currentFiles]);

  // 현재 파일의 첫번째 null 인덱스를 반환 (메모이제이션된 값 사용)
  const getFirstNullIdx = useCallback((fileIndex: number) => {
    const answers = currentFiles[fileIndex]?.answers;
    if (!answers || !Array.isArray(answers)) return -1;
    const firstNullIdx = answers.findIndex((ans: any) => ans.userAnswer === null || ans.userAnswer === undefined);
    return firstNullIdx;
  }, [currentFiles]);

  // isAllFilled 함수를 useCallback으로 최적화
  const isAllFilled = useCallback(() => {
    // 복습 모드에서는 항상 버튼 활성화
    if (isReviewMode) {
      setIsNextButtonEnabled?.(true);
      return;
    }
    
    const allFilled = currentFiles.every((file: any) => 
      Array.isArray(file.answers) && file.answers.every((ans: any) => ans.userAnswer !== null && ans.userAnswer !== undefined)
    );
    
    setIsNextButtonEnabled?.(allFilled);
  }, [currentFiles, isReviewMode, setIsNextButtonEnabled]);

  // 특정 파일의 답을 채우는 함수
  const fillAnswersForFile = useCallback((fileIndex: number) => {
    const file = currentFiles[fileIndex];
    if (!file) return;

    let jsCode = '';
    // 초기화 시 모두 제거
    jsCode += `
      (function() {
        document.querySelectorAll('input').forEach(el => el.classList.remove('focus', 'filled', 'correct', 'incorrect'));
      })();
    `;

    // 첫번째 빈칸 포커스 (복습 모드가 아닌 경우에만)
    const firstNullIdx = getFirstNullIdx(fileIndex);
    if (firstNullIdx !== -1 && !isReviewMode && fileIndex === activeTab) {
      jsCode += `
        (function() {
          document.getElementById('blank-${firstNullIdx}').classList.add('focus');
        })();
      `;
    }

    file.answers.forEach((ansObj: any, ansIdx: number) => {
      // 빈칸에 값 채우기 (userAnswer가 null이 아닌 경우에만)
      if (ansObj.userAnswer !== null && ansObj.userAnswer !== undefined) {
        jsCode += `
          (function() {
            var el = document.getElementById('blank-${ansIdx}');
            if (el) {
              el.value = '${ansObj.userAnswer}';
              el.classList.add('filled');
              el.dataset.optionIndex = '${ansObj.optionElIndex || ''}';
              var event = new Event('input', { bubbles: true });
              el.dispatchEvent(event);
            }
          })();
        `;
      } else {
        // userAnswer가 null인 경우 빈칸을 비우기
        jsCode += `
          (function() {
            var el = document.getElementById('blank-${ansIdx}');
            if (el) {
              el.value = '';
              el.dataset.optionIndex = '';
              el.classList.remove('filled');
            }
          })();
        `;
      }

      // 정답 여부에 따라 클래스 적용 (복습 모드이거나 채점 완료된 경우)
      const isGraded = ansObj.isCorrect !== null && ansObj.isCorrect !== undefined;
      if (isReviewMode || isGraded) {
        const className = ansObj.isCorrect ? 'correct' : 'incorrect';
        jsCode += `
          (function() {
            var el = document.getElementById('blank-${ansIdx}');
            if (el) {
              el.classList.remove('focus', 'correct', 'incorrect');
              el.classList.add('${className}');
              el.disabled = true;
              el.readOnly = true;
            }
          })();
        `;
      }
    });

    indectJavaScriptFun(fileIndex, jsCode);
  }, [currentFiles, activeTab, isReviewMode, getFirstNullIdx]);

  // 2. 데이터 가져오는 useEffect 추가
  useEffect(() => {
    const fetchContent = async () => {
      const slideId = currentModule?.slideId;
      if (slideId) {
        try {
          setIsLoading(true);
          const content = await lessonService.getSlideCodeFillContent(slideId);
          setDbContent(content);
        } catch (error) {
          console.error("데이터 로드 실패:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchContent();
  }, [currentModule?.slideId]); // slideId가 변경될 때마다 실행

  // 의존성을 세밀하게 조정하여 불필요한 재실행 방지
  useEffect(()=> {
    if (!isActive) return; // ✅ 비활성 상태에서는 실행하지 않음
    
    // 메모이제이션된 값 사용
    currentFiles.forEach((file: any, fileIndex: number) => {
      // WebView가 로드되지 않았으면 실행하지 않음
      if (!loadedWebviews.has(fileIndex)) return;
      
      fillAnswersForFile(fileIndex);
    });

    isAllFilled();

  // 메모이제이션된 값으로 의존성 설정
  },[ currentFiles, activeTab, isActive, isReviewMode, isAllFilled, loadedWebviews, fillAnswersForFile ])

  // 애니메이션 시간 단축 및 지연 제거
  useEffect(() => {
    if (!isActive) {
      // 비활성화될 때는 애니메이션 초기 상태로 돌려놓기만 함
      setIsVisible(false);
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      scaleAnim.setValue(0.95);
      return;
    }

    // 지연 시간 제거 (100ms -> 즉시 실행)
    setIsVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300, // 800ms -> 300ms로 단축
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 120, // 더 빠른 스프링 (80 -> 120)
        friction: 10, // 더 빠른 감쇠 (8 -> 10)
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 150, // 더 빠른 스프링 (100 -> 150)
        friction: 8, // 더 빠른 감쇠 (6 -> 8)
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, fadeAnim, slideAnim, scaleAnim]);

  // WebView에 자바스크립트 주입
  const indectJavaScriptFun = (fileIndex: number, jsCode: string) => {
    if (webviewRefs.current[fileIndex] && webviewRefs.current[fileIndex].current) {
      webviewRefs.current[fileIndex].current.injectJavaScript(jsCode);
    }
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
    
    onPressOption(option, optionIndex);
  };

  const onPressOption = (option: any, optionIndex: number) => {
    const firstNullIdx = getFirstNullIdx(activeTab);
    if (firstNullIdx === -1) return;
  
    // 1. 깊은 복사로 상태 준비
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[curSlideIndex].modules];
    const newModule = { ...newModules[moduleIndex] };
  
    let newAnswers = [];
    let newOptions = [];
  
    // 2. V1(files 배열 있음) vs V2(files 없이 직접 answers 있음) 대응
    if (newModule.files && newModule.files[activeTab]) {
      const newFiles = [...newModule.files];
      const newFile = { ...newFiles[activeTab] };
      newAnswers = [...(newFile.answers || [])];
      newOptions = [...(newFile.interactionOptions || [])];
  
      if (newAnswers[firstNullIdx]) {
        newAnswers[firstNullIdx] = {
          ...newAnswers[firstNullIdx],
          userAnswer: option.value,
          optionElIndex: optionIndex,
        };
      }
      
      // 🔹 자동 채점 로직 추가
      const allFilled = newAnswers.every(ans => ans.userAnswer !== null && ans.userAnswer !== undefined);
      if (allFilled) {
        newAnswers = newAnswers.map(ans => ({
          ...ans,
          isCorrect: ans.userAnswer?.trim() === ans.correctAnswer?.trim() // 값 비교
        }));
        
        onSubmitComplete?.(newModule.id);
        // 모든 빈칸이 채워지고 채점이 완료되면 onSubmitComplete 호출
        setTimeout(() => {
        }, 500); // 채점 애니메이션을 위한 약간의 지연
      }
  
      if (newOptions[optionIndex]) newOptions[optionIndex].disabled = true;
  
      newFile.answers = newAnswers;
      newFile.interactionOptions = newOptions;
      newFiles[activeTab] = newFile;
      newModule.files = newFiles;
    } else {
      // V2 구조 처리 (현재 code_fill_test.json 구조)
      newAnswers = [...(newModule.answers || [])];
      newOptions = [...(newModule.interactionOptions || [])];
  
      if (newAnswers[firstNullIdx]) {
        newAnswers[firstNullIdx] = {
          ...newAnswers[firstNullIdx],
          userAnswer: option.value,
          optionElIndex: optionIndex,
        };
      }
  
      // 🔹 자동 채점 로직 추가
      const allFilled = newAnswers.every(ans => ans.userAnswer !== null && ans.userAnswer !== undefined);
      if (allFilled) {
        newAnswers = newAnswers.map(ans => ({
          ...ans,
          isCorrect: ans.userAnswer?.trim() === ans.correctAnswer?.trim()
        }));
        
        // 모든 빈칸이 채워지고 채점이 완료되면 onSubmitComplete 호출
        setTimeout(() => {
          onSubmitComplete?.(newModule.id);
        }, 500); // 채점 애니메이션을 위한 약간의 지연
      }
  
      if (newOptions[optionIndex]) newOptions[optionIndex].disabled = true;
  
      newModule.answers = newAnswers;
      newModule.interactionOptions = newOptions;
    }
  
    // 3. 상태 업데이트
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);
  
    // 상위 버튼 활성화 체크
    isAllFilled();
  };

  // WebView에 주입할 자바스크립트
  const injectedJavaScript = `
    (function() {
      function sendInputInfo(e) {
        var el = e.target;
        if (el && el.tagName === 'INPUT') {
          // 복습 모드에서는 클릭 이벤트를 차단
          if (el.disabled || el.readOnly) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
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

  // WebView input click 시 (메모이제이션된 값 사용)
  const onMessageInputClick = ({ id, value, optionIndex }: { id: string, value?: string, optionIndex?: number }) => {
    if (isReviewMode) return;
    if (!id || optionIndex === undefined || optionIndex === null) return;
    
    const blankIndex = Number(id.split('-')[1]);
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[curSlideIndex].modules];
    const newModule = { ...newModules[moduleIndex] };
  
    if (newModule.files && newModule.files[activeTab]) {
      // V1 구조 처리
      const newFiles = [...newModule.files];
      const newFile = { ...newFiles[activeTab] };
      const newAnswers = [...(newFile.answers || [])];
      const newOptions = [...(newFile.interactionOptions || [])];
  
      if (newAnswers[blankIndex]) newAnswers[blankIndex] = { ...newAnswers[blankIndex], userAnswer: null };
      if (newOptions[optionIndex]) newOptions[optionIndex] = { ...newOptions[optionIndex], disabled: false };
  
      newFile.answers = newAnswers;
      newFile.interactionOptions = newOptions;
      newFiles[activeTab] = newFile;
      newModule.files = newFiles;
    } else {
      // V2 구조 처리
      const newAnswers = [...(newModule.answers || [])];
      const newOptions = [...(newModule.interactionOptions || [])];
  
      if (newAnswers[blankIndex]) newAnswers[blankIndex] = { ...newAnswers[blankIndex], userAnswer: null };
      if (newOptions[optionIndex]) newOptions[optionIndex] = { ...newOptions[optionIndex], disabled: false };
  
      newModule.answers = newAnswers;
      newModule.interactionOptions = newOptions;
    }
  
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);
    isAllFilled();
  };

  return (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim }
          ],
        },
        !isActive && {
          height: 0,
          opacity: 0,
          marginTop: 0,
          marginBottom: 0,
          pointerEvents: 'none' as const,
        },
      ]}
    >
      {/* 메모이제이션된 값 사용 */}
      {currentModule?.title && (
        <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">
          {currentModule.title}
        </Text>
      )}
      <View className="bg-Background-Black_Base rounded-[16px] overflow-hidden">
        {/* 헤더 영역 */}
        <View className="flex-row items-center gap-[6px] h-[30px] p-[16px]">
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Danger-Pressed-900" />
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Warning-Pressed-900" />
          <View className="w-[10px] h-[10px] rounded-[10px] bg-Success-Pressed-900" />
        </View>
        {/* 코드 미리보기 (WebView) - 모든 탭의 WebView를 미리 렌더링하고, activeTab만 보이게 */}
        <View style={{ height: webHeight }}>
          {currentFiles.map((file: any, idx: number) => {
            return (
              <View key={`webview-${idx}`} className="flex-1">
                <WebView
                  ref={webviewRefs.current[idx] || (webviewRefs.current[idx] = React.createRef<WebViewType>())}
                  originWhitelist={['*']}
                  // 🔹 핵심 변경 부분: URI 대신 조립된 HTML 직접 주입
                  source={{ 
                    html: assembledSources[idx] || "",
                    baseUrl: '' // 로컬 리소스가 없으므로 비워둠
                  }}
                  style={{ flex: 1, backgroundColor: 'transparent' }}
                  scrollEnabled={true}
                  onLoad={() => {
                    setIsLoading(false);
                    setLoadedWebviews(prev => new Set(prev).add(idx));
                    onLoadComplete?.();
                    
                    // 로딩 즉시 답 채우기 (로컬 로딩이므로 지연시간 단축 가능)
                    setTimeout(() => fillAnswersForFile(idx), 100);
                  }}
                  onMessage={onMessage}
                  injectedJavaScript={injectedJavaScript}
                />
              </View>
            );
          })}
        </View>

      </View>
      {/* 옵션 */}
      {/* 메모이제이션된 값 사용 */}
      {!isReviewMode && (
        <View className="px-[10px] py-[8px] mt-[10px]">
          <View className="flex-row flex-wrap items-center justify-center gap-[12px]">
            {currentFiles[activeTab]?.interactionOptions?.map((option: any, index: number) => {
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
                      flex-row items-center justify-center 
                      min-w-[30px]
                      px-[12px] py-[8px] 
                      rounded-[8px]
                      ${option.disabled ? 'bg-[#F1F3F9]' : 'bg-[#E02D3C]'}
                    `}
                    disabled={option.disabled}
                  >
                    <Text className={`text-[14px] font-[700] ${option.disabled ? 'text-[#F1F3F9]' : 'text-[#FFFFFF]'}`}>
                      {option.value}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}
    </Animated.View>
  );
};