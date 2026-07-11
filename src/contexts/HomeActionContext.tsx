import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// 사이드바 등 홈 밖에서 "새 워크스페이스 만들기"를 트리거하기 위한 공유 신호.
//  · 사이드바 '+ 새 워크스페이스' → requestNewWorkspace() → 신호 증가.
//  · HomeScreen 이 신호 변화를 구독해 생성(설명 입력) 모달을 연다.
// 생성 플로우(모달·이름추천·세션 시작)는 HomeScreen 이 그대로 소유 — 여기선 트리거만.
interface HomeActionValue {
  newWsSignal: number;
  requestNewWorkspace: () => void;
}

const Ctx = createContext<HomeActionValue | undefined>(undefined);

export const HomeActionProvider = ({ children }: { children: React.ReactNode }) => {
  const [newWsSignal, setSignal] = useState(0);
  const requestNewWorkspace = useCallback(() => setSignal((n) => n + 1), []);
  const value = useMemo(() => ({ newWsSignal, requestNewWorkspace }), [newWsSignal, requestNewWorkspace]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useHomeAction = (): HomeActionValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHomeAction must be used within HomeActionProvider');
  return ctx;
};
