import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Video from 'react-native-video';

interface AudioPlayerProps {
  audioUrl: string;
  onLoadComplete?: () => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  onLoadComplete,
  onError,
  onEnd,
}) => {
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    console.log('AudioPlayer: 오디오 URL 로드됨:', audioUrl);
  }, [audioUrl]);

  const handleLoad = () => {
    console.log('AudioPlayer: 오디오 로드 완료, URL:', audioUrl);
    onLoadComplete?.();
  };

  const handleError = (error: any) => {
    console.error('AudioPlayer: 오디오 재생 오류, URL:', audioUrl, 'Error:', error);
    onError?.(error);
  };

  const handleEnd = () => {
    console.log('AudioPlayer: 오디오 재생 완료, URL:', audioUrl);
    onEnd?.();
  };

  if (!audioUrl) {
    return null;
  }

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <Video
        ref={videoRef}
        source={{ uri: audioUrl }}
        audioOnly={true}
        paused={false}
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
