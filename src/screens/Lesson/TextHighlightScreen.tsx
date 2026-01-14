import React, { useState, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import * as SvgIcons from '../../assets/SvgIcon';

import { htmlTagsStyles, classesStyles } from '../../../src/utils/htmlStyles'

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
  "content": "<h2 class=\"text-center\"><span class=\"success-700\">HTML</span>이란 무엇인가?</h2>",
  "tts": {
    "url": "https://s3.ghmate.com/codingpt/tts/static/lesson-id-00000001/00000001.mp3",
    "timestamps": {
      "version": "1.0",
      "total_duration": 1.758,
      "alignment": {
        "words": [
          { "word": "HTML이란", "start": 0, "end": 1.04, "confidence": 1 },
          { "word": "무엇인가?", "start": 1.146, "end": 1.758, "confidence": 1 }
        ]
      }
    }
  },
  "visibility": {
    "type": "duration",
    "time": 5000
  }
};

// --------------------------------------------------------------------------
// 3. 파서 로직 (Words 단위 매핑 + 정교한 HTML 파싱)
// --------------------------------------------------------------------------
const parseHtmlAndMapWords = (html: string, wordsData: any[]) => {
  const result: any[] = [];

  // 1. 태그와 텍스트를 분리하는 정규식
  const regex = /<\s*(\/)?\s*([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match;
  let styleStack: any[] = [htmlTagsStyles.body || {}];

  // 임시 노드 저장소 (텍스트를 잘게 쪼개서 보관)
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
        // 스타일 상속 및 클래스 적용
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
      // 텍스트를 공백 기준으로 나누어 저장 (매칭 정확도 향상)
      const parts = textContent.split(/(\s+)/);
      parts.forEach(part => {
        if (part.length === 0) return;
        fineGrainedNodes.push({
          text: part,
          style: styleStack[styleStack.length - 1],
          isBreak: false
        });
      });
    }
  }

  // 2. 쪼개진 노드들과 Words 데이터 매핑
  let currentWordIndex = 0;

  for (let i = 0; i < fineGrainedNodes.length; i++) {
    const node = fineGrainedNodes[i];

    // 줄바꿈 처리
    if (node.isBreak) {
      result.push({ ...node, start: 0 });
      continue;
    }

    // 공백만 있는 노드는 현재 진행 중인 단어의 시간이나 0을 할당
    if (!node.text.trim()) {
      result.push({ ...node, start: currentWordIndex < wordsData.length ? wordsData[currentWordIndex].start : 0 });
      continue;
    }

    // 단어 매칭 로직
    if (currentWordIndex < wordsData.length) {
      const currentWordObj = wordsData[currentWordIndex];

      result.push({
        ...node,
        start: currentWordObj.start
      });

      // 단어 소모(consume) 로직
      if (!currentWordObj.remainingText) {
        currentWordObj.remainingText = currentWordObj.word.replace(/\s/g, '');
      }

      const cleanNodeText = node.text.replace(/\s/g, '');

      if (currentWordObj.remainingText.startsWith(cleanNodeText)) {
        currentWordObj.remainingText = currentWordObj.remainingText.substring(cleanNodeText.length);
      }

      if (currentWordObj.remainingText.length === 0) {
        currentWordIndex++;
      }
    } else {
      // 매칭될 단어가 없으면 아주 먼 시간 할당
      result.push({ ...node, start: 999999 });
    }
  }

  return result;
};


// --------------------------------------------------------------------------
// 4. 메인 컴포넌트
// --------------------------------------------------------------------------

// [핵심 설정] 0.1초 전에는 하이라이트를 켜지 않도록 하는 임계값
const START_THRESHOLD = 0.1;

const TextHighlightScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  // 1. 초기값을 깔끔하게 0으로 설정
  const [currentTime, setCurrentTime] = useState(0);

  const [isPaused, setIsPaused] = useState(false);
  const videoRef = useRef<Video>(null);

  const htmlContent = moduleData.content;
  const wordsData = moduleData.tts.timestamps.alignment.words;
  const totalDuration = moduleData.tts.timestamps.total_duration;

  // 파싱 결과 메모이제이션
  const parsedElements = useMemo(() => {
    const wordsCopy = JSON.parse(JSON.stringify(wordsData));
    return parseHtmlAndMapWords(htmlContent, wordsCopy);
  }, [htmlContent, wordsData]);

  // 비디오가 끝났을 때
  const handleVideoEnd = () => {
    setIsPaused(true);
    setCurrentTime(0);
    videoRef.current?.seek(0);
  };

  // 재생/일시정지 핸들러
  const handlePlayPause = () => {
    if (currentTime >= totalDuration - 0.1) {
      videoRef.current?.seek(0);
      setCurrentTime(0);
    }
    setIsPaused(!isPaused);
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

              // [중요 로직] 
              // 1. 현재 시간이 시작 시간보다 컸을 때 (currentTime >= item.start)
              // 2. AND 현재 시간이 0.1초 이상 흘렀을 때 (currentTime >= START_THRESHOLD)
              // 이 두 가지를 만족해야 색상이 켜집니다.
              const isActive = currentTime >= item.start && currentTime >= START_THRESHOLD;

              const { color: originalColor, ...otherStyles } = item.style || {};
              const finalColor = originalColor || '#333333';

              return (
                <Text
                  key={index}
                  style={{
                    ...otherStyles,
                    // isActive가 false면(0초 포함) 무조건 회색으로 표시
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
        progressUpdateInterval={50}
        audioOnly={true}
        style={{ width: 0, height: 0 }}
      />

      <TouchableOpacity
        style={styles.playButton}
        onPress={handlePlayPause}
      >
        <Text style={styles.playButtonText}>
          {isPaused ? '다시 듣기' : '일시정지'}
        </Text>
      </TouchableOpacity>
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
  playButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: '#08875D',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default TextHighlightScreen;