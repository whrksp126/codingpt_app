// streamMarkdown.ts — 자라는 글(스트리밍)을 마크다운으로 그리기 위한 **순수 분할 규칙**. RN 의존성 0.
//
// 문제: 마크다운 렌더러(react-native-markdown-display)는 글 전체를 매번 다시 파싱한다. 글자가 들어올 때마다
//  긴 답변 전체를 다시 그리면 뒤로 갈수록 느려지고, 닫히지 않은 `**`·백틱·링크가 조각마다 모양을 바꿔 깜빡인다.
//
// 규칙(chat-v2-design.md §10.5):
//  ① **완결된 블록**(빈 줄 경계)까지는 굳은 조각이다 — 한 번 그리면 다시 그리지 않는다(memo).
//     코드 펜스 안의 빈 줄은 경계가 아니다(코드 한가운데서 자르면 앞뒤가 서로 다른 코드 블록이 된다).
//  ② 마지막 미완 블록만 매번 다시 그린다. 그리기 전에 꼬리를 보정한다:
//     열린 코드 펜스는 닫고, 짝 없는 `**`·백틱은 닫아 주고, 아직 구분선이 안 온 표·쓰다 만 링크는 글자 그대로 둔다.

export interface StreamSplit {
  /** 굳은 블록들 — 앞에서부터 순서대로. 길이가 늘어날 뿐 앞의 값은 바뀌지 않는다. */
  done: string[];
  /** 아직 자라는 마지막 블록(보정 전 원문). */
  tail: string;
  /** tail 이 열린 코드 펜스 안에서 끝났는가. */
  inFence: boolean;
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const isListLine = (s: string) => /^\s*([-*+]|\d+[.)])\s+\S/.test(s || '');
const firstLine = (buf: string[]) => buf.find((l) => l.trim() !== '') || '';

/**
 * 글을 굳은 블록과 자라는 꼬리로 나눈다. **접두 안정**: `text` 가 뒤로만 자라면 `done` 의 앞 원소들은
 *  다음 호출에서도 같은 문자열이다(그래야 memo 가 먹는다).
 */
export function splitStream(text: string): StreamSplit {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const done: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;      // 열린 펜스의 표식(``` 또는 ~~~, 길이 포함)
  const flush = () => {
    const block = buf.join('\n').replace(/\n+$/, '');
    if (block.trim()) done.push(block);
    buf = [];
  };
  // 마지막 줄은 아직 쓰는 중일 수 있다(개행이 안 왔다) → 경계 판정에서 뺀다.
  const last = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = FENCE_RE.exec(line);
    if (fence) {
      buf.push(line);
      // 닫는 펜스 = 여는 것과 같은 글자, 같거나 더 길고, 그 줄에 다른 글자가 없다.
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        fence = null;
        // 닫힌 코드 블록은 그 자체로 완결이다 — 빈 줄을 기다리지 않고 굳힌다(긴 코드가 계속 다시 그려지지 않게).
        //  마지막 줄이면 아직 개행이 안 왔다(```` 로 더 자랄 수 있다) → 꼬리에 둔다.
        if (i < last) flush();
      }
      continue;
    }
    if (m) { fence = m[1]; buf.push(line); continue; }
    if (line.trim() === '' && i < last) {
      if (!buf.length) continue;
      // 빈 줄 = 블록 경계. 단 **다음 줄이 완성된 뒤에** 판정한다 — 쓰는 중인 줄(`-` 까지만 온 목록 표식 등)로
      //  정하면 다음 조각에서 판정이 뒤집혀, 굳혔던 블록이 다시 풀린다(접두 안정이 깨진다).
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      if (j >= last) { buf.push(line); continue; }
      // 들여 쓴 줄·이어지는 목록 항목은 같은 블록이다(빈 줄을 사이에 둔 목록을 자르면 번호가 다시 1부터 선다).
      const cont = /^(\s{2,}|\t)\S/.test(lines[j]) || (isListLine(firstLine(buf)) && isListLine(lines[j]));
      if (cont) { buf.push(line); continue; }
      flush();
      continue;
    }
    buf.push(line);
  }
  const tail = buf.join('\n');
  return { done, tail, inFence: !!fence };
}

/** 문자열에서 `marker` 가 몇 번 나오는가(겹치지 않게). */
function count(s: string, marker: string): number {
  if (!marker) return 0;
  let n = 0; let i = 0;
  for (;;) {
    const at = s.indexOf(marker, i);
    if (at < 0) return n;
    n += 1; i = at + marker.length;
  }
}

