// 컨텍스트 인식 보조키 — 커서가 놓인 "스코프"(태그 안 / 속성값 / CSS값 / JS인자 …)에 따라
// 가장 자주 쓰는 기호 세트를 선언적으로 매핑한다. WebView(CodeMirror) 쪽 __classifyContext 가
// EditorContext 를 만들어 RN 으로 보내면, keysFor() 가 이 테이블에서 키 세트를 룩업한다.

export type EditorMode = 'xml' | 'css' | 'javascript' | 'python' | 'json' | 'plaintext';

export type EditorScope =
  // HTML / XML
  | 'tag-open' | 'inside-tag' | 'attr-name' | 'attr-value' | 'tag-content' | 'before-close'
  // CSS
  | 'selector' | 'property-name' | 'value' | 'css-string'
  // JS / TS / JSX
  | 'statement' | 'call-args' | 'string' | 'template-literal' | 'object-literal'
  | 'member-access' | 'comment' | 'regex'
  // fallback
  | 'unknown';

export interface EditorContext {
  mode: EditorMode;
  scope: EditorScope;
  tokenType: string | null;
  /** xml: 가장 가까운 열린 태그명 (before-close 의 </tag> 해석용) */
  tagName?: string;
  /** xml: 해석된 닫는 태그 텍스트 (예: "</div>") */
  closeTag?: string;
}

export interface KeyDef {
  /** 빈도 추적용 안정 id (label 이 겹쳐도 구분). */
  id: string;
  /** 키에 표시되는 라벨 */
  label: string;
  /** 삽입 텍스트 (멀티문자/스니펫 가능) */
  text: string;
  /** 삽입 후 커서를 끝에서 caret 만큼(음수=왼쪽) 이동. 예: '=""' + caret:-1 → ="|" */
  caret?: number;
  /** 롱프레스 대체키(컨텍스트 최적화). Phase C 에서 사용. */
  alternates?: KeyDef[];
}

export const DEFAULT_CTX: EditorContext = { mode: 'plaintext', scope: 'unknown', tokenType: null };

// 기존 정적 30자 — 매칭되는 컨텍스트가 없을 때의 폴백.
const RAW_DEFAULT = ['<','>','/','"',"'",'`','-','_','=','+','.',',',':',';','(',')','{','}','[',']','|','&','!','?','#','@','$','*','\\','~'];
export const DEFAULT_KEYS: KeyDef[] = RAW_DEFAULT.map((c, i) => ({ id: 'd' + i, label: c, text: c }));

// 단축 헬퍼: 단일 문자 키.
const k = (id: string, ch: string): KeyDef => ({ id, label: ch, text: ch });

