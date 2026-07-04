import type { NavigatorScreenParams } from '@react-navigation/native';
import type React from 'react';

/** ---------------------------------------------------------
 * 전역 RootStack
 * - Tabs: 하단 탭
 * - LessonFlow: 상세/학습 전용 공통 스택
 * ------------------------------------------------------- */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList>;
  LessonFlow: NavigatorScreenParams<LessonFlowStackParamList>;
  BaseModal: undefined;
  MobileIDE: {
    lessonId?: number;
    moduleId?: string | number;
    ide: {
      projectId: string;
      projectName?: string;
      entryFile?: string;
      initialTabs?: string[];
      activeTab?: string;
      highlights?: Record<string, Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>>;
    };
  };
};

/** ---------------------------------------------------------
 * Tabs (하단)
 * ------------------------------------------------------- */
export type TabsParamList = {
  home: NavigatorScreenParams<HomeTabStackParamList>;
  myLessons: NavigatorScreenParams<LearnTabStackParamList>;
  store: NavigatorScreenParams<StoreTabStackParamList>;
  my: NavigatorScreenParams<MyTabStackParamList>;
};

/** ---------------------------------------------------------
 * 각 탭의 얕은 스택 (루트만)
 * ------------------------------------------------------- */
export type HomeTabStackParamList = {
  HomeScreen: undefined;
};

// 배우기 클래스(그리드 셀) — 배치4 디자인 목업 데이터
export type LearnClassState = 'done' | 'tested' | 'current' | 'todo';
export type ClassDetailVariant = 'done' | 'enrolled' | 'free' | 'paywall';
export type LearnClass = {
  n: string;
  t: string;
  d: string;
  lessons: number;
  state: LearnClassState;
  pct?: number;
  productId: number; // 실제 상품 id — 상세 화면에서 목차/진행 데이터 lookup
};

export type LearnTabStackParamList = {
  MyLessonsScreen: undefined;
  ClassDetail: {
    cls: LearnClass;
    variant: ClassDetailVariant;
  };
};

// 'store' 탭 슬롯을 바이브코딩 '프로젝트' 화면으로 재활용 (라우트 키 'store'는 유지 — 무파손)
export type StoreTabStackParamList = {
  ProjectsScreen: undefined;
  StoreScreen: undefined; // (구) 상점 — 탭에서 제외, 추후 내 정보로 이동
};

export type MyTabStackParamList = {
  MyHome: undefined;
};

/** ---------------------------------------------------------
 * 전역 공유 레슨 플로우
 * - 어떤 경로로 진입했는지 추적하려면 fromTab/entryMeta 등 메타 필드 활용
 * ------------------------------------------------------- */
export type LessonId = number;
export type ProductId = number;
export type SectionId = number;

// LessonDetail 탭 타입
export type LessonDetailTab = '강의소개' | '목차' | '관련상품' | '후기';

export type LessonFlowStackParamList = {
  LessonDetail: (
    // 실제 화면에서 사용하는 상품 상세 진입 페이로드
    {
      id: ProductId;
      name: string;
      icon: any;
      description: string;
      price: number;
      fromTab?: keyof TabsParamList;
      entryMeta?: Record<string, any>;
      initialTab?: LessonDetailTab; // 초기 탭 지정
    }
    // 필요 시 레슨 아이디 기반으로도 진입 가능하도록 확장
    | {
      lessonId: LessonId;
      productId?: ProductId;
      sectionId?: SectionId;
      fromTab?: keyof TabsParamList;
      entryMeta?: Record<string, any>;
      initialTab?: LessonDetailTab; // 초기 탭 지정
    }
  );
  ClassProgress: {
    productId: ProductId;
    from?: 'LessonDetail' | 'external';
  };
  LessonLearning: {
    lessonId: LessonId;
    myclassId?: number;
    mode?: 'learn' | 'review';
    lessonData?: any;
  };
  HtmlLessonScreen: {
    lessonId?: LessonId;
    lessonData?: any;
  };
  LessonReport: {
    curLesson: any;
    nextLessonId?: LessonId;
  };
  LessonOutline: {
    lessonId: LessonId;
  };
};