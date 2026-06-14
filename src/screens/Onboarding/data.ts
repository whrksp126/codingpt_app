import React from 'react';
import {
  GraduationCap, Code, PenNib, ClipboardText, Rocket, Briefcase, Target, DotsThreeCircle,
  YoutubeLogo, InstagramLogo, MagnifyingGlass, UsersThree, AppStoreLogo, Article, Megaphone,
  Plant, Sparkle, Lightning, RocketLaunch, Lightbulb, Gear, Cards, Compass,
  IconProps,
} from 'phosphor-react-native';

export type SurveyKey = 'job' | 'referralSource' | 'aiExperience' | 'purposes';

export interface SurveyOption {
  Icon: React.ComponentType<IconProps>;
  label: string;       // 저장 값 = 라벨
  sub?: string;
}

export interface SurveyQuestion {
  key: SurveyKey;
  topic: string;       // 상단 프로그래스 라벨 (Survey · {topic})
  title: string;
  sub?: string;
  layout: 'grid' | 'list';
  multi?: boolean;
  cta: string;
  options: SurveyOption[];
}

// 설문 4단계 — 디자인 OnboardingSurvey.jsx 원본 그대로.
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: 'job',
    topic: '직업',
    title: '어떤 일을 하고 계세요?',
    sub: '배경에 맞춰 가이드와 예제를 골라드려요.',
    layout: 'grid',
    cta: '다음',
    options: [
      { Icon: GraduationCap, label: '학생' },
      { Icon: Code, label: '개발자' },
      { Icon: PenNib, label: '디자이너' },
      { Icon: ClipboardText, label: '기획 · PM' },
      { Icon: Rocket, label: '창업 · 1인 개발' },
      { Icon: Briefcase, label: '직장인' },
      { Icon: Target, label: '취준 · 이직' },
      { Icon: DotsThreeCircle, label: '기타' },
    ],
  },
  {
    key: 'referralSource',
    topic: '유입경로',
    title: '코딩PT를 어떻게 알게 되셨어요?',
    layout: 'list',
    cta: '다음',
    options: [
      { Icon: YoutubeLogo, label: '유튜브' },
      { Icon: InstagramLogo, label: '인스타그램 · SNS' },
      { Icon: MagnifyingGlass, label: '검색 (구글 · 네이버)' },
      { Icon: UsersThree, label: '지인 추천' },
      { Icon: AppStoreLogo, label: '앱스토어 둘러보다' },
      { Icon: Article, label: '블로그 · 커뮤니티' },
      { Icon: Megaphone, label: '광고를 보고' },
    ],
  },
  {
    key: 'aiExperience',
    topic: 'AI경험',
    title: 'AI 코딩 도구, 써보셨나요?',
    sub: '수준에 맞춰 설명의 깊이를 조절할게요.',
    layout: 'list',
    cta: '다음',
    options: [
      { Icon: Plant, label: '처음이에요', sub: 'AI 코딩 도구가 낯설어요' },
      { Icon: Sparkle, label: '몇 번 써봤어요', sub: '가끔 ChatGPT에 물어봐요' },
      { Icon: Lightning, label: '자주 사용해요', sub: '일하면서 꾸준히 활용해요' },
      { Icon: RocketLaunch, label: '능숙하게 써요', sub: 'ChatGPT · Claude가 일상이에요' },
    ],
  },
  {
    key: 'purposes',
    topic: '사용목적',
    title: '코딩PT로 무엇을 하고 싶으세요?',
    sub: '여러 개 선택할 수 있어요.',
    layout: 'grid',
    multi: true,
    cta: '완료',
    options: [
      { Icon: RocketLaunch, label: '나만의 앱 · 웹 만들기' },
      { Icon: Lightbulb, label: '사이드프로젝트 · 창업' },
      { Icon: GraduationCap, label: '코딩 배우기' },
      { Icon: Gear, label: '업무 자동화' },
      { Icon: Cards, label: '포트폴리오 만들기' },
      { Icon: Compass, label: '그냥 둘러보기' },
    ],
  },
];

export type MockKind = 'chat' | 'code' | 'lesson';

export interface CarouselStep {
  title: string;
  body: string;
  mock: MockKind;
}

// 진입 온보딩 캐러셀 3스텝 — 디자인 Batch1.jsx STEPS.
export const CAROUSEL_STEPS: CarouselStep[] = [
  {
    title: '말하면, 앱이 만들어져요',
    body: '만들고 싶은 걸 한국어로 설명하면\nAI 에이전트가 파일을 만들고 코드를 작성해요.',
    mock: 'chat',
  },
  {
    title: '코드는 IDE에서 실시간으로',
    body: '에이전트가 바꾼 코드를 모바일 IDE에서\n바로 보고, 고치고, 실행해요.',
    mock: 'code',
  },
  {
    title: '모르면, 바로 배우기',
    body: '막히는 개념은 3분 레슨으로 익히고\n곧장 이어서 코딩해요.',
    mock: 'lesson',
  },
];
