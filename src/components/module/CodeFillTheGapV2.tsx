import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import Animated from 'react-native-reanimated';
import { assembleCodeHtml } from '../../utils/htmlAssembler';
import { composeCodeFillContent } from '../../utils/codeFillCompose';
import lessonService from '../../services/lessonService';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';
import OpenIdeButton from './ide/OpenIdeButton';

const FillGapOptionButton: React.FC<{
  option: any;
  onPress: () => void;
  isReviewMode: boolean;
}> = ({ option, onPress, isReviewMode }) => {
  const { style, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.95 });
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          if (option.disabled || isReviewMode) return;
          haptic.light();
          onPress();
        }}
        onPressIn={() => {
          if (!option.disabled) onPressIn();
        }}
        onPressOut={() => {
          if (!option.disabled) onPressOut();
        }}
        className={`
          flex-row items-center justify-center
          min-w-[30px]
          px-[12px] py-[8px]
          rounded-[8px]
          ${option.disabled ? 'bg-[#F1F3F9]' : 'bg-[#E02D3C]'}
        `}
        disabled={option.disabled}
      >
        <Text
          className={`text-[14px] font-[700] ${option.disabled ? 'text-[#F1F3F9]' : 'text-[#FFFFFF]'}`}
        >
          {option.value}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

interface CodeFillTheGapProps {
  curSlideIndex: number;
  moduleIndex: number;
  curLesson: any;
  setCurLesson: (curLesson: any) => void;
  setIsNextButtonEnabled?: (isNextButtonEnabled: boolean) => void;
  onLoadComplete?: () => void;
  isActive?: boolean;
  isReviewMode?: boolean;
  onSubmitComplete?: (completedModuleId: number, isCorrect?: boolean) => void;
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

  const [webHeight, setWebHeight] = useState(220);

  // 틀린 답이 있는지 추적하는 상태
  const [hasIncorrectAnswers, setHasIncorrectAnswers] = useState(false);

  // 현재 모듈 데이터를 메모이제이션
  const currentModule = useMemo(() => {
    const module = curLesson.sliders[curSlideIndex]?.modules[moduleIndex];
    return curLesson.sliders[curSlideIndex]?.modules[moduleIndex];
  }, [curLesson.sliders, curSlideIndex, moduleIndex]);

