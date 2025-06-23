// 앱 내 네비게이션 라우트 상수
export const routes = {
  // 인증 관련 라우트
  auth: {
    login: 'Login',
    signup: 'Signup',
    forgotPassword: 'ForgotPassword',
  },
  
  // 메인 탭 라우트
  main: {
    home: 'Home',
    lessons: 'Lessons',
    myPage: 'MyPage',
  },
  
  // 강의 관련 라우트
  lesson: {
    list: 'LessonList',
    detail: 'LessonDetail',
    slide: 'Slide',
    complete: 'LessonComplete',
    quiz: 'Quiz',
  },
  
  // 프로필 관련 라우트
  profile: {
    edit: 'ProfileEdit',
    settings: 'Settings',
    achievements: 'Achievements',
    history: 'LearningHistory',
  },
  
  // 기타 라우트
  other: {
    search: 'Search',
    notifications: 'Notifications',
    help: 'Help',
    about: 'About',
  },
} as const;

// 라우트 파라미터 타입 정의
export interface RouteParams {
  // 강의 상세 페이지 파라미터
  LessonDetail: {
    lessonId: string;
  };
  
  // 슬라이드 페이지 파라미터
  Slide: {
    lessonId: string;
    slideIndex: number;
  };
  
  // 강의 완료 페이지 파라미터
  LessonComplete: {
    lessonId: string;
    score?: number;
  };
  
  // 퀴즈 페이지 파라미터
  Quiz: {
    lessonId: string;
    quizId: string;
  };
  
  // 프로필 편집 페이지 파라미터
  ProfileEdit: {
    userId?: string;
  };
  
  // 검색 페이지 파라미터
  Search: {
    query?: string;
    category?: string;
  };
}

export default routes; 