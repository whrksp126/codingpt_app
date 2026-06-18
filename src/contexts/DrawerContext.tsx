import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// 좌측 드로어(햄버거 메뉴) 열림 상태 공유 — 어느 탭 화면에서든 햄버거로 열 수 있게.
interface DrawerContextType {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextType | undefined>(undefined);

export const DrawerProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openDrawer, closeDrawer }), [open, openDrawer, closeDrawer]);
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
};

export const useDrawer = (): DrawerContextType => {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider');
  return ctx;
};
