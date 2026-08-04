// 명령 레지스트리 — 팔레트의 행 목록이자 단축키 설정의 표다(**같은 테이블 하나**).
//
// ⚠ PC(codingpt_pc/src/js/commands.js)에 같은 표가 있고 **대조 테스트가 걸려 있다**.
//   id·기본 조합·범위·노출 플래그가 한쪽만 바뀌면 테스트가 깨진다. 왜 하나로 두는지는 PC 파일의
//   머리주석에 정리돼 있다(요약: 둘로 나누면 "팔레트엔 있고 단축키엔 없는 명령"이 생긴다).
//
// 문구는 여기 없다 — `src/text/palette.ts` 사전이 정본이다.

export type CommandScope = 'global' | 'workspace' | 'pane';

export type CommandDef = {
  id: string;
  /** 기본 조합. null = 기본 단축키 없음(팔레트로만). */
  key: string | null;
  scope: CommandScope;
  group: string;
  pc: boolean;
  app: boolean;
  /** 팔레트 목록에 나오는가. false = 단축키 전용. */
  palette: boolean;
};

export const COMMANDS: CommandDef[] = [
  { id: 'palette.open', key: 'Mod+P', scope: 'global', group: 'open', pc: true, app: true, palette: false },
  // 폰 IDE 는 트리 헤더에 검색창이 상시 떠 있어 "찾기를 연다" 명령이 필요 없다(app:false).
  { id: 'find.open', key: 'Mod+F', scope: 'pane', group: 'open', pc: true, app: false, palette: true },

  { id: 'ws.addTerminal', key: 'Mod+T', scope: 'workspace', group: 'add', pc: true, app: true, palette: true },
  { id: 'ws.addIde', key: 'Mod+E', scope: 'workspace', group: 'add', pc: true, app: true, palette: true },
  { id: 'ws.addPreview', key: 'Mod+Shift+E', scope: 'workspace', group: 'add', pc: true, app: true, palette: true },
  // 모바일 화면(에뮬레이터·시뮬레이터·붙어 있는 실기기) — 단축키는 안 준다. 자주 여는 것이 아니고,
  //  남은 조합을 하나 더 태우는 것보다 팔레트/추가 버튼으로 충분하다.
  { id: 'ws.addEmulator', key: null, scope: 'workspace', group: 'add', pc: true, app: true, palette: true },

  { id: 'ws.quickCommands', key: 'Mod+R', scope: 'workspace', group: 'run', pc: true, app: true, palette: true },
  { id: 'ws.ports', key: null, scope: 'workspace', group: 'run', pc: true, app: true, palette: true },

  { id: 'pane.splitRight', key: 'Mod+D', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },
  { id: 'pane.splitDown', key: 'Mod+Shift+D', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },
  { id: 'pane.close', key: 'Mod+W', scope: 'pane', group: 'pane', pc: true, app: true, palette: true },
  { id: 'pane.focusLeft', key: 'Mod+Alt+ArrowLeft', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },
  { id: 'pane.focusRight', key: 'Mod+Alt+ArrowRight', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },
  { id: 'pane.focusUp', key: 'Mod+Alt+ArrowUp', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },
  { id: 'pane.focusDown', key: 'Mod+Alt+ArrowDown', scope: 'pane', group: 'pane', pc: true, app: false, palette: true },

  { id: 'sidebar.toggle', key: 'Mod+B', scope: 'global', group: 'view', pc: true, app: true, palette: true },
  { id: 'notif.panel', key: null, scope: 'global', group: 'view', pc: true, app: true, palette: true },
  { id: 'notif.latestUnread', key: 'Mod+Shift+U', scope: 'global', group: 'view', pc: true, app: true, palette: true },

  { id: 'app.settings', key: 'Mod+Comma', scope: 'global', group: 'settings', pc: true, app: true, palette: true },
  { id: 'settings.commands', key: null, scope: 'global', group: 'settings', pc: true, app: true, palette: true },
  { id: 'settings.shortcuts', key: null, scope: 'global', group: 'settings', pc: true, app: true, palette: true },

  { id: 'ws.select1', key: 'Mod+1', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select2', key: 'Mod+2', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select3', key: 'Mod+3', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select4', key: 'Mod+4', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select5', key: 'Mod+5', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select6', key: 'Mod+6', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select7', key: 'Mod+7', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
  { id: 'ws.select8', key: 'Mod+8', scope: 'global', group: 'goto', pc: true, app: true, palette: false },
];

export type Platform = 'pc' | 'app';

export function commandsFor(platform: Platform): CommandDef[] {
  return COMMANDS.filter((c) => (platform === 'app' ? c.app : c.pc));
}

export function commandById(id: string): CommandDef | null {
  return COMMANDS.find((c) => c.id === id) || null;
}

export function defaultBindings(platform: Platform): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of commandsFor(platform)) out[c.id] = c.key;
  return out;
}

// ── 키 조합 표기 ────────────────────────────────────────────────────────────
// 저장 형식은 `Mod+Shift+D` 같은 사람이 읽는 문자열이다. `Mod` = ⌘(macOS/iOS) 또는 Ctrl.
//  수식어 순서는 항상 Mod, Ctrl, Alt, Shift (정규화 — 같은 조합이 두 문자열이 되면 충돌 검사가
//  무너진다).

const MOD_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'];

export const NAMED_KEYS = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Enter', 'Escape', 'Space', 'Tab', 'Backspace', 'Delete',
  'Home', 'End', 'PageUp', 'PageDown',
  'Comma', 'Period', 'Slash', 'Backslash', 'Semicolon', 'Quote',
  'BracketLeft', 'BracketRight', 'Backquote', 'Minus', 'Equal',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];

