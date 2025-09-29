// 네비게이션 파라미터 타입
// 탭 안에 각 스택을 분리해서 "네이티브 느낌"으로 관리
export type RootStackParamList = {
  Tabs: undefined; // 메인 탭
};

// 실제 앱 스크린 기준으로 스택 정의
export type HomeStackParamList = {
  HomeScreen: undefined;
  LessonDetail: any;
  ClassProgress: undefined;
  LessonLearning: any;
  LessonReport: any;
  LessonOutline: undefined;
};

export type LearnStackParamList = {
  LearnHome: undefined; // 강의 리스트(= LessonListScreen)
  LessonDetail: any;
  ClassProgress: undefined;
  LessonLearning: any;
  LessonReport: any;
  LessonOutline: undefined;
  Store: undefined;
};

export type StoreStackParamList = {
  StoreHome: undefined;
  LessonDetail: { lessonId: number } | undefined;
};

export type MyStackParamList = {
  MyHome: undefined;
  Store: undefined;
};

// 탭 라우트 네임(기존 rootTabs와 동일한 키)
export type TabsParamList = {
  home: undefined;
  myLessons: undefined;
  store: undefined;
  my: undefined;
};