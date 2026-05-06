// src/data/class/classIntro_html_new.ts
// HTML 강의에 대한 상세한 강의 소개 데이터 (Tailwind 색상 활용)
import type { ShowcaseBlock } from '../../components/ClassIntro';

// 로컬 이미지
const mascotHtml = require('../../assets/images/mascot_html.png');

/**
 * HTML 강의 소개 블록 데이터
 * 10개의 레슨 내용을 기반으로 구성:
 * 1. HTML의 역할
 * 2. HTML의 기본 구조
 * 3. HTML 요소
 * 4. HTML 속성(Attribute)
 * 5. 텍스트 태그
 * 6. 정보를 나열하는 목록 태그
 * 7. 클릭하면 이동하는 링크 태그
 * 8. 영역을 나누는 보이지 않는 박스
 * 9. 의미를 담은 이름표, 시맨틱 태그
 * 10. [종합 실습] 나만의 프로필 페이지 만들기
 */
export const htmlClassIntroBlocks: ShowcaseBlock[] = [
  // ========== 메인 헤드라인 ==========
  { 
    type: 'headline', 
    kicker: '코딩 입문자를 위한 첫 걸음', 
    title: 'HTML로 시작하는 웹 개발', 
    subtitle: '웹 페이지의 뼈대를 만드는 기초부터 실전 프로필 페이지 제작까지', 
    hero: mascotHtml,
    tags: ['HTML 기초', '태그 마스터', '시맨틱 태그', '실전 프로젝트'],
    stats: [
      { label: '총 레슨', value: '10개' },
      { label: '예상 시간', value: '2~3시간' },
      { label: '난이도', value: '입문' }
    ]
  },

  // ========== 핵심 특징 카드 ==========
  { 
    type: 'featureCards', 
    items: [
      { 
        emoji:'', 
        title: 'HTML의 역할과 기본 구조', 
        desc: '웹 페이지를 구성하는 HTML의 역할과 기본 문서 구조를 이해합니다'
      },
      { 
        emoji:'', 
        title: '요소와 속성 완벽 정복', 
        desc: 'HTML 요소(Element)와 속성(Attribute)의 개념을 실습으로 익힙니다'
      },
      { 
        emoji:'', 
        title: '다양한 태그 활용', 
        desc: '텍스트, 목록, 링크, 박스 등 실무에서 사용하는 핵심 태그들을 마스터합니다'
      },
    ]
  },

  // ========== 게임형 학습 모자이크 ==========
  { 
    type: 'mosaic',
    headline: '🎮 재미있게 배우는 체계적인 커리큘럼',
    sub: '단계별 미션을 완료하며 자연스럽게 HTML을 익혀요',
    badges: [
      { emoji:'', title: 'HTML 소개', desc: 'HTML이 무엇인지 알아봅니다' },
      { emoji:'', title: '기본 구조', desc: 'DOCTYPE, html, head, body' },
      { emoji:'', title: '요소 이해', desc: '태그의 구조와 작성법' },
      { emoji:'', title: '속성 활용', desc: 'class, id, src, href 등' },
      { emoji:'', title: '텍스트 태그', desc: 'h1~h6, p, strong, em' },
      { emoji:'', title: '목록 태그', desc: 'ul, ol, li로 정보 나열' },
    ]
  },

  // ========== 학습 타임라인 ==========
  { 
    type: 'timeline',
    title: '👨‍💻 체계적인 10단계 학습 로드맵',
    subtitle: '기초부터 실전 프로젝트까지 단계별로 완성해요',
    items: [
      { 
        step: '1-2', 
        title: 'HTML 기초 다지기', 
        desc: 'HTML의 역할과 기본 문서 구조 이해하기'
      },
      { 
        step: '3-4', 
        title: '요소와 속성 마스터', 
        desc: 'HTML 요소와 속성의 개념을 실습으로 익히기'
      },
      { 
        step: '5-7', 
        title: '핵심 태그 활용', 
        desc: '텍스트, 목록, 링크 태그로 콘텐츠 구성하기'
      },
      { 
        step: '8-9', 
        title: '레이아웃과 시맨틱', 
        desc: 'div/span과 시맨틱 태그로 구조화하기'
      },
      { 
        step: '10', 
        title: '종합 실습 프로젝트', 
        desc: '나만의 프로필 페이지 완성하기'
      },
    ]
  },

  // ========== 구분선 ==========
  { type: 'divider' },

  // ========== 상세 커리큘럼 ==========
  { 
    type: 'featureCards', 
    items: [
      { 
        emoji:'', 
        title: '링크와 연결', 
        desc: '클릭하면 다른 페이지로 이동하는 링크 태그 사용법'
      },
      { 
        emoji:'', 
        title: '영역 나누기', 
        desc: 'div와 span으로 요소들을 그룹화하고 영역 구분하기'
      },
      { 
        emoji:'', 
        title: '시맨틱 태그', 
        desc: 'header, main, section 등 의미있는 태그로 구조 개선'
      },
    ]
  },

  // ========== 코드 예제 ==========
  { 
    type: 'code', 
    lang: 'html', 
    content: 
`<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>나의 첫 HTML 페이지</title>
  </head>
  <body>
    <header>
      <h1>안녕하세요! 👋</h1>
    </header>
    
    <main>
      <section>
        <h2>소개</h2>
        <p>HTML을 배우고 있는 초보 개발자입니다.</p>
      </section>
      
      <section>
        <h2>관심사</h2>
        <ul>
          <li>웹 개발</li>
          <li>프론트엔드</li>
          <li>UI/UX 디자인</li>
        </ul>
      </section>
    </main>
    
    <footer>
      <a href="mailto:hello@example.com">연락하기</a>
    </footer>
  </body>
</html>`
  },

  // ========== CTA (Call to Action) ==========
  { 
    type: 'cta', 
    text: '지금 바로 시작해서 첫 웹 페이지를 만들어보세요! 코딩이 처음이어도 괜찮아요. 함께 차근차근 배워나가요! 🚀'
  },
];

/**
 * 강의명을 기반으로 적절한 강의 소개 블록을 반환하는 함수
 * 기존 classIntro_data.ts의 showcaseByProductName과 함께 사용 가능
 */
export const getHtmlClassIntro = (productName?: string): ShowcaseBlock[] => {
  // HTML 관련 키워드가 있으면 새로운 상세 버전 반환
  const key = (productName || '').toLowerCase();
  if (key.includes('html') || key.includes('에이치티엠엘')) {
    return htmlClassIntroBlocks;
  }
  
  // 기본값
  return htmlClassIntroBlocks;
};

