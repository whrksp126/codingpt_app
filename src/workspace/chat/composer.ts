// composer.ts — 채팅 컴포저의 **순수 규칙**. PC `codingpt_pc/src/js/chat-model.js` 의 같은 이름
//  함수들(composerHasText/agentDisplayName/…)의 미러다 — 한쪽만 고치면 두 화면이 갈린다.
//
// 여기 있는 이유: 이 규칙들이 **에이전트에게 실제로 전달되는 문자열**과 버튼 활성 여부를 결정하는데,
//  컴포넌트 안에 묻어 두면 단위 테스트가 불가능해 "소스 모양만 보는" 공허한 검증이 된다.

/** 전송 가능? 공백/개행만 있는 입력은 보내지 않는다(TUI 에 빈 Enter = 프롬프트 한 번 삼킴). */
export function composerHasText(v: string | null | undefined): boolean {
  return String(v == null ? '' : v).trim().length > 0;
}

/** 에이전트 코드명 → 표시 이름(플레이스홀더 "Claude에게 요청"). 모르면 빈 문자열. */
export function agentDisplayName(agent: string | null | undefined): string {
  const s = String(agent == null ? '' : agent).trim().toLowerCase();
  if (s === 'claude') return 'Claude';
  if (s === 'codex') return 'Codex';
  if (s === 'gemini') return 'Gemini';
  return '';
}

/**
 * 커서 위치에 텍스트를 끼워 넣은 결과(음성 입력 전용).
 *  ★ **덮어쓰기 삽입**이다: STT 는 같은 발화에 대해 부분 결과를 여러 번 보내므로, 매번 원본(base)의
 *   같은 자리(anchor)에 최신 텍스트를 넣어야 한다. 누적하면 "안녕안녕하세요안녕하세요" 가 된다.
 *  · anchor 는 항상 [0, base.length] 로 클램프한다(선택 영역이 없거나 미상이면 끝에 붙는 게 안전).
 *  · 앞 글자가 공백이 아니면 공백 하나를 넣는다 — 기존 문장에 붙어 `파일을열어줘` 가 되지 않게.
 */
export function spliceSpeech(base: string, anchor: number, text: string, max = 4096): { value: string; cursor: number } {
  const b = String(base == null ? '' : base);
  const t = String(text == null ? '' : text);
  const a = Math.max(0, Math.min(Number.isFinite(anchor) ? Math.trunc(anchor) : b.length, b.length));
  const head = b.slice(0, a);
  const tail = b.slice(a);
  const sep = head && !/\s$/.test(head) ? ' ' : '';
  const ins = sep + t;
  const raw = head + ins + tail;
  const value = raw.length > max ? raw.slice(0, max) : raw;
  return { value, cursor: Math.min(head.length + ins.length, value.length) };
}

export default { composerHasText, agentDisplayName, spliceSpeech };

// ── 첨부 원자 토큰(2026-07-30 사용자 확정: 모바일도 칩 컴포저) ─────────────────────
//  RN 네이티브 TextInput 은 인라인 뷰를 못 그리므로, 입력칸에는 짧은 토큰([사진 N]/[파일 N])을 두고
//  썸네일은 입력칸 위 스트립에 그린다. **원자성은 스냅 규칙**이 만든다: 토큰이 편집으로 조금이라도
//  깨지면 잔해를 통째로 걷는다(백스페이스 한 번 = 칩 하나 삭제로 체감). 네이티브 IME/커서/선택은
//  전부 보존된다 — PC 라이브 미러를 폐기시킨 교훈("입력 UX 의 정본은 로컬")의 모바일 판.

export interface AttachEntry {
  token: string;           // 입력칸에 박히는 원자 토큰(예: "[사진 1]")
  path: string;            // 업로드된 호스트 PC 절대경로
  name: string;
  image: boolean;
  base64?: string;         // 썸네일용(업로드 원본 — 이미지에만)
}

export function attachToken(n: number, image: boolean): string {
  return `[${image ? '사진' : '파일'} ${n}]`;
}

/** 편집으로 깨진 토큰의 잔해 제거 — prev→next 에서 온전히 남지 않은 토큰은 잔해까지 걷는다.
 *  반환 text 는 정리된 값, removed 는 이번 편집으로 사라진 토큰들(레지스트리에서 걷을 대상). */
export function snapAttachTokens(next: string, tokens: string[]): { text: string; removed: string[] } {
  let text = String(next || '');
  const removed: string[] = [];
  for (const tok of tokens) {
    if (text.includes(tok)) continue;
    removed.push(tok);
    // 잔해: 토큰에서 글자 일부가 빠진 형태 — 접두/접미 부분 문자열 중 남아 있는 가장 긴 것을 걷는다.
    //  (IME 조합 등으로 임의 중간 삭제는 드물다 — 백스페이스/Delete 는 끝/앞에서 깎인다)
    for (let cut = tok.length - 1; cut >= 2; cut--) {
      const head = tok.slice(0, cut);
      const tail = tok.slice(tok.length - cut);
      if (text.includes(head)) { text = text.replace(head, ''); break; }
      if (text.includes(tail)) { text = text.replace(tail, ''); break; }
    }
  }
  return { text, removed };
}

/** 커서가 토큰 내부에 있으면 토큰 끝으로 스냅(토큰 안 타이핑 = 토큰 파괴 방지). 밖이면 그대로. */
export function snapCaretOutOfToken(text: string, caret: number, tokens: string[]): number {
  const t = String(text || '');
  for (const tok of tokens) {
    let at = t.indexOf(tok);
    while (at >= 0) {
      if (caret > at && caret < at + tok.length) return at + tok.length;
      at = t.indexOf(tok, at + tok.length);
    }
  }
  return caret;
}

/** 전송 직전 변환 — 토큰을 인용 경로로, 레지스트리에 없는 고아 토큰([사진 N] 꼴)은 걷는다. */
export function resolveAttachTokens(text: string, reg: AttachEntry[]): string {
  let out = String(text || '');
  for (const a of reg) out = out.split(a.token).join(`'${a.path.replace(/'/g, "'\\''")}'`);
  out = out.replace(/\[(?:사진|파일) \d+\]/g, '').replace(/ {2,}/g, ' ');
  return out;
}
