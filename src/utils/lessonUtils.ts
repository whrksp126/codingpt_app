import * as i18n from '../i18n/index.ts';
/*
  ** 레슨 관련 유틸 함수 **
*/


/**
 * 레슨 상태 타입
 */
export type LessonStatus = {
id: number;
myclass_id: number;
lesson_id: number;
status: number; // 2 = 완료
};

/**
 * 레슨 타입
 */
type Lesson = {
id: number;
order_no: number;
name: string;
type: string;
description: string;
};

type Section = {
id: number;
order_no: number;
name: string;
doc_concept: any;
Lessons: Lesson[];
};

type Class = {
id: number;
name: string;
description: string;
Sections: Section[];
};

type Product = {
id: number;
name: string;
description: string;
type: string;
price: number;
lecture_intro: any;
Classes: Class[];
myclass_id: number;
status: LessonStatus[];
};

export type ParsedLesson = {
id: string;
title: string;
description: string;
date: string;
progress: number;
status: '수강중' | '수강완료';
};

/**
 * 아이콘 자동 매칭 함수
 */
export const getIconByTitle = (title: string): any => {
if (title.includes('HTML')) return require('../assets/icons/html-5-icon.png');
if (title.includes('CSS')) return require('../assets/icons/css-3-icon.png');
if (title.includes('자바스크립트')) return require('../assets/icons/js-icon.png');
if (title.includes('파이썬')) return require('../assets/icons/python-icon.png');
return require('../assets/icons/js-icon.png');
};

/**
 * 레슨 전체 수강 정보 파싱
 */
export const parseLessonList = (lessons: Product[]): ParsedLesson[] => {
  return lessons.map((lesson) => {
    // 전체 레슨 ID 목록 수집
    const lessonIdsInProduct: number[] = lesson.Classes.flatMap((cls) =>
      cls.Sections.flatMap((section) => section.Lessons.map((l) => l.id))
    );

    const totalLessons = lessonIdsInProduct.length;

    // 실제 레슨 ID만 필터링하여 완료 수 계산
    const completedLessons = lesson.status.filter(
      (s) => s.status === 2 && lessonIdsInProduct.includes(s.lesson_id)
    ).length;

    const progress =
      totalLessons === 0 ? 0 : Math.min(100, Math.round((completedLessons / totalLessons) * 100));

    return {
      id: lesson.id.toString(),
      title: lesson.name,
      description: lesson.description.replace(/\\n/g, '\n'),
      date: i18n.t('1일 전'),
      progress,
      status: progress === 100 ? '수강완료' : '수강중',
    };
  });
};

/**
 * LessonDetailScreen에서 사용할 함수
 * 목차(section) 개수, 레슨(lesson) 개수 계산
 */
export const countSectionsAndLessons = (product: Product): { sectionCount: number; lessonCount: number } => {
  let sectionCount = 0;
  let lessonCount = 0;

  product.Classes.forEach((cls) => {
    cls.Sections.forEach((sec) => {
      sectionCount++;
      lessonCount += sec.Lessons.length;
    });
  });

  return { sectionCount, lessonCount };
};