// (mode:scope) → 순서 있는 기본 키 세트. lookup 키 = `${mode}:${scope}`.
const TABLE: Record<string, KeyDef[]> = {
  // ── HTML / XML ──
  'xml:tag-open': [
    k('lt', '<'), { id: 'closetag', label: '</', text: '</' },
    { id: 'div', label: '<div>', text: 'div></div>', caret: -6 },
    k('gt', '>'), k('slash', '/'), k('dash', '-'),
  ],
  'xml:inside-tag': [
    { id: 'sp', label: '␣', text: ' ' },
    { id: 'class', label: 'class', text: 'class=""', caret: -1,
      alternates: [
        { id: 'id', label: 'id', text: 'id=""', caret: -1 },
        { id: 'style', label: 'style', text: 'style=""', caret: -1 },
        { id: 'src', label: 'src', text: 'src=""', caret: -1 },
        { id: 'href', label: 'href', text: 'href=""', caret: -1 },
      ] },
    { id: 'eqq', label: '=""', text: '=""', caret: -1 },
    k('gt', '>'), { id: 'selfclose', label: '/>', text: '/>' }, k('dash', '-'),
  ],
  'xml:attr-name': [
    { id: 'eqq', label: '=""', text: '=""', caret: -1 },
    { id: 'sp', label: '␣', text: ' ' }, k('dash', '-'), k('gt', '>'),
  ],
  'xml:attr-value': [
    k('quote', '"'), { id: 'sp', label: '␣', text: ' ' },
    k('dash', '-'), k('colon', ':'), k('slash', '/'), k('hash', '#'), k('dot', '.'),
  ],
  'xml:tag-content': [
    k('lt', '<'), { id: 'closetag', label: '</', text: '</' },
    { id: 'amp', label: '&', text: '&' }, k('dot', '.'), k('comma', ','), k('excl', '!'),
  ],
  'xml:before-close': [ k('gt', '>'), k('slash', '/'), k('lt', '<') ],

  // ── CSS ──
  'css:selector': [
    k('dot', '.'), k('hash', '#'),
    { id: 'gtsel', label: '>', text: ' > ' }, k('colon', ':'),
    { id: 'brace', label: '{', text: ' {\n  \n}', caret: -2 },
    k('comma', ','), { id: 'sp', label: '␣', text: ' ' },
  ],
  'css:property-name': [
    { id: 'colon', label: ':', text: ': ' }, k('semi', ';'), k('dash', '-'),
  ],
  'css:value': [
    k('semi', ';'),
    { id: 'px', label: 'px', text: 'px',
      alternates: [
        { id: 'rem', label: 'rem', text: 'rem' },
        { id: 'pct', label: '%', text: '%' },
        { id: 'em', label: 'em', text: 'em' },
        { id: 'vh', label: 'vh', text: 'vh' },
        { id: 'vw', label: 'vw', text: 'vw' },
      ] },
    k('hash', '#'), { id: 'var', label: 'var()', text: 'var()', caret: -1 },
    { id: 'sp', label: '␣', text: ' ' }, k('lparenv', '('), k('dot', '.'),
  ],
  'css:css-string': [
    k('quote', '"'), k('slash', '/'), k('dot', '.'), k('dash', '-'), k('colon', ':'),
  ],

  // ── JS / TS / JSX ──
  'javascript:statement': [
    k('semi', ';'), { id: 'eq', label: '=', text: ' = ' },
    { id: 'arrow', label: '=>', text: ' => ' },
    { id: 'lparen', label: '(', text: '()', caret: -1 },
    { id: 'lbrace', label: '{', text: '{}', caret: -1 },
    k('dot', '.'), k('comma', ','), k('lbracket', '['),
  ],
  'javascript:call-args': [
    { id: 'comma', label: ',', text: ', ' }, k('rparen', ')'),
    { id: 'arrow', label: '=>', text: ' => ' },
    { id: 'squote', label: "'", text: "''", caret: -1, alternates: [{ id: 'dquote', label: '"', text: '""', caret: -1 }] },
    { id: 'lbrace', label: '{', text: '{}', caret: -1 },
    { id: 'lbracket', label: '[', text: '[]', caret: -1 }, k('dot', '.'),
  ],
  'javascript:string': [
    { id: 'sp', label: '␣', text: ' ' }, k('dot', '.'), k('slash', '/'),
    k('colon', ':'), { id: 'tmpl', label: '${}', text: '${}', caret: -1 },
    k('dash', '-'), k('comma', ','),
  ],
  'javascript:template-literal': [
    { id: 'tmpl', label: '${}', text: '${}', caret: -1 }, k('bt', '`'),
    { id: 'sp', label: '␣', text: ' ' }, k('dot', '.'), k('slash', '/'),
  ],
  'javascript:object-literal': [
    { id: 'colon', label: ':', text: ': ' }, { id: 'comma', label: ',', text: ',\n' },
    { id: 'squote', label: "'", text: "''", caret: -1, alternates: [{ id: 'dquote', label: '"', text: '""', caret: -1 }] }, k('rbrace', '}'),
    { id: 'lbrace', label: '{', text: '{}', caret: -1 },
  ],
  'javascript:member-access': [
    { id: 'lparen', label: '(', text: '()', caret: -1 }, k('dot', '.'), k('semi', ';'),
    { id: 'lbracket', label: '[', text: '[]', caret: -1 },
  ],
  'javascript:comment': [
    { id: 'sp', label: '␣', text: ' ' }, k('dot', '.'), k('comma', ','),
    { id: 'todo', label: 'TODO', text: 'TODO: ' }, k('colon', ':'),
  ],
  'javascript:regex': [
    k('slash', '/'), k('bs', '\\'), k('caret', '^'), k('dollar', '$'),
    k('lparenr', '('), k('lbracketr', '['), k('plus', '+'), k('star', '*'),
  ],

  // ── Python ──
  'python:statement': [
    k('colon', ':'), { id: 'eq', label: '=', text: ' = ' },
    { id: 'lparen', label: '(', text: '()', caret: -1 }, k('dot', '.'),
    k('comma', ','), { id: 'squote', label: "'", text: "''", caret: -1 },
    { id: 'lbracket', label: '[', text: '[]', caret: -1 }, k('hash', '#'),
  ],
};

/** EditorContext → 키 세트(기본 순서). 미매칭 시 DEFAULT_KEYS. */
export function keysFor(ctx: EditorContext): KeyDef[] {
  if (!ctx || ctx.scope === 'unknown') return DEFAULT_KEYS;
  const key = ctx.mode + ':' + ctx.scope;
  const base = TABLE[key];
  if (!base) return DEFAULT_KEYS;
  // before-close 는 실제 닫는 태그를 맨 앞에 끼워넣는다(예: </div>).
  if (ctx.scope === 'before-close' && ctx.closeTag) {
    return [{ id: 'close-real', label: ctx.closeTag, text: ctx.closeTag.replace(/^<\/?/, '').replace(/>$/, '') + '>' }, ...base];
  }
  return base;
}

/** 컨텍스트 룩업 키(빈도 저장소에서도 동일하게 사용). */
export function ctxKeyOf(ctx: EditorContext): string {
  return (ctx?.mode || 'plaintext') + ':' + (ctx?.scope || 'unknown');
}