// ⚠ 웹뷰(터미널·에디터) 안 판정기가 이 표를 그대로 주입해 쓴다(palette/webviewKeys.ts) —
//   여기만 고치고 저쪽을 안 보면 "설정엔 있는데 안 먹는 조합"이 생긴다.
export const PUNCT_TO_NAME: Record<string, string> = {
  ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash', ';': 'Semicolon',
  "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', '`': 'Backquote',
  '-': 'Minus', '=': 'Equal', ' ': 'Space',
};

const NAME_TO_SYMBOL: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Enter: '↩', Escape: 'esc', Space: 'space', Tab: '⇥', Backspace: '⌫', Delete: '⌦',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backquote: '`', Minus: '-', Equal: '=',
};

export function canonicalKey(raw: unknown): string | null {
  const s = String(raw || '');
  if (!s) return null;
  if (PUNCT_TO_NAME[s]) return PUNCT_TO_NAME[s];
  const named = NAMED_KEYS.find((n) => n.toLowerCase() === s.toLowerCase());
  if (named) return named;
  if (s.length === 1) {
    const c = s.toUpperCase();
    if (/[A-Z0-9]/.test(c)) return c;
    return null;
  }
  return null;
}

export function normalizeCombo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('+').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const mods = new Set<string>();
  let key: string | null = null;
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'mod' || l === 'cmd' || l === 'command' || l === 'meta' || l === 'super') { mods.add('Mod'); continue; }
    if (l === 'ctrl' || l === 'control') { mods.add('Ctrl'); continue; }
    if (l === 'alt' || l === 'option' || l === 'opt') { mods.add('Alt'); continue; }
    if (l === 'shift') { mods.add('Shift'); continue; }
    if (key != null) return null;
    key = canonicalKey(p);
    if (key == null) return null;
  }
  if (key == null) return null;
  // 수식어 없는 단일 문자 조합은 받지 않는다 — 터미널에 글자를 칠 수 없게 된다.
  if (!mods.size && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null;
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join('+');
}

/** 조합 → 화면 표기. `apple` = ⌘ 를 쓰는 플랫폼인가(macOS·iOS·iPadOS). */
export function formatCombo(combo: unknown, apple: boolean): string {
  const norm = normalizeCombo(combo);
  if (!norm) return '';
  const parts = norm.split('+');
  const key = parts.pop() as string;
  const sym = NAME_TO_SYMBOL[key] || key;
  if (apple) {
    let out = '';
    if (parts.includes('Mod')) out += '⌘';
    if (parts.includes('Ctrl')) out += '⌃';
    if (parts.includes('Alt')) out += '⌥';
    if (parts.includes('Shift')) out += '⇧';
    return out + sym;
  }
  const words = parts.map((p) => (p === 'Mod' ? 'Ctrl' : p));
  return [...words, sym].join('+');
}

/**
 * 키 이벤트 → 저장 조합. RN 의 하드웨어 키보드 이벤트도 `key`/`code`/수식어 모양으로 넘겨 준다.
 *  ⚠ `key` 는 수식어에 따라 변하므로(⌥+A → "å") **code 를 우선**한다.
 */
export function comboFromEvent(
  e: { code?: string; key?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } | null,
  apple: boolean,
): string | null {
  const code = e && e.code ? String(e.code) : '';
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) key = code.slice(6);
  else if (code && NAMED_KEYS.includes(code)) key = code;
  else if (code === 'Minus' || code === 'Equal') key = code;
  else key = canonicalKey(e && e.key);
  if (key == null) return null;
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(String(e && e.key))) return null;
  const mods: string[] = [];
  const modDown = apple ? !!(e && e.metaKey) : !!(e && e.ctrlKey);
  const ctrlDown = apple ? !!(e && e.ctrlKey) : false;
  if (modDown) mods.push('Mod');
  if (ctrlDown) mods.push('Ctrl');
  if (e && e.altKey) mods.push('Alt');
  if (e && e.shiftKey) mods.push('Shift');
  if (!mods.length && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null;
  return [...MOD_ORDER.filter((m) => mods.includes(m)), key].join('+');
}

/**
 * 충돌 검사 — 같은 조합에 둘 이상이 걸렸는가. 범위로 봐주지 않는다(같은 조합이면 어느 하나는
 *  반드시 진다 — "가끔 안 먹는 단축키"보다 "지금 겹쳤다"고 말하는 게 낫다).
 */
export function findConflicts(bindings: Record<string, string | null> | null): Record<string, string[]> {
  const byCombo: Record<string, string[]> = {};
  for (const id of Object.keys(bindings || {})) {
    const c = normalizeCombo((bindings as any)[id]);
    if (!c) continue;
    (byCombo[c] || (byCombo[c] = [])).push(id);
  }
  const out: Record<string, string[]> = {};
  for (const c of Object.keys(byCombo)) {
    if (byCombo[c].length > 1) out[c] = byCombo[c].slice().sort();
  }
  return out;
}

/** 저장값 + 기본값 → 실제 적용 조합표. 사용자가 비운 것(null)은 "안 걸림"이다. */
export function resolveBindings(
  platform: Platform,
  saved: Record<string, string | null> | null,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of commandsFor(platform)) {
    const has = saved && Object.prototype.hasOwnProperty.call(saved, c.id);
    const v = has ? (saved as any)[c.id] : c.key;
    out[c.id] = v == null ? null : normalizeCombo(v);
  }
  return out;
}

export function commandForCombo(resolved: Record<string, string | null>, combo: string | null): string | null {
  if (!combo) return null;
  for (const id of Object.keys(resolved || {})) {
    if (resolved[id] === combo) return id;
  }
  return null;
}
