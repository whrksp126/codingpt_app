import { useWindowDimensions } from 'react-native';

// 반응형 기준값. 이 폭(dp) 이상이면 태블릿/가로 큰 화면으로 보고 콘텐츠 폭을 제한한다.
//  폰 세로(약 360~430dp)는 항상 아래라 폰 레이아웃은 전혀 바뀌지 않는다.
export const WIDE_BREAKPOINT = 700;
// 큰 화면에서 콘텐츠(카드/폼/리스트)를 이 폭으로 가운데 정렬 — 폰 감성 유지.
export const CONTENT_MAX_WIDTH = 600;

export interface Responsive {
  width: number;
  height: number;
  isWide: boolean;          // 태블릿/가로 등 큰 화면인가
  isLandscape: boolean;
  contentMaxWidth: number;  // 큰 화면이면 CONTENT_MAX_WIDTH, 폰이면 실제 폭
}

// 화면 크기에 따른 반응형 값. 회전/분할화면에도 즉시 반응(useWindowDimensions).
export function useResponsive(maxWidth: number = CONTENT_MAX_WIDTH): Responsive {
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  return {
    width,
    height,
    isWide,
    isLandscape: width > height,
    contentMaxWidth: isWide ? maxWidth : width,
  };
}
