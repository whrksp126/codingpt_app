/*
  ** 학습기록 관련 유틸 함수 **
*/

import dayjs from 'dayjs';

// 학습횟수별 잔디 색상
export const getColorByCount = (count: number): string => {
    if (count >= 3) return '#87FF30';
    if (count === 2) return '#C6FF9C';
    if (count === 1) return '#F0FFE5';
    return '#F5F5F5';
};

// 총 학습일수 계산
export function getTotalStudyDays(data: Record<string, number>): number {
  return Object.values(data).filter(count => count > 0).length;
}

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