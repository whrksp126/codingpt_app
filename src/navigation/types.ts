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
  SettingsFlow: NavigatorScreenParams<SettingsFlowStackParamList>;
  BaseModal: undefined;
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

export type LearnTabStackParamList = {
  MyLessonsScreen: undefined;
};

export type StoreTabStackParamList = {
  StoreScreen: undefined;
};

export type MyTabStackParamList = {
  MyHome: undefined;
};

export type SettingsFlowStackParamList = {
  Settings: undefined;
  MyReviews: undefined;
  Theme: undefined;
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
  };
  LessonOutline: {
    lessonId: LessonId;
  };
};