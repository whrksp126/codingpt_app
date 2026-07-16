import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { onNotifSound } from '../services/notifSound';

// 알림 효과음 — 화면 어디에도 안 보이는 0x0 Video 로 짧은 mp3 를 재생.
//  react-native-video 는 이미 의존성(레슨 오디오)이라 새 네이티브 모듈 추가가 없다.
const SRC = require('../assets/audio/notif.mp3');

export default function NotifSound() {
  const ref = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(true);

  useEffect(() => onNotifSound(() => {
    try { ref.current?.seek(0); } catch { /* noop */ }
    setPaused(false);
  }), []);

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <Video
        ref={ref}
        source={SRC}
        paused={paused}
        repeat={false}
        controls={false}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        onEnd={() => setPaused(true)}
        onError={() => setPaused(true)}
        style={{ width: 0, height: 0 }}
      />
    </View>
  );
}
