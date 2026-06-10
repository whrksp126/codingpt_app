import api from '../utils/api';
import { lessonStorage } from '../utils/storage';
import { LessonResultForDB } from '../types/lessonResult';

// 레슨 완료 시 학습자 GitHub 레포에 산출물 푸시된 결과 (결과 화면 표시용)
export interface GithubPushInfo {
  pushed: boolean;
  repoFullName: string;
  repoUrl: string;
  folderUrl?: string;
  path: string;
  fileCount: number;
}

// 상품(클래스/커리큘럼) 타입 정의
export interface Product {
  id: number;
  name: string;
  description: string;
  type: string;
  price: number;
  lecture_intro: string | null;
}

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

// export interface Slide {
//   id: number;
//   title: string;
//   content: string;
//   type: 'text' | 'code';
//   language?: string;
// }

export interface LessonItem {
  id?: number | string;
  title?: string;
  // 필요한 필드 생기면 확장
}

export interface SectionItem {
  title: string;
  progress: number;
  lessons: LessonItem[];
  concept: string;
}

export interface ClassItem {
  id: number;
  sections: SectionItem[];
}

/** 서버에서 내려오는 slide 루트 */
export interface Slide {
  id: number;
  contents: {
    class_list?: ClassItem[];
  };
}

// 강의 서비스 클래스
class LessonService {
  // RN 학습자용: 백엔드 DB의 레슨 runtime 데이터 조회 ({ id, title, sliders: [...] })
  async getLessonRuntime(lessonId: number): Promise<any | null> {
    try {
      const response = await api.lessons.getLessonRuntime(lessonId);
      if (!response?.success || !response?.data) return null;
      return response.data;
    } catch (error) {
      console.error('레슨 runtime 조회 실패:', error);
      return null;
    }
  }

  // temp
  // 레슨별 슬라이드 가져오기
  async getSlidesByLesson(): Promise<Slide> {
    try {
      const response = await api.lessons.getSlidesByLesson();

      if (!response?.success || !response?.data) {
        throw new Error('No data');
      }

      const raw = response.data as Slide | Slide[];

      // ✅ 배열로 오면 첫 번째만 사용 (현재 화면 요구사항)
      const slide: Slide = Array.isArray(raw) ? raw[0] : raw;

      if (!slide || typeof slide !== 'object') {
        throw new Error('Invalid slide shape');
      }
      return slide;
    } catch (error) {
      console.error('레슨별 슬라이드 가져오기 실패:', error);
      return {
        id: 0,
        contents: { class_list: [] },
      };;
    }
  }

