import React, { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import MobileIDEScreen from './MobileIDEScreen';
import { useIdeProject } from '../../contexts/IdeProjectContext';
import { setKeyAssistSuppressed } from '../../components/keyboard/KeyAssist';

/**
 * 모바일 IDE를 "언마운트하지 않는 오버레이"로 호스팅한다.
 *
 * 왜: 예전엔 IDE가 네비게이션 화면이라 닫으면(goBack) 언마운트 → 탭/브라우저/터미널 등 화면 상태가 날아갔다.
 * 여기선 한 번 열리면(ideMounted) 계속 마운트해 두고, 닫기=우측으로 슬라이드 숨김(visible=false)만 한다.
 * → 다시 열면 직전 상태(브라우저 열림·탭·웹뷰까지) 그대로. 코드/파일 동기화는 IdeProjectContext가 담당.
 *
 * key={projectId}: 같은 프로젝트를 다시 열면 동일 인스턴스(상태 보존),
 * 다른 프로젝트면 새 인스턴스로 교체(프로젝트별 상태 분리).
 */
export default function MobileIDEHost() {
  const { ideMounted, ideVisible, ideParams, closeIde } = useIdeProject();
  const { width } = useWindowDimensions();
  const tx = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    Animated.timing(tx, {
      toValue: ideVisible ? 0 : width,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [ideVisible, width, tx]);

  // 옛 IDE 화면은 자체 보조바/특수키 패널을 가짐 — 보이는 동안 전역 액세서리는 억제.
  useEffect(() => {
    setKeyAssistSuppressed(!!(ideMounted && ideVisible));
    return () => setKeyAssistSuppressed(false);
  }, [ideMounted, ideVisible]);

  // 하드웨어 백 처리는 MobileIDEScreen 으로 이동(특수키 패널 > OS 키보드 > IDE 닫기 우선순위를
  //  kbMode 를 아는 화면 쪽에서 처리해야 하므로). 최종 "IDE 닫기"는 화면이 onClose(=closeIde) 로 호출.

  if (!ideMounted || !ideParams) return null;

  return (
    <Animated.View
      pointerEvents={ideVisible ? 'auto' : 'none'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ translateX: tx }] }}
    >
      <View style={{ flex: 1 }}>
        <MobileIDEScreen
          key={ideParams.ide.projectId}
          ide={ideParams.ide}
          lessonId={ideParams.lessonId}
          visible={ideVisible}
          onClose={closeIde}
        />
      </View>
    </Animated.View>
  );
}
