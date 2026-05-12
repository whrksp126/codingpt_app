import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import lessonService from '../services/lessonService';
import { useUser } from './UserContext';

export interface LessonStatus {
  id: number;
  myclass_id: number;
  lesson_id: number;
  status: number; // 1: 미시작, 2: 완료
  result: any; // 학습 결과
}

export interface Slide {
  id: number;
  contents: any; // 레슨 데이터
}

export interface Lesson {
  id: number;
  order_no: number;
  name: string;
  type: string;
  description: string;
  Slides: Slide[];
}

export interface Section {
  id: number;
  order_no: number;
  name: string;
  doc_concept: Record<string, any>;
  Lessons: Lesson[];
}

export interface Class {
  id: number;
  name: string;
  description: string;
  Sections: Section[];
}

export interface Product {
  id: number;
  name: string;
  description: string;
  type: string;
  price: number;
  lecture_intro: any;
  Classes: Class[];
  myclass_id: number;
  status: LessonStatus[];
}

/** ===== 컨텍스트 타입 ===== */
export interface LessonContextType {
  lessons: Product[];
  setLessons: React.Dispatch<React.SetStateAction<Product[]>>;
  loading: boolean;
  reloadLessons: () => Promise<void>; // 외부에서 수동 갱신용

  // 현재 선택 상태(어느 제품/섹션/레슨인지)
  activeProductId: number | null;
  activeSectionId: number | null;
  activeLessonId: number | null;
  setActiveProduct: (productId: number) => void;
  setActivePSL: (productId: number, sectionId: number, lessonId: number) => void;

  // 레슨 러닝 페이로드 캐시(lessonId -> payload)
  lessonPayloads: Record<number, any>;
  getOrBuildLessonPayload: (lessonId: number) => Promise<any>;

  // 헬퍼
  getProduct: (productId: number) => Product | undefined;
  getSectionsOfProduct: (productId: number) => Section[];
  getFirstUnfinishedPointer: (product: Product) => { sectionIdx: number; lessonIdx: number };
}

const LessonContext = createContext<LessonContextType | undefined>(undefined);

