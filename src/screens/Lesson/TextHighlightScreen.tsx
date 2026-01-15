import React, { useState, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import * as SvgIcons from '../../assets/SvgIcon';

import { htmlTagsStyles, classesStyles } from '../../../src/utils/htmlStyles'

// const moduleData = {
//   "id": 0,
//   "type": "paragraph",
//   "icon": {
//     "name": "KeyReturn",
//     "size": 32,
//     "fill": "#08875D",
//     "backgroundSize": 64,
//     "backgroundColor": "#EDFDF8"
//   },
//   "content": "<h2 class=\"text-center\"><span class=\"success-700\">HTML</span>이란 무엇인가?</h2>",
//   "tts": {
//     "url": "https://s3.ghmate.com/codingpt/tts/static/lesson-id-00000001/00000001.mp3",
//     "timestamps": {
//       "version": "1.0",
//       "total_duration": 1.758,
//       "alignment": {
//         "words": [
//           { "word": "HTML이란", "start": 0, "end": 1.04, "confidence": 1 },
//           { "word": "무엇인가?", "start": 1.146, "end": 1.758, "confidence": 1 }
//         ],
//         "characters": [
//           {
//             "char": "H",
//             "start": 0,
//             "end": 0.16
//           },
//           {
//             "char": "T",
//             "start": 0.16,
//             "end": 0.32
//           },
//           {
//             "char": "M",
//             "start": 0.32,
//             "end": 0.48
//           },
//           {
//             "char": "L",
//             "start": 0.48,
//             "end": 0.64
//           },
//           {
//             "char": "이",
//             "start": 0.64,
//             "end": 0.72
//           },
//           {
//             "char": "란",
//             "start": 0.72,
//             "end": 1.04
//           },
//           {
//             "char": " ",
//             "start": 1.04,
//             "end": 1.146
//           },
//           {
//             "char": "무",
//             "start": 1.146,
//             "end": 1.252
//           },
//           {
//             "char": "엇",
//             "start": 1.252,
//             "end": 1.358
//           },
//           {
//             "char": "인",
//             "start": 1.358,
//             "end": 1.518
//           },
//           {
//             "char": "가",
//             "start": 1.518,
//             "end": 1.678
//           },
//           {
//             "char": "?",
//             "start": 1.678,
//             "end": 1.758
//           }
//         ]
//       }
//     }
//   },
//   "visibility": {
//     "type": "duration",
//     "time": 5000
//   }
// };

// --------------------------------------------------------------------------
// 3. 파서 로직 (Words/Characters 단위 매핑 + 정교한 HTML 파싱)
// --------------------------------------------------------------------------

const moduleData = {
  "id": 0,
  "type": "paragraph",
  "icon": {
    "name": "KeyReturn",
    "size": 32,
    "fill": "#08875D",
    "backgroundSize": 64,
    "backgroundColor": "#EDFDF8"
  },
  "content": "<p class=\"semibold-15\">이게 뭐야..? 웹사이트는 그냥… <br>누가 알아서 만들어주는 거 아니에요?</p>",
  "tts": {
    "url": "https://s3.ghmate.com/codingpt/tts/static/lesson-id-00000001/이게_뭐야_웹사이트는_그냥_누가_알아서_만들어주는_거_아니에요.mp3",
    "timestamps": {
      "total_duration": 4.554,
      "version": "1.0",
      "alignment": {
        "characters": [
          {
            "char": "이",
            "start": 0,
            "end": 0.16
          },
          {
            "char": "게",
            "start": 0.16,
            "end": 0.24
          },
          {
            "char": " ",
            "start": 0.24,
            "end": 0.36
          },
          {
            "char": "뭐",
            "start": 0.36,
            "end": 0.48
          },
          {
            "char": "야",
            "start": 0.48,
            "end": 0.64
          },
          {
            "char": ".",
            "start": 0.64,
            "end": 0.853
          },
          {
            "char": ".",
            "start": 0.853,
            "end": 1.066
          },
          {
            "char": ".",
            "start": 1.066,
            "end": 1.279
          },
          {
            "char": "?",
            "start": 1.279,
            "end": 1.519
          },
          {
            "char": " ",
            "start": 1.519,
            "end": 1.567
          },
          {
            "char": "웹",
            "start": 1.567,
            "end": 1.615
          },
          {
            "char": "사",
            "start": 1.615,
            "end": 1.663
          },
          {
            "char": "이",
            "start": 1.663,
            "end": 1.711
          },
          {
            "char": "트",
            "start": 1.711,
            "end": 1.759
          },
          {
            "char": "는",
            "start": 1.759,
            "end": 1.839
          },
          {
            "char": " ",
            "start": 1.839,
            "end": 1.972
          },
          {
            "char": "그",
            "start": 1.972,
            "end": 2.105
          },
          {
            "char": "냥",
            "start": 2.105,
            "end": 2.238
          },
          {
            "char": ".",
            "start": 2.238,
            "end": 2.398
          },
          {
            "char": ".",
            "start": 2.398,
            "end": 2.558
          },
          {
            "char": ".",
            "start": 2.558,
            "end": 2.718
          },
          {
            "char": " ",
            "start": 2.718,
            "end": 2.798
          },
          {
            "char": "누",
            "start": 2.798,
            "end": 2.878
          },
          {
            "char": "가",
            "start": 2.878,
            "end": 2.958
          },
          {
            "char": " ",
            "start": 2.958,
            "end": 3.064
          },
          {
            "char": "알",
            "start": 3.064,
            "end": 3.17
          },
          {
            "char": "아",
            "start": 3.17,
            "end": 3.276
          },
          {
            "char": "서",
            "start": 3.276,
            "end": 3.356
          },
          {
            "char": " ",
            "start": 3.356,
            "end": 3.456
          },
          {
            "char": "만",
            "start": 3.456,
            "end": 3.556
          },
          {
            "char": "들",
            "start": 3.556,
            "end": 3.656
          },
          {
            "char": "어",
            "start": 3.656,
            "end": 3.756
          },
          {
            "char": "주",
            "start": 3.756,
            "end": 3.836
          },
          {
            "char": "는",
            "start": 3.836,
            "end": 3.916
          },
          {
            "char": " ",
            "start": 3.916,
            "end": 3.956
          },
          {
            "char": "거",
            "start": 3.956,
            "end": 3.996
          },
          {
            "char": " ",
            "start": 3.996,
            "end": 4.102
          },
          {
            "char": "아",
            "start": 4.102,
            "end": 4.208
          },
          {
            "char": "니",
            "start": 4.208,
            "end": 4.314
          },
          {
            "char": "에",
            "start": 4.314,
            "end": 4.394
          },
          {
            "char": "요",
            "start": 4.394,
            "end": 4.474
          },
          {
            "char": "?",
            "start": 4.474,
            "end": 4.554
          }
        ],
        "words": [
          {
            "word": "이게",
            "start": 0,
            "end": 0.24,
            "confidence": 1
          },
          {
            "word": "뭐야...?",
            "start": 0.36,
            "end": 1.519,
            "confidence": 1
          },
          {
            "word": "웹사이트는",
            "start": 1.567,
            "end": 1.839,
            "confidence": 1
          },
          {
            "word": "그냥...",
            "start": 1.972,
            "end": 2.718,
            "confidence": 1
          },
          {
            "word": "누가",
            "start": 2.798,
            "end": 2.958,
            "confidence": 1
          },
          {
            "word": "알아서",
            "start": 3.064,
            "end": 3.356,
            "confidence": 1
          },
          {
            "word": "만들어주는",
            "start": 3.456,
            "end": 3.916,
            "confidence": 1
          },
          {
            "word": "거",
            "start": 3.956,
            "end": 3.996,
            "confidence": 1
          },
          {
            "word": "아니에요?",
            "start": 4.102,
            "end": 4.554,
            "confidence": 1
          }
        ]
      }
    }
  },
  "visibility": {
    "type": "duration",
    "time": 5000
  }
};

const normalizeText = (text: string) => {
  return text.normalize('NFKC').toLowerCase().replace(/[^\w\s\uAC00-\uD7A3]/g, '').replace(/\s/g, '');
};

const parseHtmlAndMapAlignment = (html: string, alignmentData: any[], mode: 'word' | 'char') => {
  const result: any[] = [];

  // 1. 태그와 텍스트를 분리하는 정규식
  const regex = /<\s*(\/)?\s*([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match;
  let styleStack: any[] = [htmlTagsStyles.body || {}];

  // 임시 노드 저장소
  const fineGrainedNodes: any[] = [];

  while ((match = regex.exec(html)) !== null) {
    const isClosingTag = !!match[1];
    const tagName = match[2]?.toLowerCase();
    const attributes = match[3];
    const textContent = match[4];

    if (tagName) {
      if (tagName === 'br') {
        fineGrainedNodes.push({ text: '\n', style: {}, isBreak: true });
      } else if (isClosingTag) {
        if (styleStack.length > 1) styleStack.pop();
      } else {
        let newStyle = { ...styleStack[styleStack.length - 1] };
        if (htmlTagsStyles[tagName]) newStyle = { ...newStyle, ...htmlTagsStyles[tagName] };
        if (attributes && attributes.includes('class=')) {
          const classMatch = attributes.match(/class=["']([^"']+)["']/);
          if (classMatch && classMatch[1]) {
            const classNames = classMatch[1].split(' ');
            classNames.forEach((cls: string) => {
              if (classesStyles[cls]) newStyle = { ...newStyle, ...classesStyles[cls] };
            });
          }
        }
        styleStack.push(newStyle);
      }
    } else if (textContent) {
      if (mode === 'word') {
        // 단어 모드: 공백 기준으로 나눔
        const parts = textContent.split(/(\s+)/);
        parts.forEach(part => {
          if (part.length === 0) return;
          fineGrainedNodes.push({
            text: part,
            style: styleStack[styleStack.length - 1],
            isBreak: false
          });
        });
      } else {
        // 글자 모드: 모든 글자를 하나씩 나눔 (공백 포함)
        for (let i = 0; i < textContent.length; i++) {
          fineGrainedNodes.push({
            text: textContent[i],
            style: styleStack[styleStack.length - 1],
            isBreak: false
          });
        }
      }
    }
  }

  // 2. 쪼개진 노드들과 Alignment 데이터 매핑
  let currentIndex = 0;

  for (let i = 0; i < fineGrainedNodes.length; i++) {
    const node = fineGrainedNodes[i];

    if (node.isBreak) {
      result.push({ ...node, start: 0 });
      continue;
    }

    // 공백 처리 또는 매칭 필요 없는 노드 (심볼, 특수문자 등)
    const cleanNodeText = normalizeText(node.text);
    if (!cleanNodeText) {
      if (mode === 'char' && currentIndex < alignmentData.length) {
        // 1. node.text 자체를 확장(Normalize)해서 체크
        // 예: "…" -> "..." (3글자)
        // 예: " " -> " " (1글자)
        const normalizedRaw = node.text.normalize('NFKC');
        let tempIndex = currentIndex;
        let matchedCount = 0;
        let firstMatchStart = -1;
        let isMatchSuccess = true;

        for (const char of normalizedRaw) {
          // JSON 데이터 상의 공백 스킵 (단, 찾으려는 문자가 공백이 아닐 때만)
          if (char !== ' ') {
            while (tempIndex < alignmentData.length && (alignmentData[tempIndex].char === ' ' || alignmentData[tempIndex].char === '')) {
              tempIndex++;
            }
          }

          if (tempIndex >= alignmentData.length) {
            isMatchSuccess = false;
            break;
          }

          // 현재 JSON 문자와 비교
          if (alignmentData[tempIndex].char === char) {
            if (firstMatchStart === -1) firstMatchStart = alignmentData[tempIndex].start;
            tempIndex++;
            matchedCount++;
          } else {
            // 매칭 실패 시 Lookahead 시도 (JSON에 불필요한 기호가 끼어있는 경우 스킵)
            // 예: HTML ".." vs JSON "..." -> JSON의 점 하나를 건너뜀
            if (tempIndex + 1 < alignmentData.length && alignmentData[tempIndex + 1].char === char) {
              // 하나 건너뛰고 매칭 성공으로 간주
              tempIndex++; // Skip the bad one

              if (firstMatchStart === -1) firstMatchStart = alignmentData[tempIndex].start;
              tempIndex++; // Consume the good one
              matchedCount++;
            } else {
              // 매칭 실패
              isMatchSuccess = false;
              break;
            }
          }
        }

        if (isMatchSuccess && matchedCount > 0) {
          // 매칭 성공: 인덱스 업데이트하고 결과 푸시
          result.push({ ...node, start: firstMatchStart });
          currentIndex = tempIndex;
        } else {
          // 매칭 실패 (단순 공백이거나 다른 알 수 없는 기호)
          // 기존 로직(Fallback): 
          // 그냥 현재 인덱스의 시간만 가져오되, 인덱스는 증가시키지 않음(안전장치)
          // 단, 정말 단순 공백 노드이고 JSON도 공백이면 하나 소비
          const currentAlignChar = alignmentData[currentIndex].char;
          if ((currentAlignChar === ' ' || currentAlignChar === '') && (node.text === ' ' || node.text === '\n')) {
            // 단순 공백 매칭
            result.push({ ...node, start: alignmentData[currentIndex].start });
            currentIndex++;
          } else {
            // 매칭 불가: 시간만 할당하고 인덱스 유지
            result.push({ ...node, start: alignmentData[currentIndex].start });
          }
        }
      } else {
        result.push({ ...node, start: currentIndex < alignmentData.length ? alignmentData[currentIndex].start : 0 });
      }
      continue;
    }

    // 매칭 로직 start
    if (currentIndex < alignmentData.length) {
      let currentTarget = alignmentData[currentIndex];

      if (mode === 'word') {
        // 초기화
        if (currentTarget.remainingText === undefined) {
          currentTarget.remainingText = normalizeText(currentTarget.word);
        }

        // 1. 현재 타겟과 매칭 시도
        let matched = currentTarget.remainingText.startsWith(cleanNodeText);

        // 2. 매칭 실패 시, 다음 타겟(Next)을 미리 확인 (Lookahead)
        if (!matched && currentIndex + 1 < alignmentData.length) {
          const nextTarget = alignmentData[currentIndex + 1];
          if (nextTarget.remainingText === undefined) {
            nextTarget.remainingText = normalizeText(nextTarget.word);
          }

          if (nextTarget.remainingText.startsWith(cleanNodeText)) {
            // 현재 타겟을 건너뛰고 다음 타겟 사용
            currentIndex++;
            currentTarget = nextTarget;
            matched = true;
          }
        }

        // 매칭 성공 여부와 상관없이 현재(혹은 갱신된) Target의 start 할당
        result.push({ ...node, start: currentTarget.start });

        if (matched) {
          currentTarget.remainingText = currentTarget.remainingText.substring(cleanNodeText.length);
          if (currentTarget.remainingText.length === 0) {
            currentIndex++;
          }
        }
      } else {
        // 글자 모드
        // 현재 노드는 텍스트인데, JSON 데이터가 공백(' ')이면 매칭하지 않고 건너뜀 (싱크 밀림 방지)
        // 예: HTML에 <br>이 있고 JSON에는 ' '가 있는 경우, <br>에서 인덱스를 소모하지 않았으므로
        // 그 다음 글자('누')가 ' '에 매칭되는 것을 방지
        while (currentIndex < alignmentData.length) {
          const charInJson = alignmentData[currentIndex].char;
          if (charInJson === ' ' || charInJson === '') {
            currentIndex++;
          } else {
            break;
          }
        }

        if (currentIndex < alignmentData.length) {
          result.push({ ...node, start: alignmentData[currentIndex].start });
          currentIndex++;
        } else {
          // 데이터가 더 이상 없음
          result.push({ ...node, start: 999999 });
        }
      }
    } else {
      result.push({ ...node, start: 999999 });
    }
  }

  return result;
};


// --------------------------------------------------------------------------
// 4. 메인 컴포넌트
// --------------------------------------------------------------------------

const START_THRESHOLD = 0.1;

const TextHighlightScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [highlightMode, setHighlightMode] = useState<'word' | 'char'>('word');
  const videoRef = useRef<Video>(null);

  const htmlContent = moduleData.content;
  const wordsData = moduleData.tts.timestamps.alignment.words;
  const charactersData = moduleData.tts.timestamps.alignment.characters;
  const totalDuration = moduleData.tts.timestamps.total_duration;

  // 파싱 결과 메모이제이션
  const parsedElements = useMemo(() => {
    const dataCopy = JSON.parse(JSON.stringify(highlightMode === 'word' ? wordsData : charactersData));
    return parseHtmlAndMapAlignment(htmlContent, dataCopy, highlightMode);
  }, [htmlContent, wordsData, charactersData, highlightMode]);

  // 비디오가 끝났을 때
  const handleVideoEnd = () => {
    setIsPaused(true);
    setCurrentTime(0);
    videoRef.current?.seek(0);
  };

  // 특정 모드로 재생 시작
  const playWithMode = (mode: 'word' | 'char') => {
    setHighlightMode(mode);
    setCurrentTime(0);
    videoRef.current?.seek(0);
    setIsPaused(false);
  };

  // 상단 아이콘 렌더링
  const renderIcon = () => {
    if (!moduleData.icon) return null;
    const { name, size = 32, fill, backgroundSize, backgroundColor } = moduleData.icon;
    const SvgIcon = (SvgIcons as any)[name];
    if (!SvgIcon) return null;

    return (
      <View style={[styles.iconContainer, { backgroundColor, width: backgroundSize, height: backgroundSize, borderRadius: backgroundSize / 2 }]}>
        <SvgIcon width={size} height={size} fill={fill} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {renderIcon()}

        <View style={styles.textWrapper}>
          <Text style={styles.centerText}>
            {parsedElements.map((item, index) => {
              if (item.isBreak) return <Text key={index}>{'\n'}</Text>;

              const isActive = currentTime >= item.start && currentTime >= START_THRESHOLD;

              const { color: originalColor, ...otherStyles } = item.style || {};
              const finalColor = originalColor || '#333333';

              return (
                <Text
                  key={`${highlightMode}-${index}`}
                  style={{
                    ...otherStyles,
                    color: isActive ? finalColor : '#cccccc'
                  }}
                >
                  {item.text}
                </Text>
              );
            })}
          </Text>
        </View>
      </ScrollView>

      <Video
        ref={videoRef}
        source={{ uri: moduleData.tts.url }}
        paused={isPaused}
        onProgress={({ currentTime }) => setCurrentTime(currentTime)}
        onEnd={handleVideoEnd}
        progressUpdateInterval={30}
        audioOnly={true}
        style={{ width: 0, height: 0 }}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: '#08875D' }]}
          onPress={() => playWithMode('word')}
        >
          <Text style={styles.playButtonText}>단어 단위 재생</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: '#4A90E2' }]}
          onPress={() => playWithMode('char')}
        >
          <Text style={styles.playButtonText}>글자 단위 재생</Text>
        </TouchableOpacity>
      </View>
    </View >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  textWrapper: {
    width: '100%',
  },
  centerText: {
    textAlign: 'center',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 12,
  },
  playButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default TextHighlightScreen;