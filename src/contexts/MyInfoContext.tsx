import React, { createContext, useCallback, useContext, useState } from 'react';

// 내 정보 시트(오버레이) 상태.
// - 드로어 위에 우측에서 쌓이는 시트(info)
// - info 에서 헤더 설정(⚙) → settings 스텝, 프로필 클릭 → account 스텝 (둘은 형제: info 의 자식)
// - account 에서 GitHub → githubOpen (전체화면 오버레이, 시트 위에 우측 push)
// theme/reviews 는 settings 하위(한 뎁스 더 깊음) — back 시 settings 로 복귀.
export type Step = 'info' | 'settings' | 'account' | 'usage' | 'billing' | 'connections' | 'learning' | 'theme' | 'reviews';

type MyInfoContextValue = {
  open: boolean;
  step: Step;
  githubOpen: boolean;
  openSheet: () => void;      // 내 정보 시트 열기(info 스텝부터)
  pushSettings: () => void;   // info → settings
  pushAccount: () => void;    // info → account(사용자 정보)
  pushUsage: () => void;      // info → usage(사용량)
  pushBilling: () => void;    // info → billing(결제)
  pushConnections: () => void; // info → connections(연결)
  pushLearning: () => void;   // info → learning(학습)
  pushTheme: () => void;      // settings → theme(테마)
  pushReviews: () => void;    // settings → reviews(후기)
  back: () => void;           // theme/reviews → settings, 그 외 자식 → info
  close: () => void;          // 시트 닫기
  openGithub: () => void;     // GitHub 연결 시트 열기
  closeGithub: () => void;    // GitHub 연결 시트 닫기
};

const MyInfoContext = createContext<MyInfoContextValue | undefined>(undefined);

export const MyInfoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('info');
  const [githubOpen, setGithubOpen] = useState(false);

  const openSheet = useCallback(() => { setStep('info'); setGithubOpen(false); setOpen(true); }, []);
  const pushSettings = useCallback(() => setStep('settings'), []);
  const pushAccount = useCallback(() => setStep('account'), []);
  const pushUsage = useCallback(() => setStep('usage'), []);
  const pushBilling = useCallback(() => setStep('billing'), []);
  const pushConnections = useCallback(() => setStep('connections'), []);
  const pushLearning = useCallback(() => setStep('learning'), []);
  const pushTheme = useCallback(() => setStep('theme'), []);
  const pushReviews = useCallback(() => setStep('reviews'), []);
  const back = useCallback(() => setStep((s) => (s === 'theme' || s === 'reviews' ? 'settings' : 'info')), []);
  const close = useCallback(() => { setOpen(false); setGithubOpen(false); }, []);
  const openGithub = useCallback(() => setGithubOpen(true), []);
  const closeGithub = useCallback(() => setGithubOpen(false), []);

  return (
    <MyInfoContext.Provider value={{ open, step, githubOpen, openSheet, pushSettings, pushAccount, pushUsage, pushBilling, pushConnections, pushLearning, pushTheme, pushReviews, back, close, openGithub, closeGithub }}>
      {children}
    </MyInfoContext.Provider>
  );
};

export const useMyInfo = (): MyInfoContextValue => {
  const ctx = useContext(MyInfoContext);
  if (!ctx) throw new Error('useMyInfo must be used within MyInfoProvider');
  return ctx;
};
