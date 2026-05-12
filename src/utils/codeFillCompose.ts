// 슬라이드 모듈의 plainCode + blanks 정보로 빈칸 채우기 HTML 조각을 만든다.
// 어드민 codeFillUtils.composeContent 와 동일한 input 마커 포맷을 생성하되,
// Prism 토큰 하이라이팅 없이 escape 만 적용한다.
// (mobile WebView 는 prism-okaidia.css 만 로드하므로 토큰 span 이 없어도 정상 렌더된다)

const escapeHtml = (str: string): string =>
  String(str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

const blankInputTemplate = (n: number): string =>
  `<input id="blank-${n}" type="text" class="blank focus" value="" size="1" oninput="this.size = this.value.length || 1" onclick="console.log(event)" readOnly />`;

export interface BlankSpec {
  start: number;
  end: number;
  correctAnswer?: string;
  id?: string;
}

export const composeCodeFillContent = (
  plainCode: string,
  blanks: BlankSpec[] | undefined | null,
): string => {
  if (!plainCode) return '';
  const safeBlanks = Array.isArray(blanks) ? [...blanks] : [];

  // 좌→우 정렬해서 인덱스(0..N-1) 부여 — 모듈 answers 배열과 인덱스 매칭
  const sorted = safeBlanks.map((b, i) => ({ ...b, _idx: i })).sort((a, b) => a.start - b.start);

  // 뒤에서부터 잘라가며 plain 텍스트 조각을 모은 뒤 input 마커로 연결
  const sortedDescending = [...sorted].sort((a, b) => b.start - a.start);
  const segments: string[] = [];
  let cursor = plainCode.length;
  for (const blank of sortedDescending) {
    segments.unshift(escapeHtml(plainCode.slice(blank.end, cursor)));
    cursor = blank.start;
  }
  segments.unshift(escapeHtml(plainCode.slice(0, cursor)));

  // segments.length === sorted.length + 1 — input 마커를 사이사이에 끼워 넣는다
  const inputs = sorted.map((_, i) => blankInputTemplate(i));
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    out.push(segments[i]);
    if (i < inputs.length) out.push(inputs[i]);
  }
  return out.join('');
};