  //
  const currentFiles = useMemo(() => {
    // 1순위: 모듈 데이터의 plainCode + blanks 로 즉시 합성
    //   - 어드민이 별도 code_fill_gap 테이블에 저장하기 전(또는 저장 실패)이라도 빈칸 채우기 동작
    // 2순위: 레거시 데이터 (code_fill_gap.content) — slide.contents 에 plainCode 가 없는 구버전 슬라이드용
    const plainCode = currentModule?.plainCode;
    const blanks = currentModule?.blanks;
    const language = currentModule?.language || 'html';
    let composed = '';
    if (typeof plainCode === 'string' && plainCode.length > 0 && Array.isArray(blanks)) {
      composed = composeCodeFillContent(plainCode, blanks);
    } else if (dbContent) {
      composed = dbContent;
    }

    if (!composed) return [];

    return [{
      name: 'index.html',
      language,
      dbContent: composed,
      answers: currentModule?.answers || [],
      interactionOptions: currentModule?.interactionOptions || []
    }];
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
              el.dataset.optionIndex = '${ansObj.optionElIndex !== null && ansObj.optionElIndex !== undefined ? ansObj.optionElIndex : ''}';
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
      const requireAllCorrect = currentModule?.requireAllCorrect || false;

      if (isReviewMode || isGraded) {
        const className = ansObj.isCorrect ? 'correct' : 'incorrect';
        // requireAllCorrect이고 틀린 답인 경우 클릭은 가능하지만 타이핑은 막기 위해 readOnly는 항상 true
        const shouldDisable = isReviewMode || (ansObj.isCorrect === true) || !requireAllCorrect;
        // requireAllCorrect이고 틀린 답인 경우: disabled=false, readOnly=true (클릭 가능, 타이핑 불가)
        const shouldDisableInput = isReviewMode || (ansObj.isCorrect === true) || !requireAllCorrect;

        jsCode += `
          (function() {
            var el = document.getElementById('blank-${ansIdx}');
            if (el) {
              el.classList.remove('focus', 'correct', 'incorrect');
              el.classList.add('${className}');
              el.disabled = ${shouldDisableInput};
              el.readOnly = true; // 항상 readOnly로 설정하여 직접 타이핑 방지
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
  useEffect(() => {
    if (!isActive) return; // ✅ 비활성 상태에서는 실행하지 않음

    // 메모이제이션된 값 사용
    currentFiles.forEach((file: any, fileIndex: number) => {
      // WebView가 로드되지 않았으면 실행하지 않음
      if (!loadedWebviews.has(fileIndex)) return;

      fillAnswersForFile(fileIndex);
    });

    isAllFilled();

    // 메모이제이션된 값으로 의존성 설정
  }, [currentFiles, activeTab, isActive, isReviewMode, isAllFilled, loadedWebviews, fillAnswersForFile])


  // WebView에 자바스크립트 주입
  const indectJavaScriptFun = (fileIndex: number, jsCode: string) => {
    if (webviewRefs.current[fileIndex] && webviewRefs.current[fileIndex].current) {
      webviewRefs.current[fileIndex].current.injectJavaScript(jsCode);
    }
  }

  const handleButtonPress = (option: any, optionIndex: number) => {
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
      // 채점은 하단 액션 바의 "채점하기" 버튼이 담당 (부모 handleQuizGrade).
      // 여기서는 입력만 반영하고 자동 채점/onSubmitComplete 는 호출하지 않는다.

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
      // 채점은 하단 액션 바의 "채점하기" 버튼이 담당 (부모 handleQuizGrade).
      // 여기서는 입력만 반영하고 자동 채점/onSubmitComplete 는 호출하지 않는다.

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

  // WebView에서 메시지 받았을 때
  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'input_click') {
        onMessageInputClick({ ...data.payload })
      }
    } catch (e) {
      // 일반 메시지 (JSON이 아닌 경우)
      console.log('[WebView message]', event.nativeEvent.data);
    }
  }

  // WebView input click 시 (메모이제이션된 값 사용)
  const onMessageInputClick = ({ id, value, optionIndex }: { id: string, value?: string, optionIndex?: number }) => {
    if (isReviewMode) return;
    if (!id || optionIndex === undefined || optionIndex === null) return;

    // optionIndex를 숫자로 변환 (dataset에서는 문자열로 전달됨)
    const parsedOptionIndex = typeof optionIndex === 'string' ? parseInt(optionIndex, 10) : optionIndex;

    // optionIndex가 유효한 숫자가 아니면 return (빈칸이 비어있거나 유효하지 않은 경우)
    if (typeof parsedOptionIndex !== 'number' || isNaN(parsedOptionIndex)) {
      return;
    }

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

      if (newAnswers[blankIndex]) {
        newAnswers[blankIndex] = {
          ...newAnswers[blankIndex],
          userAnswer: null,
          isCorrect: null  // 채점 상태도 초기화
        };
      }
      if (newOptions[parsedOptionIndex]) newOptions[parsedOptionIndex] = { ...newOptions[parsedOptionIndex], disabled: false };

      newFile.answers = newAnswers;
      newFile.interactionOptions = newOptions;
      newFiles[activeTab] = newFile;
      newModule.files = newFiles;
    } else {
      // V2 구조 처리
      const newAnswers = [...(newModule.answers || [])];
      const newOptions = [...(newModule.interactionOptions || [])];

      if (newAnswers[blankIndex]) {
        newAnswers[blankIndex] = {
          ...newAnswers[blankIndex],
          userAnswer: null,
          isCorrect: null  // 채점 상태도 초기화
        };
      }
      if (newOptions[parsedOptionIndex]) newOptions[parsedOptionIndex] = { ...newOptions[parsedOptionIndex], disabled: false };

      newModule.answers = newAnswers;
      newModule.interactionOptions = newOptions;
    }

    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);
    isAllFilled();

    // 답을 취소했으므로 경고 상태 해제
    setHasIncorrectAnswers(false);
  };

  return (
    <View
      style={
        !isActive
          ? {
              height: 0,
              opacity: 0,
              marginTop: 0,
              marginBottom: 0,
              pointerEvents: 'none' as const,
            }
          : undefined
      }
    >
      {/* 메모이제이션된 값 사용 */}
      {currentModule?.title && (
        <Text className="mb-[20px] text-[#111] text-[16px] font-[700]">
          {currentModule.title}
        </Text>
      )}
      <View className="bg-Background-Black_Base rounded-[16px] overflow-hidden">
        {/* 헤더 영역 */}
        <View className="w-full flex-row items-center justify-between px-[16px] py-[8px]">
          <View className="flex-row items-center gap-[6px]">
            <View className="w-[10px] h-[10px] rounded-[10px] bg-Danger-Pressed-900" />
            <View className="w-[10px] h-[10px] rounded-[10px] bg-Warning-Pressed-900" />
            <View className="w-[10px] h-[10px] rounded-[10px] bg-Success-Pressed-900" />
          </View>
          <OpenIdeButton module={currentModule} />
        </View>
        {/* 코드 미리보기 (WebView) - 모든 탭의 WebView를 미리 렌더링하고, activeTab만 보이게 */}
        <View style={{ height: webHeight }}>
          {currentFiles.map((file: any, idx: number) => {
            return (
              <View key={`webview-${idx}`} className="flex-1">
                <WebView
                  ref={webviewRefs.current[idx] || (webviewRefs.current[idx] = React.createRef<WebViewType>())}
                  originWhitelist={['*']}
                  androidLayerType="software"
                  javaScriptEnabled={true}
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
            {currentFiles[activeTab]?.interactionOptions?.map((option: any, index: number) => (
              <FillGapOptionButton
                key={`interaction-option-${index}`}
                option={option}
                isReviewMode={isReviewMode}
                onPress={() => handleButtonPress(option, index)}
              />
            ))}
          </View>
        </View>
      )}

      {/* 틀린 답이 있을 때 경고 문구 */}
      {hasIncorrectAnswers && !isReviewMode && (
        <View className="mt-[16px] px-[16px] py-[12px] bg-[#FEF1F2] rounded-[12px] border border-[#FCC8CD]">
          <Text className="text-[14px] font-[600] text-[#E02D3C] text-center">
            틀린 답이 있어요. 다시 한번 확인해보세요! 🤔
          </Text>
        </View>
      )}
    </View>
  );
};