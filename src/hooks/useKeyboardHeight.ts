import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// 키보드가 가린 높이(px)를 반환. 숨김 시 0.
// targetSdk 35(Android 15) edge-to-edge 에서는 adjustResize 가 창을 줄이지 않으므로
// 이 값을 컴포저 컨테이너의 paddingBottom 으로 적용해 입력창을 키보드 위로 띄운다.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvt, (e) => {
      setHeight(e?.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}

export default useKeyboardHeight;
