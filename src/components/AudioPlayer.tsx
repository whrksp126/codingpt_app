import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Video from 'react-native-video';

interface AudioPlayerProps {
  audioUrl: string;
  paused?: boolean; // pause/resume 제어
  onLoadComplete?: () => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
}

// 로컬 오디오 파일 매핑 (require는 정적 경로만 가능)
const LOCAL_AUDIO_FILES: Record<string, any> = {
  'tts_01.mp3': require('../assets/audio/tts_01.mp3'),
  'tts_02.mp3': require('../assets/audio/tts_02.mp3'),
  // 추가 로컬 파일은 여기에 등록
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  paused = false,
  onLoadComplete,
  onError,
  onEnd,
}) => {
  const videoRef = useRef<Video>(null);

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
        audioOnly={true}
        paused={paused}
        repeat={false}
        controls={false}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        onLoad={handleLoad}
        onError={handleError}
        onEnd={handleEnd}
        style={{ width: 0, height: 0 }}
      />
    </View>
  );
};
