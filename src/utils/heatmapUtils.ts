/*
  ** 학습기록 관련 유틸 함수 **
*/

import dayjs from 'dayjs';

// 학습횟수별 잔디 색상.
// - 액티브(count >= 1) 컬러는 라이트/다크 모드 모두 동일한 라임 톤(#F0FFE5 ~ #87FF30) 사용:
//   체크 아이콘(#58CC02)과 항상 충분한 명도 차이를 유지하기 위함.
// - 빈 셀(count === 0)만 페이지 배경에 어울리도록 모드별로 분기:
//   라이트는 살짝 회색(#F5F5F5), 다크는 페이지 배경(#0A0D14) 위에서 살짝 떠 보이는 어두운 톤(#16191F).
export const getColorByCount = (
  count: number,
  scheme: 'light' | 'dark' = 'light',
): string => {
  if (count >= 3) return '#87FF30';
  if (count === 2) return '#C6FF9C';
  if (count === 1) return '#F0FFE5';
  return scheme === 'dark' ? '#16191F' : '#F5F5F5';
};

// 날짜별 학습 횟수에서 최근 N일의 count 배열 반환
export function getRecentDays(data: Record<string, number>, days: number): number[] {
  const today = dayjs();
  const result: number[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = today.subtract(i, 'day').format('YYYY-MM-DD');
    result.push(data[date] || 0);
  }

  return result;
}