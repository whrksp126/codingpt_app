import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { v2Font } from './v2Tokens';

/**
 * 테마·글꼴에 따라 다시 만드는 StyleSheet — `StyleSheet.create` 를 모듈 로드 시점에 부르면 색이
 *  첫 테마로 굳는다(v2Colors 는 제자리 교체 객체라 값은 바뀌어도 이미 만든 스타일은 안 바뀜).
 *  사용: `const makeStyles = () => StyleSheet.create({...v2Colors...});` 를 모듈에 두고
 *  컴포넌트에서 `const styles = useThemedStyles(makeStyles);`.
 */
export function useThemedStyles<T>(factory: () => T): T {
  const { resolvedScheme } = useTheme();
  const fontFamily = v2Font.sans;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [factory, resolvedScheme, fontFamily]);
}
