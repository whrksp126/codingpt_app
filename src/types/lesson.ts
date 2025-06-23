// 강의 관련 타입 정의

// 강의 난이도
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

// 강의 카테고리
export type Category = 'html' | 'css' | 'javascript' | 'react' | 'nodejs' | 'python' | 'java' | 'other';

// 슬라이드 타입
export type SlideType = 'text' | 'code' | 'quiz' | 'video' | 'image';

// 강의 상태
export type LessonStatus = 'not_started' | 'in_progress' | 'completed' | 'locked';

// 기본 강의 인터페이스
export interface Lesson {
  id: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  duration: number; // 분 단위
  status: LessonStatus;
  progress: number; // 0-100
  thumbnail?: string;
  instructor: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  prerequisites?: string[];
  learningObjectives: string[];
  slides: Slide[];
  quizzes?: Quiz[];
}

// 슬라이드 인터페이스
export interface Slide {
  id: number;
  title: string;
  content: string;
  type: SlideType;
  language?: string;
  order: number;
  estimatedTime: number; // 분 단위
  isCompleted: boolean;
  metadata?: {
    videoUrl?: string;
    imageUrl?: string;
    codeExample?: string;
    explanation?: string;
  };
}

// 퀴즈 인터페이스
export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  timeLimit?: number; // 분 단위
  passingScore: number; // 0-100
  attempts: number;
  isCompleted: boolean;
  bestScore?: number;
}

// 질문 인터페이스
export interface Question {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'code';
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  points: number;
}

// 강의 진행률 인터페이스
export interface LessonProgress {
  lessonId: string;
  userId: string;
  progress: number;
  completedSlides: number[];
  completedQuizzes: string[];
  timeSpent: number; // 분 단위
  lastAccessed: string;
  startedAt: string;
  completedAt?: string;
}

// 강의 검색 필터 인터페이스
export interface LessonFilter {
  category?: Category;
  difficulty?: Difficulty;
  status?: LessonStatus;
  instructor?: string;
  tags?: string[];
  duration?: {
    min?: number;
    max?: number;
  };
  searchQuery?: string;
}

// 강의 정렬 옵션
export type LessonSortBy = 'title' | 'difficulty' | 'duration' | 'createdAt' | 'popularity' | 'rating';
export type SortOrder = 'asc' | 'desc';

// 강의 정렬 인터페이스
export interface LessonSort {
  by: LessonSortBy;
  order: SortOrder;
}

// 강의 목록 응답 인터페이스
export interface LessonListResponse {
  lessons: Lesson[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 강의 생성/수정 인터페이스
export interface CreateLessonRequest {
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  duration: number;
  instructor: string;
  tags: string[];
  prerequisites?: string[];
  learningObjectives: string[];
  slides: Omit<Slide, 'id' | 'isCompleted'>[];
  quizzes?: Omit<Quiz, 'id' | 'isCompleted' | 'bestScore'>[];
}

export interface UpdateLessonRequest extends Partial<CreateLessonRequest> {
  id: string;
}

// 강의 통계 인터페이스
export interface LessonStats {
  totalLessons: number;
  completedLessons: number;
  inProgressLessons: number;
  totalTimeSpent: number;
  averageProgress: number;
  favoriteCategory: Category;
  averageScore: number;
}

// 강의 평가 인터페이스
export interface LessonReview {
  id: string;
  lessonId: string;
  userId: string;
  rating: number; // 1-5
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

// 강의 즐겨찾기 인터페이스
export interface LessonFavorite {
  id: string;
  lessonId: string;
  userId: string;
  createdAt: string;
}

// 강의 공유 인터페이스
export interface LessonShare {
  lessonId: string;
  platform: 'email' | 'social' | 'link';
  url?: string;
  message?: string;
} 