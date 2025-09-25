// 네비게이션 파라미터 타입 (TS 전용)
// 탭 안에 각 스택을 분리해서 "네이티브 느낌"으로 관리
export type RootStackParamList = {
  Tabs: undefined;         // 메인 탭
  TestModal: undefined;    // 모달(옵션)
};

export type HomeStackParamList = {
  Home: undefined;
  Details: undefined;
};

export type LearnStackParamList = {
  LearnHome: undefined;
  Lesson: undefined;
};

export type MyStackParamList = {
  MyHome: undefined;
  Settings?: undefined;
};
