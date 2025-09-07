import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';

/** 탭 이름(루트 라우트)과 화면 라우트 타입 */
type TabName = 'home' | 'myLessons' | 'store' | 'my';
type RouteName =
  | TabName
  | 'lessonDetail'
  | 'classProgress'
  | 'lessonLearning'
  | 'lessonReport'
  | 'lessonOutline';

type Route = { name: RouteName; params?: any };
type NavAction = 'push' | 'pop' | 'replace' | 'switch' | 'reset';

/** 컨텍스트 노출 함수들 */
interface NavigationContextType {
  /** 현재 활성 탭 */
  currentTab: TabName;
  /** 현재 화면(Route) – 현재 탭 스택의 top */
  currentRoute: Route;
  /** 현재 화면의 params (편의) */
  navigationParams: any;

  /** 탭 전환 (스택 보존) */
  switchTab: (tab: TabName) => void;

  /** 탭 안에서 화면 푸시 */
  push: (screen: RouteName, params?: any) => void;

  /** 현재 탭 스택에서 뒤로가기(pop). 루트면 무시 */
  goBack: () => void;

  /** 현재 탭 스택 최상단 교체 */
  replace: (screen: RouteName, params?: any) => void;

  /** (레거시 호환) 탭루트면 탭전환, 그 외는 push */
  navigate: (screen: RouteName, params?: any) => void;

  /** 현재 탭 스택을 루트만 남기고 초기화 */
  resetCurrentTab: () => void;

  lastAction: NavAction;
}

/** 탭 루트 초기 라우트 맵 */
const TAB_ROOT: Record<TabName, Route> = {
  home: { name: 'home' },
  myLessons: { name: 'myLessons' },
  store: { name: 'store' },
  my: { name: 'my' },
};

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  // 탭별 스택: 각 탭에 Route 배열을 유지
  const [stacks, setStacks] = useState<Record<TabName, Route[]>>({
    home: [{ name: 'home' }],
    myLessons: [{ name: 'myLessons' }],
    store: [{ name: 'store' }],
    my: [{ name: 'my' }],
  });

  const [currentTab, setCurrentTab] = useState<TabName>('home');
  const [lastAction, setLastAction] = useState<NavAction>('switch');
  
  const getTop = (tab: TabName): Route => {
    const s = stacks[tab];
    return s && s.length > 0 ? s[s.length - 1] : { name: tab };
  };

  const currentRoute = useMemo(() => getTop(currentTab), [stacks, currentTab]);
  const navigationParams = currentRoute?.params ?? {};

  /** 탭 전환: 스택은 보존 */
  const switchTab = (tab: TabName) => {
    setLastAction('switch');
    setCurrentTab(tab);
  };

  /** 푸시: 현재 탭 스택에 쌓기 */
  const push = (screen: RouteName, params?: any) => {
    // React의 배치 업데이트를 고려하여 상태 업데이트를 한 번에 처리
    setStacks(prev => {
      const next = { ...prev, [currentTab]: [...prev[currentTab], { name: screen, params }] };
      return next;
    });
    
    setLastAction('push');
  };

  /** 뒤로가기(pop) – 루트는 유지 */
  const goBack = () => {
    setLastAction('pop');
    setStacks(prev => {
      const cur = prev[currentTab];
      if (cur.length <= 1) return prev; // 루트면 무시
      const next = { ...prev };
      next[currentTab] = cur.slice(0, -1);
      return next;
    });
  };

  /** replace: top 교체 */
  const replace = (screen: RouteName, params?: any) => {
    setLastAction('replace');
    setStacks(prev => {
      const cur = prev[currentTab];
      const nextStack = [...cur.slice(0, -1), { name: screen, params }];
      return { ...prev, [currentTab]: nextStack };
    });
  };

  /** navigate 호환: 탭 루트면 탭전환, 아니면 push */
  const navigate = (screen: RouteName, params?: any) => {
    const isTabRoot = (['home', 'myLessons', 'store', 'my'] as RouteName[]).includes(screen);
    if (isTabRoot) {
      switchTab(screen as TabName);
    } else {
      push(screen, params);
    }
  };

  /** 현재 탭 스택 초기화(루트만 남김) */
  const resetCurrentTab = () => {
    setLastAction('reset');
    setStacks(prev => ({ ...prev, [currentTab]: [TAB_ROOT[currentTab]] }));
  };

  const value = {
    currentTab,
    currentRoute,
    navigationParams,
    switchTab,
    push,
    goBack,
    replace,
    navigate,
    resetCurrentTab,
    lastAction,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
}; 