// src/contexts/HeartsContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import dayjs from 'dayjs';
import userService, { HeartsModel } from '../services/userService';

type HeartsState = {
  hearts: number;               // 현재 하트(0~5)
  nextRefillAt: string | null;  // ISO (없으면 null)
  secondsToRefill: number | null;
};

type HeartsContextValue = HeartsState & {
  refresh: () => Promise<void>;
  spendOne: (meta?: { lessonId?: number; slideId?: number }) => Promise<boolean>;
};

const HeartsContext = createContext<HeartsContextValue>(null as any);
export const useHearts = () => useContext(HeartsContext);

// 남은 초 계산
const calcSecondsLeft = (iso: string | null) =>
  iso ? Math.max(0, dayjs(iso).diff(dayjs(), 'second')) : null;

export const HeartsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<HeartsState>({
    hearts: 5,
    nextRefillAt: null,
    secondsToRefill: null,
  });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ⏱ 표시용 카운트다운 (0초 도달 시 서버 동기화 1회)
  const startTick = (nextISO: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!nextISO) {
      setState(s => ({ ...s, secondsToRefill: null }));
      return;
    }
    const run = async () => {
      const left = calcSecondsLeft(nextISO);
      setState(s => ({ ...s, secondsToRefill: left }));
      if (left === 0) {
        await refresh();
      }
    };
    run();
    timerRef.current = setInterval(run, 1000);
  };

  // 🔄 서버에서 최신 하트 상태 동기화
  const refresh = async () => {
    const model: HeartsModel = await userService.getHearts();
    // console.log('[HeartContext]', model);
    // console.log('[HeartContext]', model.hearts);

    setState({
      hearts: model.hearts,
      nextRefillAt: model.nextRefillAt,
      secondsToRefill: calcSecondsLeft(model.nextRefillAt),
    });
    startTick(model.nextRefillAt);
  };

  // ❌ 오답 등으로 하트 1개 사용
  const spendOne = async () => {
    try {
      const model = await userService.postHearts();
      setState({
        hearts: model.hearts,
        nextRefillAt: model.nextRefillAt,
        secondsToRefill: calcSecondsLeft(model.nextRefillAt),
      });
      startTick(model.nextRefillAt);
      return true;
    } catch {
      return false;
    }
  };

  // 앱 시작/포그라운드 복귀 시 동기화
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    return () => {
      sub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <HeartsContext.Provider value={{ ...state, refresh, spendOne }}>
      {children}
    </HeartsContext.Provider>
  );
};