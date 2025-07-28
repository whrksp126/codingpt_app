import { useMemo } from 'react';
import { format, subMonths, eachDayOfInterval, startOfWeek } from 'date-fns';

export interface HeatmapCell {
  date: string;
  count: number;
}

export function useHeatmapData(data: Record<string, number>) {
  const today = new Date();
  const startDate = startOfWeek(subMonths(today, 6), { weekStartsOn: 0 });

  const allDays = eachDayOfInterval({ start: startDate, end: today });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const monthLabels: { index: number; label: string }[] = [];
  let lastLabeledMonth = '';

  weeks.forEach((week, weekIdx) => {
    const firstDay = week[0];
    const firstMonth = format(firstDay, 'M');

    const hasMonthChange = week.some((day, i, arr) => {
      if (i === 0) return false;
      return format(day, 'M') !== format(arr[i - 1], 'M');
    });

    const labelDay =
      week.find((day, i, arr) =>
        i === 0 ? format(day, 'M') !== lastLabeledMonth : format(day, 'M') !== format(arr[i - 1], 'M')
      ) || firstDay;

    const labelMonth = format(labelDay, 'M');

    if (weekIdx === 0 || labelMonth !== lastLabeledMonth) {
      monthLabels.push({ index: weekIdx, label: `${labelMonth}월` });
      lastLabeledMonth = labelMonth;
    }
  });

  return { weeks, monthLabels };
}