  // 레슨별 학습 상태 및 결과 저장
  async completeLessonWithResult(params: {
    userId: number;
    myclassId: number;
    lessonId: number;
    result: any;  // curLesson 전체 JSON
  }): Promise<{ status: number; addedXp: number; totalXp: number; github?: GithubPushInfo | null } | null> {
    try {
      if (!params.userId || !params.myclassId || !params.lessonId) {
        console.error('필수 파라미터 누락:', params);
        return null;
      }

      const response = await api.myclass.complete({
        user_id: params.userId,
        myclass_id: params.myclassId,
        lesson_id: params.lessonId,
        result: params.result,
      });

      if (response.success && response.data) {
        const inner: any = (response.data as any)?.data ?? response.data;
        if (inner && typeof inner === 'object' && 'addedXp' in inner) {
          return {
            status: Number(inner.status ?? 2),
            addedXp: Number(inner.addedXp ?? 0),
            totalXp: Number(inner.totalXp ?? 0),
            github: inner.github ?? null,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('레슨별 학습 결과 저장 실패:', error);
      return null;
    }
  }

  // 학습 결과 조회
  async getLessonResult(userId: number, lessonId: number): Promise<any> {
    try {
      const response = await api.myclass.getLessonResult(userId, lessonId);
      console.log("학습 결과 조회 서비스 response,", response);
      return response.data;
    } catch (error) {
      console.error('학습 결과 조회 실패:', error);
      return null;
    }
  }

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

  // 내강의 가져오기
  async getMyclassById(id: number): Promise<Product[]> {
    try {
      const response = await api.lessons.getById(id);
      if (response.success && response.data) {
        const myclassList = response.data as Product[];
        //const progress = await lessonStorage.getProgress(id);

        return myclassList.map((myclass) => ({
          ...myclass,
          //progress: progress || 0,
        }));
      }
      return [];
    } catch (error) {
      console.error('내강의 가져오기 실패:', error);
      return [];
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

  // 특정 강의 수강 여부 확인하기
  async getMyclass(userId: number, productId: number): Promise<boolean> {
    const res = await api.myclass.checkEnrolled(userId, productId);
    return res.success && res.data === true;
  }

  // 슬라이드 코드 빈칸 채우기 컨텐츠 가져오기
  // 데이터 없음(레코드 미존재)과 실제 네트워크/서버 에러를 구분해, 데이터 없음은 warn 으로 다운그레이드.
  async getSlideCodeFillContent(slideId: number): Promise<string> {
    try {
      const response = await api.lessons.getSlideCodeFillContent(slideId);
      if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0].content;
      }
      // 백엔드는 정상 응답했으나 레코드가 없는 정상 케이스 — 빈 문자열로 진행
      console.warn(`[codefill] slide ${slideId} 에 대한 코드 빈칸 채우기 레코드가 없습니다.`);
      return '';
    } catch (error) {
      console.error('슬라이드 코드 빈칸 채우기 컨텐츠 가져오기 실패:', error);
      return '';
    }
  }

  // 내강의 등록하기
  async postMyclass(userId: number, productId: number): Promise<boolean> {
    const data = { user_id: userId, product_id: productId };
    const res = await api.myclass.postMyclass(data);
    return res.success === true;
  }

  // 학습 결과 저장
  // async saveLessonResult(lessonResult: LessonResultForDB): Promise<boolean> {
  //   try {
  //     const response = await api.lessons.saveLessonResult(lessonResult);
  //     return response.success;
  //   } catch (error) {
  //     console.error('학습 결과 저장 실패:', error);
  //     return false;
  //   }
  // }

  /**
   * 백엔드 코드 실행 SSE 스트림 연결
   * @param code 실행할 코드
   * @param language 언어 (js, py, java 등)
   * @param onMessage 데이터 수신 시 콜백
   * @param onError 에러 발생 시 콜백
   * @param onComplete 연결 종료 시 콜백
   */
  /**
   * 캐시 우선 실행. cachedResult 가 있고 executionMode 가 'live' 가 아니면 즉시 stream 처럼 emit.
   * 그 외엔 streamCodeExecution 위임.
   *
   * 코드 해시 mismatch 검증은 백엔드 getLessonRuntime 의 _stripStaleCache 가 이미 처리.
   * 즉 RN 으로 도착한 cachedResult 는 항상 유효 — 그대로 신뢰.
   */
  async runCachedOrStream(opts: {
    code: string;
    language: string;
    cachedResult?: {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      durationMs?: number;
      codeHash: string;
      language: string;
      executedAt: string;
    } | null;
    executionMode?: 'cached' | 'live';
    onMessage: (data: any) => void;
    onError?: (error: string) => void;
    onComplete?: () => void;
  }) {
    const { code, language, cachedResult, executionMode, onMessage, onError, onComplete } = opts;
    if (cachedResult && executionMode !== 'live') {
      // 캐시된 결과를 stream 형태로 emit — 호출 측 콜백 시그니처 통일 (streamCodeExecution 와 동일).
      try {
        if (cachedResult.stdout) onMessage({ type: 'output', data: cachedResult.stdout });
        if (cachedResult.stderr) onMessage({ type: 'error', data: cachedResult.stderr });
        onMessage({ type: 'close', exitCode: cachedResult.exitCode ?? -1, hasError: !!cachedResult.stderr });
        onComplete?.();
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '캐시 표시 중 에러');
      }
      // abort 함수 — 캐시는 동기 처리라 noop
      return () => {};
    }
    return this.streamCodeExecution(code, language, onMessage, onError, onComplete);
  }

  async streamCodeExecution(
    code: string,
    language: string,
    onMessage: (data: any) => void,
    onError?: (error: string) => void,
    onComplete?: () => void
  ) {
    let processedIndex = 0;
    // SSE 청크 경계가 라인 중간에서 잘릴 경우 미완성 라인을 보관해 다음 청크와 합쳐 처리.
    // (XHR readyState 3 은 데이터 도착 시점에 임의 경계에서 발생하므로 라인 보존 필수)
    let pendingLine = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      try {
        const jsonStr = trimmed.substring(5).trim();
        const data = JSON.parse(jsonStr);
        onMessage(data);
      } catch (e) {
        console.error('SSE JSON 파싱 에러:', e, 'Line:', trimmed);
      }
    };

    const xhr = await api.executor.executeStream(
      { code, language },
      (xhr) => {
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          const chunk = xhr.responseText.substring(processedIndex);
          processedIndex = xhr.responseText.length;

          const combined = pendingLine + chunk;
          const lines = combined.split('\n');
          // 마지막 요소는 다음 청크와 이어질 미완성 라인일 수 있으므로 보관.
          pendingLine = lines.pop() ?? '';

          lines.forEach(processLine);
        }

        if (xhr.readyState === 4) {
          // 종료 시점에 보관된 마지막 라인이 완성된 SSE 메시지라면 처리.
          if (pendingLine) {
            processLine(pendingLine);
            pendingLine = '';
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            onComplete?.();
          } else {
            onError?.(`서버 에러: ${xhr.status}`);
          }
        }
      },
      (error) => {
        onError?.(error instanceof Error ? error.message : '네트워크 연결 에러가 발생했습니다.');
      }
    );

    // 필요 시 연결을 끊을 수 있도록 abort 함수 반환
    return () => xhr?.abort();
  }
}

export default new LessonService(); 