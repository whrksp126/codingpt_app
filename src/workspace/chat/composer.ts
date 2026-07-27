// composer.ts — 채팅 컴포저의 **순수 규칙**. PC `codingpt_pc/src/js/chat-model.js` 의 같은 이름
//  함수들(composerHasText/prettyModel/agentDisplayName)의 미러다 — 한쪽만 고치면 두 화면이 갈린다.
//
// 여기 있는 이유: 이 규칙들이 **에이전트에게 실제로 전달되는 문자열**과 버튼 활성 여부를 결정하는데,
//  컴포넌트 안에 묻어 두면 단위 테스트가 불가능해 "소스 모양만 보는" 공허한 검증이 된다.

/** 전송 가능? 공백/개행만 있는 입력은 보내지 않는다(TUI 에 빈 Enter = 프롬프트 한 번 삼킴). */
export function composerHasText(v: string | null | undefined): boolean {
  return String(v == null ? '' : v).trim().length > 0;
}

/**
 * 모델 식별자 → 사람이 읽는 짧은 이름. **표시 전용**이라 모르는 형태는 빈 문자열(칩을 띄우지 않는다).
 *  실측 형태: `claude-sonnet-4-5-20250929`, `claude-opus-4-1-20250805`, `claude-3-5-haiku-20241022`,
 *            `claude-opus-5[1m]`, `gpt-5-codex`, `gemini-2.5-pro`.
 */
export function prettyModel(id: string | null | undefined): string {
  let t = String(id == null ? '' : id).trim().toLowerCase();
  if (!t) return '';
  t = t.replace(/\[[^\]]*\]$/, '');        // 컨텍스트 변형 표기 `[1m]`
  t = t.replace(/-\d{8}$/, '');            // 날짜 접미 `-20250929`
  t = t.replace(/-\d+[mk]$/, '');          // 컨텍스트 접미 `-1m` / `-200k`
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let m = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/.exec(t);
  if (m) return cap(m[1]) + ' ' + (m[3] ? m[2] + '.' + m[3] : m[2]);
  m = /^claude-(\d+)(?:-(\d+))?-(opus|sonnet|haiku)$/.exec(t); // 구 형식(claude-3-5-haiku)
  if (m) return cap(m[3]) + ' ' + (m[2] ? m[1] + '.' + m[2] : m[1]);
  m = /^gpt-([\w.]+)(?:-(\w+))?$/.exec(t);
  if (m) return 'GPT-' + m[1] + (m[2] ? ' ' + cap(m[2]) : '');
  m = /^gemini-([\w.]+)-(\w+)$/.exec(t);
  if (m) return 'Gemini ' + m[1] + ' ' + cap(m[2]);
  return '';
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

export default { composerHasText, prettyModel, agentDisplayName, spliceSpeech };
