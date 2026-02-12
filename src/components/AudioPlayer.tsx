import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Video from 'react-native-video';

interface AudioPlayerProps {
  audioUrl: string;
  paused?: boolean; // pause/resume 제어
  onLoadComplete?: () => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
  onProgress?: (data: { currentTime: number; playableDuration: number; seekableDuration: number }) => void;
}

// 로컬 오디오 파일 매핑 (require는 정적 경로만 가능)
const LOCAL_AUDIO_FILES: Record<string, any> = {
  'tts_01.mp3': require('../assets/audio/tts_01.mp3'),
  'tts_02.mp3': require('../assets/audio/tts_02.mp3'),
  'lesson_05_01_01.mp3': require('../assets/audio/lesson_05_01_01.mp3'),
  'lesson_05_01_02.mp3': require('../assets/audio/lesson_05_01_02.mp3'),
  'lesson_05_02_01.mp3': require('../assets/audio/lesson_05_02_01.mp3'),
  'lesson_05_03_01.mp3': require('../assets/audio/lesson_05_03_01.mp3'),
  'lesson_05_03_02.mp3': require('../assets/audio/lesson_05_03_02.mp3'),
  'lesson_05_04_01.mp3': require('../assets/audio/lesson_05_04_01.mp3'),
  'lesson_05_04_02.mp3': require('../assets/audio/lesson_05_04_02.mp3'),
  'lesson_05_05_01.mp3': require('../assets/audio/lesson_05_05_01.mp3'),
  'lesson_05_06_01.mp3': require('../assets/audio/lesson_05_06_01.mp3'),
  'lesson_05_06_02.mp3': require('../assets/audio/lesson_05_06_02.mp3'),
  'lesson_05_07_01.mp3': require('../assets/audio/lesson_05_07_01.mp3'),
  'lesson_05_07_02.mp3': require('../assets/audio/lesson_05_07_02.mp3'),
  'lesson_05_08_01.mp3': require('../assets/audio/lesson_05_08_01.mp3'),
  'lesson_05_08_02.mp3': require('../assets/audio/lesson_05_08_02.mp3'),
  'lesson_09_01_01.mp3': require('../assets/audio/lesson_09_01_01.mp3'),
  'lesson_09_01_02.mp3': require('../assets/audio/lesson_09_01_02.mp3'),
  'lesson_09_02_01.mp3': require('../assets/audio/lesson_09_02_01.mp3'),
  'lesson_09_02_02.mp3': require('../assets/audio/lesson_09_02_02.mp3'),
  'lesson_09_03_01.mp3': require('../assets/audio/lesson_09_03_01.mp3'),
  'lesson_09_03_02.mp3': require('../assets/audio/lesson_09_03_02.mp3'),
  'lesson_09_04_01.mp3': require('../assets/audio/lesson_09_04_01.mp3'),
  'lesson_09_04_02.mp3': require('../assets/audio/lesson_09_04_02.mp3'),
  'lesson_09_05_01.mp3': require('../assets/audio/lesson_09_05_01.mp3'),
  'lesson_09_05_02.mp3': require('../assets/audio/lesson_09_05_02.mp3'),
  'lesson_09_05_03.mp3': require('../assets/audio/lesson_09_05_03.mp3'),
  'lesson_09_05_04.mp3': require('../assets/audio/lesson_09_05_04.mp3'),
  'lesson_09_05_05.mp3': require('../assets/audio/lesson_09_05_05.mp3'),
  'lesson_09_06_01.mp3': require('../assets/audio/lesson_09_06_01.mp3'),
  'lesson_09_06_02.mp3': require('../assets/audio/lesson_09_06_02.mp3'),
  'lesson_09_07_01.mp3': require('../assets/audio/lesson_09_07_01.mp3'),
  'lesson_09_07_02.mp3': require('../assets/audio/lesson_09_07_02.mp3'),
  'lesson_09_08_01.mp3': require('../assets/audio/lesson_09_08_01.mp3'),
  'lesson_09_08_02.mp3': require('../assets/audio/lesson_09_08_02.mp3'),
  'lesson_09_08_03.mp3': require('../assets/audio/lesson_09_08_03.mp3'),
  'lesson_09_08_04.mp3': require('../assets/audio/lesson_09_08_04.mp3'),
  'lesson_09_09_01.mp3': require('../assets/audio/lesson_09_09_01.mp3'),
  'lesson_09_09_02.mp3': require('../assets/audio/lesson_09_09_02.mp3'),
  'lesson_09_09_03.mp3': require('../assets/audio/lesson_09_09_03.mp3'),
  'java_05_01_01.mp3': require('../assets/audio/java_05_01_01.mp3'),
  'java_05_01_02.mp3': require('../assets/audio/java_05_01_02.mp3'),
  'java_05_01_03.mp3': require('../assets/audio/java_05_01_03.mp3'),
  'java_05_02_01.mp3': require('../assets/audio/java_05_02_01.mp3'),
  'java_05_02_02.mp3': require('../assets/audio/java_05_02_02.mp3'),
  'java_05_02_03.mp3': require('../assets/audio/java_05_02_03.mp3'),
  'java_05_03_01.mp3': require('../assets/audio/java_05_03_01.mp3'),
  'java_05_03_02.mp3': require('../assets/audio/java_05_03_02.mp3'),
  'java_05_03_03.mp3': require('../assets/audio/java_05_03_03.mp3'),
  'java_05_03_04.mp3': require('../assets/audio/java_05_03_04.mp3'),
  'java_05_04_01.mp3': require('../assets/audio/java_05_04_01.mp3'),
  'java_05_04_02.mp3': require('../assets/audio/java_05_04_02.mp3'),
  'java_05_04_03.mp3': require('../assets/audio/java_05_04_03.mp3'),
  'java_05_04_04.mp3': require('../assets/audio/java_05_04_04.mp3'),
  'java_05_05_01.mp3': require('../assets/audio/java_05_05_01.mp3'),
  'java_05_05_02.mp3': require('../assets/audio/java_05_05_02.mp3'),
  'java_05_05_03.mp3': require('../assets/audio/java_05_05_03.mp3'),
  'java_05_05_04.mp3': require('../assets/audio/java_05_05_04.mp3'),
  'java_05_05_05.mp3': require('../assets/audio/java_05_05_05.mp3'),
  'java_05_05_06.mp3': require('../assets/audio/java_05_05_06.mp3'),
  'java_05_06_01.mp3': require('../assets/audio/java_05_06_01.mp3'),
  'java_05_06_02.mp3': require('../assets/audio/java_05_06_02.mp3'),
  'java_05_07_01.mp3': require('../assets/audio/java_05_07_01.mp3'),
  'java_05_07_02.mp3': require('../assets/audio/java_05_07_02.mp3'),
  'java_05_08_01.mp3': require('../assets/audio/java_05_08_01.mp3'),
  'java_05_08_02.mp3': require('../assets/audio/java_05_08_02.mp3'),
  'java_05_08_03.mp3': require('../assets/audio/java_05_08_03.mp3'),
  'java_05_09_01.mp3': require('../assets/audio/java_05_09_01.mp3'),
  'java_05_09_02.mp3': require('../assets/audio/java_05_09_02.mp3'),
  'java_05_09_03.mp3': require('../assets/audio/java_05_09_03.mp3'),
  // 추가 로컬 파일은 여기에 등록
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  paused = false,
  onLoadComplete,
  onError,
  onEnd,
  onProgress,
}) => {
  const videoRef = useRef<React.ElementRef<typeof Video>>(null);

  // 오디오 소스 결정
  const getAudioSource = () => {
    // 로컬 파일 형식: "local:filename.mp3"
    if (audioUrl.startsWith('local:')) {
      const fileName = audioUrl.replace('local:', '');
      const localFile = LOCAL_AUDIO_FILES[fileName];

      if (!localFile) {
        console.error('AudioPlayer: 로컬 파일을 찾을 수 없습니다:', fileName);
        return null;
      }

      console.log('AudioPlayer: 로컬 파일 사용:', fileName);
      return localFile;
    }

    // 원격 URL (http:// 또는 https://)
    console.log('AudioPlayer: 원격 URL 사용:', audioUrl);
    return { uri: audioUrl };
  };

  const audioSource = getAudioSource();

  useEffect(() => {
    console.log('AudioPlayer: 오디오 URL 로드됨:', audioUrl);
  }, [audioUrl]);

  const handleLoad = () => {
    console.log('AudioPlayer: 오디오 로드 완료');
    onLoadComplete?.();
  };

  const handleError = (error: any) => {
    console.error('AudioPlayer: 오디오 재생 오류, URL:', audioUrl, 'Error:', error);
    onError?.(error);
  };

  const handleEnd = () => {
    console.log('AudioPlayer: 오디오 재생 완료');
    onEnd?.();
  };

  if (!audioUrl || !audioSource) {
    return null;
  }

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <Video
        ref={videoRef}
        source={audioSource}
        paused={paused}
        repeat={false}
        controls={false}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        onLoad={handleLoad}
        onError={handleError}
        onEnd={handleEnd}
        onProgress={onProgress}
        progressUpdateInterval={30}
        style={{ width: 0, height: 0 }}
      />
    </View>
  );
};
