// src/data/class/classIntro_css_new.ts
// CSS 강의에 대한 상세한 강의 소개 데이터 (Tailwind 색상 활용)
import type { ShowcaseBlock } from '../../components/ClassIntro';

// 로컬 이미지
const mascotCss = require('../../assets/images/mascot_css.png');

/**
 * CSS 강의 소개 블록 데이터
 * 10개의 레슨 내용을 기반으로 구성:
 * 1. CSS의 역할
 * 2. CSS 사용법
 * 3. CSS를 연결하는 법
 * 4. 원하는 것만 쏙 고르는 선택자
 * 5. 색상과 배경
 * 6. 텍스트 꾸미기
 * 7. 안쪽 여백 주기 (Padding)
 * 8. 바깥 여백 주기 (Margin)
 * 9. 블록과 인라인
 * 10. [종합 실습] 나만의 프로필 페이지 꾸미기
 */
export const cssClassIntroBlocks: ShowcaseBlock[] = [
  // ========== 메인 헤드라인 ==========
  { 
    type: 'headline', 
    kicker: '웹사이트를 아름답게 만드는 마법', 
    title: 'CSS로 디자인하는 웹 스타일링', 
    subtitle: 'HTML에 색깔과 생명을 불어넣는 스타일시트 완전 정복', 
    hero: mascotCss,
    tags: ['색상 디자인', '텍스트 스타일', '박스 모델', '레이아웃'],
    stats: [
      { label: '총 레슨', value: '10개' },
      { label: '예상 시간', value: '2.5~3.5시간' },
      { label: '난이도', value: '입문~초급' }
    ]
  },

  // ========== 핵심 특징 카드 ==========
  { 
    type: 'featureCards', 
    items: [
      { 
        emoji:'', 
        title: 'CSS의 역할과 사용법', 
        desc: '웹사이트에 색깔을 입히고 HTML과 CSS를 연결하는 다양한 방법을 배웁니다'
      },
      { 
        emoji:'', 
        title: '선택자로 원하는 요소만 꾸미기', 
        desc: '태그, 클래스, ID 선택자를 활용하여 원하는 요소만 정확하게 스타일링합니다'
      },
      { 
        emoji:'', 
        title: '색상, 텍스트, 여백 마스터', 
        desc: '색상과 배경, 텍스트 꾸미기, padding/margin으로 완벽한 레이아웃 구성'
      },
    ]
  },

  // ========== 게임형 학습 모자이크 ==========
  { 
    type: 'mosaic',
    headline: '🎨 단계별로 배우는 체계적인 스타일링',
    sub: '심심한 HTML을 화려하게 변신시켜요!',
    badges: [
      { emoji:'', title: 'CSS 소개', desc: '스타일시트의 역할 이해' },
      { emoji:'', title: 'CSS 문법', desc: '선택자와 속성 작성법' },
      { emoji:'', title: 'CSS 연결', desc: '인라인, 내부, 외부 스타일' },
      { emoji:'', title: '선택자', desc: 'class, id, 태그 선택자' },
      { emoji:'', title: '색상 디자인', desc: 'color, background-color' },
      { emoji:'', title: '텍스트 스타일', desc: 'font-size, font-weight' },
    ]
  },

  // ========== 학습 타임라인 ==========
  { 
    type: 'timeline',
    title: '👨‍💻 CSS 마스터가 되는 10단계 여정',
    subtitle: '기초 문법부터 완성도 높은 페이지 디자인까지',
    items: [
      { 
        step: '1-3', 
        title: 'CSS 기초와 연결 방법', 
        desc: 'CSS의 역할, 문법 규칙, HTML과 연결하는 3가지 방법 배우기'
      },
      { 
        step: '4-5', 
        title: '선택자와 색상 디자인', 
        desc: '원하는 요소만 선택하고 웹사이트 분위기를 결정하는 색상 적용'
      },
      { 
        step: '6', 
        title: '텍스트 스타일링', 
        desc: '글자 크기, 두께, 정렬로 가독성 높은 텍스트 만들기'
      },
      { 
        step: '7-8', 
        title: '박스 모델 완성', 
        desc: 'Padding과 Margin으로 여백을 조절하여 깔끔한 레이아웃 구성'
      },
      { 
        step: '9-10', 
        title: '블록/인라인과 종합 실습', 
        desc: '요소 배치 방법을 이해하고 나만의 프로필 페이지 완성'
      },
    ]
  },

  // ========== 구분선 ==========
  { type: 'divider' },

  // ========== 상세 학습 내용 ==========
  { 
    type: 'featureCards', 
    items: [
      { 
        emoji:'', 
        title: '박스 모델 이해', 
        desc: 'Padding과 Margin의 차이를 배우고 요소의 크기와 여백을 자유자재로 조절'
      },
      { 
        emoji:'', 
        title: '블록과 인라인', 
        desc: '요소들이 줄 서는 방법을 이해하고 display 속성으로 레이아웃 제어'
      },
      { 
        emoji:'', 
        title: '실전 프로젝트', 
        desc: '배운 모든 CSS 속성을 활용하여 나만의 멋진 프로필 페이지 완성'
      },
    ]
  },

  // ========== 코드 예제 ==========
  { 
    type: 'code', 
    lang: 'css', 
    content: 
`/* 선택자와 속성으로 스타일 지정 */
body {
  background-color: #F8F9FC;
  font-family: 'Pretendard', sans-serif;
}

/* 클래스 선택자로 특정 요소 꾸미기 */
.card {
  background-color: #FFFFFF;
  padding: 20px;
  margin: 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #2F6FED;
  margin-bottom: 12px;
}

.description {
  font-size: 15px;
  color: #333333;
  line-height: 1.6;
}

/* ID 선택자로 유일한 요소 스타일링 */
#main-button {
  background-color: #08875D;
  color: #FFFFFF;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

#main-button:hover {
  background-color: #04724D;
}`
  },

  // ========== CTA (Call to Action) ==========
  { 
    type: 'cta', 
    text: '심심한 HTML을 화려하게 변신시킬 준비 되셨나요? 색상, 텍스트, 여백을 하나씩 배우며 멋진 웹사이트를 만들어봐요! 🎨✨'
  },
];

/**
 * 강의명을 기반으로 적절한 강의 소개 블록을 반환하는 함수
 */
export const getCssClassIntro = (productName?: string): ShowcaseBlock[] => {
  // CSS 관련 키워드가 있으면 새로운 상세 버전 반환
  const key = (productName || '').toLowerCase();
  if (key.includes('css') || key.includes('씨에스에스')) {
    return cssClassIntroBlocks;
  }
  
  // 기본값
  return cssClassIntroBlocks;
};

