import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { collapseKeyAssist } from '../components/keyboard/KeyAssist';

// 좌측 사이드바 상태 공유.
//  · 폰: 오버레이 드로어 → `open`(기본 false, 햄버거로 열기).
//  · 태블릿/큰 화면: 좌측 도킹 사이드바 → `dockedOpen`(기본 true, 상시 노출, 토글로 접기).
// 어느 모드로 렌더할지는 셸(useResponsive)이 결정한다. 컨텍스트는 두 상태를 분리 보관만 한다.
interface DrawerContextType {
  open: boolean;                 // 폰 오버레이 드로어 열림
  dockedOpen: boolean;           // 태블릿 도킹 사이드바 노출
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDocked: () => void;
  setDockedOpen: (v: boolean) => void;
}

const DrawerContext = createContext<DrawerContextType | undefined>(undefined);

export const DrawerProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [dockedOpen, setDockedOpen] = useState(true); // 태블릿은 기본 열림
  // 사이드바 열기/도킹 토글 = 키보드·특수키 패널 내림(모바일+태블릿 공통, 사용자 확정 스펙).
  const openDrawer = useCallback(() => { collapseKeyAssist(); setOpen(true); }, []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDocked = useCallback(() => { collapseKeyAssist(); setDockedOpen((v) => !v); }, []);
  const value = useMemo(
    () => ({ open, dockedOpen, openDrawer, closeDrawer, toggleDocked, setDockedOpen }),
    [open, dockedOpen, openDrawer, closeDrawer, toggleDocked],
  );
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
};

export const useDrawer = (): DrawerContextType => {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider');
  return ctx;
};