/** 인라인 코드(백틱) 구간을 지운 문자열 — 그 안의 `*`·`[` 는 문법이 아니다. */
function stripInlineCode(s: string): string {
  return s.replace(/`[^`\n]*`/g, '');
}

/**
 * 자라는 꼬리를 "지금 그려도 모양이 안 바뀌는" 마크다운으로 보정한다.
 *  원칙: **글자를 지우지 않는다**(지웠다가 다음 조각에서 되살아나면 그게 깜빡임이다). 닫아 주거나, 문법이
 *  되지 못하게 이스케이프할 뿐이다.
 */
export function healTail(tail: string, inFence: boolean): string {
  let s = String(tail || '');
  if (!s) return s;
  if (inFence) {
    // 열린 코드 펜스는 닫힌 것으로 본다(§10.5). 여는 표식과 같은 글자·길이로 닫는다.
    const open = FENCE_RE.exec(s.split('\n')[0] || '');
    const mark = open ? open[1] : '```';
    return s.replace(/\n*$/, '') + '\n' + mark;
  }
  const all = s.split('\n');
  // 꼬리 안에 아직 경계를 못 정한 앞 블록이 있을 수 있다 → 보정은 **마지막 블록**에만 한다.
  let cut = all.length - 1;
  while (cut > 0 && all[cut - 1].trim() !== '') cut -= 1;
  const pre = all.slice(0, cut).join('\n');
  const lines = all.slice(cut);
  // 표 — 구분선(|---|)이 오기 전까지는 일반 글자다. 머리줄만 있는 상태로 표 문법이 되면 다음 조각에서 모양이 뒤집힌다.
  const looksTable = lines.length <= 2 && /^\s*\|.*$/.test(lines[0]) && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[1] || '');
  if (looksTable) return (pre ? pre + '\n' : '') + lines.join('\n').replace(/\|/g, '\\|');

  const lastLine = lines[lines.length - 1];
  let head = lines.slice(0, -1).join('\n');
  let cur = lastLine;

  // 백틱 — 짝이 안 맞으면 닫아 준다(안 닫으면 뒤의 글 전체가 코드로 물들었다가 풀린다).
  if (count(cur, '`') % 2 === 1) cur += '`';
  const plain = stripInlineCode(cur);
  // 굵게/기울임 — 굵게(**)부터 센다. 짝이 안 맞으면 끝에 닫는 표식을 붙인다.
  const bold = count(plain, '**');
  const boldU = count(plain, '__');
  if (bold % 2 === 1) cur = closeEmphasis(cur, '**');
  if (boldU % 2 === 1) cur = closeEmphasis(cur, '__');
  const rest = stripInlineCode(cur).split('**').join('').split('__').join('');
  // 목록 표식(`* 항목`)의 별표는 강조가 아니다.
  const stars = count(rest.replace(/^\s*\*\s/, ''), '*');
  if (stars % 2 === 1) cur = closeEmphasis(cur, '*');
  if (count(stripInlineCode(cur), '~~') % 2 === 1) cur = closeEmphasis(cur, '~~');
  // 링크·이미지 — `[라벨](주소` 처럼 쓰다 만 것은 글자 그대로 보인다(주소가 다 오면 그때 링크가 된다).
  cur = cur.replace(/(!?)\[([^\]\n]*)\]\(([^)\n]*)$/, (_w, bang: string, label: string, url: string) => `${bang ? '!' : ''}\\[${label}\\](${url}`);
  cur = cur.replace(/(!?)\[([^\]\n]*)$/, (_w, bang: string, label: string) => `${bang ? '!' : ''}\\[${label}`);
  if (head) head += '\n';
  return (pre ? pre + '\n' : '') + head + cur;
}

/** 닫는 표식을 붙인다 — 표식 바로 뒤가 비어 있으면(`**` 만 막 온 상태) 표식을 글자로 돌린다(빈 강조는 렌더러마다 다르다). */
function closeEmphasis(line: string, mark: string): string {
  const at = line.lastIndexOf(mark);
  const after = at >= 0 ? line.slice(at + mark.length) : '';
  if (!after.trim()) {
    const esc = mark.split('').map((c) => '\\' + c).join('');
    return line.slice(0, at) + esc + after;
  }
  // 닫는 표식 앞의 공백은 강조를 깨뜨린다(`**굵게 **` 는 강조가 아니다) → 공백 앞에 닫는다.
  const trimmed = line.replace(/\s+$/, '');
  return trimmed + mark + line.slice(trimmed.length);
}

/** 한 번에: 굳은 블록 + 보정된 꼬리. */
export function renderParts(text: string): { done: string[]; tail: string } {
  const sp = splitStream(text);
  return { done: sp.done, tail: healTail(sp.tail, sp.inFence) };
}
