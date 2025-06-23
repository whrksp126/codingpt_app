import React, { createContext, useState, ReactNode } from 'react';

interface Lesson {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  progress: number;
}

interface LessonContextType {
  lessons: Lesson[];
  currentLesson: Lesson | null;
  setCurrentLesson: (lesson: Lesson | null) => void;
  updateLessonProgress: (lessonId: string, progress: number) => void;
  getLessonById: (id: string) => Lesson | undefined;
}

export const LessonContext = createContext<LessonContextType | undefined>(undefined);

interface LessonProviderProps {
  children: ReactNode;
}

export const LessonProvider: React.FC<LessonProviderProps> = ({ children }) => {
  const [lessons, setLessons] = useState<Lesson[]>([
    {
      id: '1',
      title: 'HTML 기초',
      description: '웹 개발의 첫 걸음, HTML 태그를 배워보세요',
      duration: '30분',
      difficulty: 'beginner',
      progress: 0,
    },
    {
      id: '2',
      title: 'CSS 스타일링',
      description: '웹페이지를 아름답게 꾸며보세요',
      duration: '45분',
      difficulty: 'beginner',
      progress: 25,
    },
    {
      id: '3',
      title: 'JavaScript 기초',
      description: '동적인 웹페이지를 만들어보세요',
      duration: '60분',
      difficulty: 'intermediate',
      progress: 0,
    },
    {
      id: '4',
      title: 'React 기초',
      description: '현대적인 웹 개발을 위한 React 프레임워크',
      duration: '90분',
      difficulty: 'intermediate',
      progress: 0,
    },
    {
      id: '5',
      title: 'Node.js 서버 개발',
      description: '백엔드 개발의 기초를 배워보세요',
      duration: '120분',
      difficulty: 'advanced',
      progress: 0,
    },
  ]);

  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);

  const updateLessonProgress = (lessonId: string, progress: number) => {
    setLessons(prevLessons =>
      prevLessons.map(lesson =>
        lesson.id === lessonId
          ? { ...lesson, progress: Math.max(lesson.progress, progress) }
          : lesson
      )
    );
  };

  const getLessonById = (id: string) => {
    return lessons.find(lesson => lesson.id === id);
  };

  const value: LessonContextType = {
    lessons,
    currentLesson,
    setCurrentLesson,
    updateLessonProgress,
    getLessonById,
  };

  return (
    <LessonContext.Provider value={value}>
      {children}
    </LessonContext.Provider>
  );
}; 