// export const LessonProvider: React.FC<LessonProviderProps> = ({ children }) => {
export const LessonProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: userLoading } = useUser();
  const [lessons, setLessons] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 선택 상태
  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);

  // lessonId → 러닝 페이로드({ sliders: ... }와 같은 UI 소비 구조)
  const [lessonPayloads, setLessonPayloads] = useState<Record<number, any>>({});

  /** 데이터 로드 (내강의) */
  // 앱 시작 시 한 번만 백엔드에서 데이터 로딩
  const loadLessonData = async () => {
    // user가 없으면 데이터를 로딩하지 않음
    if (!user?.id) {
      setLessons([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await lessonService.getMyclassById(user.id);
      setLessons(data as Product[]);
    } catch (error) {
      console.error('❌ [LessonContext] 레슨 데이터 로딩 실패:', error);
      setLessons([]);
    } finally {
      setLoading(false);
    }
  };

  // user가 변경될 때마다 lesson 데이터를 다시 로딩
  useEffect(() => {
    if (!userLoading) {
      loadLessonData();
    }
  }, [user, userLoading]);

  /** 선택 상태 세터 */
  const setActiveProduct = (productId: number) => {
    setActiveProductId(productId);
    setActiveSectionId(null);
    setActiveLessonId(null);
  };
  const setActivePSL = (productId: number, sectionId: number, lessonId: number) => {
    setActiveProductId(productId);
    setActiveSectionId(sectionId);
    setActiveLessonId(lessonId);
  };

  /** 헬퍼: 컨텍스트에서 엔티티 찾기 */
  const getProduct = (productId: number) => lessons.find(p => p.id === productId);
  const getSectionsOfProduct = (productId: number): Section[] => getProduct(productId)?.Classes?.[0]?.Sections ?? [];

  /** 첫 미완료 레슨 포인터 */
  const getFirstUnfinishedPointer = (product: Product) => {
    const sections = product.Classes?.[0]?.Sections ?? [];
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];
      for (let lIdx = 0; lIdx < sec.Lessons.length; lIdx++) {
        const les = sec.Lessons[lIdx];
        const st = product.status?.find(s => s.lesson_id === les.id);
        if (!st || st.status !== 2) return { sectionIdx: sIdx, lessonIdx: lIdx };
      }
    }
    const lastS = Math.max(0, sections.length - 1);
    const lastL = Math.max(0, (sections[lastS]?.Lessons.length ?? 1) - 1);
    return { sectionIdx: lastS, lessonIdx: lastL };
  };

  /** ✨ 레슨 페이로드 빌드(로컬 Slides 기반) */
  const buildPayloadFromSlides = (slides: Slide[]) => {
    // 러닝 화면은 `{ sliders: [...] }`를 기대.
    // 1) 레거시: contents.sliders 배열 통째 → 그대로 사용
    // 2) 신규: 슬라이드별 contents가 각각 하나의 슬라이더 → background/role/title까지 보존하며 재조립
    if (!slides || slides.length === 0) return null;

    const first = slides[0]?.contents;
    if (first?.sliders) return first;

    const sliders = slides
      .map((s, idx) => {
        const c = s.contents;
        if (!c) return null;
        return {
          id: s.id ?? idx,
          title: c.title || '',
          role: c.role,
          background: c.background,
          modules: c.modules || [],
        };
      })
      .filter(Boolean);
    return sliders.length ? { sliders } : first;
  };

  /** 레슨 페이로드: 캐시 우선, 없으면 Slides로 빌드; 그래도 없으면 백업 API */
  const getOrBuildLessonPayload = async (lessonId: number): Promise<any> => {
    if (lessonPayloads[lessonId]) return lessonPayloads[lessonId];

    // 컨텍스트 데이터에서 해당 레슨 찾기
    let found: Lesson | undefined;
    outer: for (const p of lessons) {
      for (const s of p.Classes?.[0]?.Sections ?? []) {
        const m = s.Lessons.find(l => l.id === lessonId);
        if (m) { found = m; break outer; }
      }
    }

    // ✅ LessonContext.tsx 내부에 “안전 호출 래퍼” 추가
    const safeFetchSlidesByLesson = async (lessonId?: number): Promise<any> => {
      const srv = lessonService as any;               // 시그니처 불일치를 흡수
      const fn = srv.getSlidesByLesson;
      if (typeof fn !== 'function') throw new Error('lessonService.getSlidesByLesson is not a function');

      // 파라미터 개수(length)로 신규/기존 API 모두 대응
      return fn.length >= 1 ? fn(lessonId) : fn();
    };

    // Slides 기반으로 빌드
    let payload = buildPayloadFromSlides(found?.Slides ?? []);
    // 백업: 필요 시 서버 호출 (시그니처가 lessonId를 받도록 통일 권장)
    if (!payload) {
      try { const payload = await safeFetchSlidesByLesson(lessonId); }
      catch (e) { console.error('fallback fetch failed:', e); }
    }

    if (payload) {
      setLessonPayloads(prev => ({ ...prev, [lessonId]: payload }));
    }
    return payload;
  };

  const value = useMemo<LessonContextType>(() => ({
    lessons, setLessons, loading, reloadLessons: loadLessonData,
    activeProductId, activeSectionId, activeLessonId,
    setActiveProduct, setActivePSL,
    lessonPayloads, getOrBuildLessonPayload,
    getProduct, getSectionsOfProduct, getFirstUnfinishedPointer,
  }), [
    lessons, loading,
    activeProductId, activeSectionId, activeLessonId,
    lessonPayloads,
  ]);

  return <LessonContext.Provider value={value}>{children}</LessonContext.Provider>;
};

export const useLesson = (): LessonContextType => {
  const context = useContext(LessonContext);
  if (!context) throw new Error('useLesson must be used within a LessonProvider');
  return context;
};