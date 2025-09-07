// src/data/courseIntroShowcaseData.ts
import type { ShowcaseBlock } from '../../components/ClassIntro';

const img1 = 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1200&auto=format&fit=crop';
const img2 = 'https://images.unsplash.com/photo-1520975922284-5f5730cbd5c7?q=80&w=1200&auto=format&fit=crop';
const img3 = 'https://images.unsplash.com/photo-1557264337-e8a93017fe92?q=80&w=1200&auto=format&fit=crop';

// 로컬 이미지 import
const img4 = require('../../assets/images/mascot_html.png');
const img5 = require('../../assets/images/mascot_css.png');
const img6 = require('../../assets/images/mascot_js.png');

export const showcaseByProductName = (name: string): ShowcaseBlock[] => {
  const key = (name || '').toLowerCase();
  
  // 디버깅을 위한 로그 추가
//   console.log('[classIntro] 강의 이름:', name, '-> 키:', key);

  if (key.includes('css')) {
    return [
      { type: 'headline', 
        kicker:'모바일 퍼스트 스타일링', 
        title:'쉽게 시작하는 CSS', 
        subtitle:'색·타이포·레이아웃을 카드형 예제로 빠르게 체득', 
        hero: img5,
        tags:['디자인토큰','Flex','반응형','상자모델'],
        stats:[
            {label:'레슨',value:'10개'},
            {label:'예상 소요',value:'2~3h'},
            {label:'난이도',value:'입문~초중급'}
        ] },

      // ✅ 임팩트 featureCards
      { type:'featureCards', 
        items:[
        { emoji:'🌈', title:'브랜드 팔레트 만들기', desc:'팔레트/대비 공식으로 “예쁘고 가독성 좋은” 기본 톤을 확정' },
        { emoji:'🧲', title:'레이아웃, 한 번에 정렬', desc:'Flex로 가로·세로·중앙정렬을 직관적으로 배치' },
        { emoji:'📦', title:'상자 모델 감각', desc:'padding/border/margin을 눈으로 느끼며 카드 완성' },
      ]},

      // ✅ 게임형 Mosaic
      { type:'mosaic',
        headline:'게임처럼, 쉽게!',
        sub:'퀘스트를 깨며 코딩 감이 와요',
        image: img3,
        badges:[
          { emoji:'🎯', title:'미션', desc:'색/타이포 챌린지 클리어' },
          { emoji:'🏆', title:'트로피', desc:'완성 카드로 뱃지 획득' },
          { emoji:'⚡', title:'부스트', desc:'한 문제씩 자신감 충전' },
          { emoji:'🧩', title:'퍼즐', desc:'상자모델 퍼즐 고수되기' },
          { emoji:'💎', title:'컬렉션', desc:'나만의 스타일 보관' },
          { emoji:'🎮', title:'플레이', desc:'스타일 바꾸며 즉시 확인' },
        ]
      },

      // ✅ 화려한 Timeline (+ 소제목)
      { type:'timeline',
        title:'👨‍💻 단계별로 차근차근',
        subtitle:'기초부터 페이지 완성까지, 한 눈에 보는 여정',
        items:[
          { step:'1–3', title:'색·글자·상자', desc:'토큰/타이포로 기본 다지기' },
          { step:'4–6', title:'인라인/블록·Flex', desc:'정렬/배치로 레이아웃 완성' },
          { step:'7–9', title:'이미지·인터랙션·미니 페이지', desc:'카드·버튼 꾸미기' },
          { step:'10',  title:'CSS 빙고', desc:'속성 카드 맞추기 챌린지' },
        ]
      },

      { type:'code', lang:'css', content:
`:root { 
  --brand:#58CC02; 
  --text:#121315; 
}

.card { 
  border-radius:16px; 
  padding:16px; 
  box-shadow:0 8px 20px rgba(0,0,0,.08); 
}
  
.btn { 
  background:var(--brand); 
  color:#fff; 
}`},

      { type:'cta', text:'오늘은 버튼 하나만 예쁘게 바꿔볼까? 페이지가 바로 달라져요. 다음 레슨에서 같이 손 풀자! 🎉' },
    ];
  }

  // JavaScript 관련 키워드 체크 (더 포괄적으로)
  if (key.includes('javascript') || key.includes('js') || key.includes('자바스크립트')) {
    return [
      { type: 'headline', 
        kicker:'움직임을 만드는 언어', 
        title:'자바스크립트 첫걸음', 
        subtitle:'변수·이벤트·조건·DOM·미니앱까지', 
        hero:img6,
        tags:['이벤트','조건문','DOM','미니앱'],
        stats:[
            {label:'레슨',value:'10개'},
            {label:'예상 소요',value:'3~4h'},
            {label:'난이도',value:'입문'}
        ] },
      { type:'featureCards', 
        items:[
          { emoji:'🖱', title:'클릭에 반응하는 UI', desc:'이벤트로 색/텍스트/이미지 변화 경험' },
          { emoji:'🔀', title:'갈림길 로직', desc:'조건문으로 “상황별 결과” 만들기' },
          { emoji:'🌳', title:'DOM 조작', desc:'요소 찾고/바꾸고/붙이기' },
      ]},
      { type:'mosaic',
        headline:'게임처럼, 손이 먼저!',
        sub:'작은 게임으로 로직이 몸에 배요',
        image: img1,
        badges:[
          { emoji:'🎮', title:'미니 게임', desc:'랜덤 색 맞추기' },
          { emoji:'🔓', title:'언락', desc:'퀴즈 풀고 다음 스테이지' },
          { emoji:'⚡', title:'즉시 반응', desc:'클릭→색/텍스트 변신' },
          { emoji:'📈', title:'점수', desc:'기록하고 다시 도전' },
          { emoji:'🧠', title:'로직 감각', desc:'조건/반복이 자연스럽게' },
          { emoji:'🚀', title:'미니 앱', desc:'템플릿으로 완성 경험' },
        ]
      },
      { type:'timeline',
        title:'👩‍💻 하나씩 완성하는 경험',
        subtitle:'손으로 만들며 익히는 흐름',
        items:[
          { step:'1–3', title:'JS 소개·변수·이벤트', desc:'신호 받고 반응하는 법' },
          { step:'4–6', title:'조건문·숫자·문자열', desc:'갈림길과 데이터 다루기' },
          { step:'7–9', title:'DOM·게임·미니앱', desc:'보이는 걸 바꾸는 즐거움' },
          { step:'10',  title:'퀴즈쇼', desc:'용어/디버깅 스피드 퀴즈' },
        ]
      },
      { type:'code', lang:'js', content:
`const out = document.getElementById('out');
const log = t => out.textContent += t + ' ';
log('A'); 
setTimeout(()=>log('B'), 0); 
log('C'); // A C B`},
      { type:'cta', text:'클릭하면 바로 반응하는 UI, 직접 만들 준비 됐어? 작은 게임부터 가볍게 스타트! 🚀' },
    ];
  }

  // 기본: HTML
  return [
    { type:'headline', 
      kicker:'입문자를 위한 코딩 첫걸음', 
      title:'웹 개발의 시작 HTML', 
      subtitle:'문서 뼈대부터 이미지·표까지, 즉시 미리보기로 배우는 입문 과정', 
      hero: img4,
      tags:['시맨틱','링크/이미지','목록/표','접근성'],
      stats:[
        {label:'레슨',value:'10개'},
        {label:'예상 소요',value:'1.5~2h'},
        {label:'난이도',value:'입문'}
    ]},
    { type:'featureCards', 
      items:[
        { emoji:'🧱', title:'문서 뼈대 퍼즐', desc:'html/head/body 역할을 퍼즐처럼 익히기' },
        { emoji:'🔗', title:'링크 vs 버튼', desc:'이동/반응 차이를 체험으로 구분' },
        { emoji:'🖼️', title:'이미지·alt', desc:'안 보일 때도 의미 전달' },
    ]},
    { type:'mosaic',
      headline:'🎮 게임처럼 배우는 HTML',
      sub:'퀘스트로 태그가 금방 익숙해져요 :D',
      image: img1,
      badges:[
        { emoji:'🎯', title:'미션', desc:'제목/문단 퍼즐 맞추기' },
        { emoji:'🧩', title:'태그 카드', desc:'<a>/<img> 매칭' },
        { emoji:'🏆', title:'배지', desc:'미니 페이지 완성' },
        { emoji:'⚡', title:'즉시 미리보기', desc:'코드→화면 바로 확인' },
        { emoji:'📚', title:'복습', desc:'퀴즈로 기억 고정' },
        { emoji:'🎉', title:'퀴즈쇼', desc:'마지막 레벨 클리어' },
      ]
    },
    { type:'timeline',
      title:'👨‍💻 처음부터 완성까지, 단계별로',
      subtitle:'',
      items:[
        { step:'1–3', title:'웹 소개·뼈대·제목/문단', desc:'기초 구조 감 잡기' },
        { step:'4–6', title:'링크/버튼·이미지·목록', desc:'핵심 태그 모음' },
        { step:'7–9', title:'div/span·표·미니 페이지', desc:'그룹·표·완성 경험' },
        { step:'10',  title:'태그 퀴즈쇼', desc:'게임형으로 마무리' },
      ]
    },
    { type:'code', lang:'html', content:
`<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>나의 첫 HTML</title>
  </head>
  <body>
    <h1>Hello, World!</h1>
    <p>HTML 문서 구조를 배우는 중!</p>
    <a href="https://codingpt.com">CodingPT로 이동</a>
  </body>
</html>`},
    { type:'cta', text:'첫 페이지의 “Hello, World!”부터 같이 띄워볼까? 한 줄만 써도 웹이 보이기 시작해! ✨' },
  ];
};
