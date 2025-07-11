import api from '../utils/api';
import { lessonStorage } from '../utils/storage';

// 강의 타입 정의
export interface Lesson {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  progress: number;
  slides?: Slide[];
}

export interface Slide {
  id: number;
  title: string;
  content: string;
  type: 'text' | 'code';
  language?: string;
}

// 강의 서비스 클래스
class LessonService {
  // 모든 강의 가져오기
  async getAllLessons(): Promise<Lesson[]> {
    try {
      const response = await api.lessons.getAll();
      if (response.success && response.data) {
        // 로컬 진행률과 병합
        const lessons = response.data as Lesson[];
        const progressData = await lessonStorage.getAllProgress();
        
        return lessons.map(lesson => ({
          ...lesson,
          progress: (progressData as any)[lesson.id] || 0,
        }));
      }
      return [];
    } catch (error) {
      console.error('강의 목록 가져오기 실패:', error);
      return [];
    }
  }

  // 특정 강의 가져오기
  async getLessonById(id: string): Promise<Lesson | null> {
    try {
      const response = await api.lessons.getById(id);
      if (response.success && response.data) {
        const lesson = response.data as Lesson;
        const progress = await lessonStorage.getProgress(id);
        
        return {
          ...lesson,
          progress: progress || 0,
        };
      }
      return null;
    } catch (error) {
      console.error('강의 가져오기 실패:', error);
      return null;
    }
  }

  // 강의 진행률 업데이트
  async updateProgress(lessonId: string, progress: number): Promise<boolean> {
    try {
      // 로컬 스토리지에 저장
      await lessonStorage.setProgress(lessonId, progress);
      
      // 서버에 업데이트
      const response = await api.lessons.updateProgress(lessonId, progress);
      
      if (response.success) {
        // 최근 학습한 강의에 추가
        await lessonStorage.setRecentLesson(lessonId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('진행률 업데이트 실패:', error);
      return false;
    }
  }

  // 강의 진행률 가져오기
  async getProgress(lessonId: string): Promise<number> {
    try {
      const progress = await lessonStorage.getProgress(lessonId);
      return progress || 0;
    } catch (error) {
      console.error('진행률 가져오기 실패:', error);
      return 0;
    }
  }

  // 최근 학습한 강의 가져오기
  async getRecentLessons(): Promise<string[]> {
    try {
      const recentLessons = await lessonStorage.getRecentLessons();
      return recentLessons || [];
    } catch (error) {
      console.error('최근 강의 가져오기 실패:', error);
      return [];
    }
  }

  // 강의 검색
  async searchLessons(query: string): Promise<Lesson[]> {
    try {
      const allLessons = await this.getAllLessons();
      const lowerQuery = query.toLowerCase();
      
      return allLessons.filter(lesson =>
        lesson.title.toLowerCase().includes(lowerQuery) ||
        lesson.description.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('강의 검색 실패:', error);
      return [];
    }
  }

  // 난이도별 강의 필터링
  async getLessonsByDifficulty(difficulty: string): Promise<Lesson[]> {
    try {
      const allLessons = await this.getAllLessons();
      
      if (difficulty === 'all') {
        return allLessons;
      }
      
      return allLessons.filter(lesson => lesson.difficulty === difficulty);
    } catch (error) {
      console.error('난이도별 강의 필터링 실패:', error);
      return [];
    }
  }

  // 완료한 강의 가져오기
  async getCompletedLessons(): Promise<Lesson[]> {
    try {
      const allLessons = await this.getAllLessons();
      return allLessons.filter(lesson => lesson.progress === 100);
    } catch (error) {
      console.error('완료한 강의 가져오기 실패:', error);
      return [];
    }
  }

  // 진행 중인 강의 가져오기
  async getInProgressLessons(): Promise<Lesson[]> {
    try {
      const allLessons = await this.getAllLessons();
      return allLessons.filter(lesson => lesson.progress > 0 && lesson.progress < 100);
    } catch (error) {
      console.error('진행 중인 강의 가져오기 실패:', error);
      return [];
    }
  }
}

export default new LessonService(); 