// i18n — 화면 문구의 언어 전환. **한국어 원문이 곧 키다.**
//
// 왜 키를 따로 안 만드나(`settings.title` 같은 식별자):
//  · 감싸지 못하고 남은 자리가 **한국어 그대로** 남는다. 식별자 방식이면 `settings.title` 같은
//    날문자가 화면에 뜬다 — 놓친 곳이 사용자에게 "고장"으로 보이느냐 "아직 한국어"로 보이느냐의 차이.
//  · 사전을 사람이 읽고 고칠 수 있다(왼쪽이 뜻 그 자체라 번역자가 맥락을 따로 안 물어봐도 된다).
//  · 추출이 결정적이다 — 같은 문장은 언제나 같은 키다. 키 채번 규칙이 없으니 어긋날 여지도 없다.
// 단점은 하나: 같은 한국어가 자리마다 다른 번역을 못 갖는다("닫기"는 어디서나 Close). 지금까지
//  실제로 갈려야 했던 문장이 없어 그 값을 치를 이유가 없다 — 생기면 원문을 다르게 쓰면 된다.
//
// 규율:
//  · 문장 조립 금지. `'파일 ' + n + '개'` 는 어순이 다른 언어에서 깨진다 → `t('파일 {n}개', { n })`.
//  · 사전에 없는 문장은 **원문(한국어)** 을 그대로 돌려준다. 절대 빈 문자열이 아니다.
//  · 언어 전환은 앱 전체 리마운트(App.tsx 의 key)로 반영한다 — 테마·글꼴 전환과 같은 방식.
//    화면마다 구독을 심는 것보다 확실하고, 전환은 드문 행위라 비용이 문제되지 않는다.
//
// ⚠ PC(`codingpt_pc/src/js/i18n/index.js`)에 같은 규율·같은 사전이 있고 **대조 테스트가 걸려 있다**
//   (`test/i18n-crossimpl.mjs`). 사전은 한 벌이어야 한다 — 같은 화면이 기기마다 다른 말을 하면 안 된다.

// ⚠ 확장자(.ts)를 **명시**한다. 이 모듈을 import 하는 앱 파일들을 PC↔앱 대조 테스트가
//   `--experimental-strip-types` 로 **node 에서 직접** 실행하는데, node ESM 은 확장자 없는
//   상대경로도 디렉토리 import 도 해석하지 못한다(둘 다 실제로 깨졌다).
import ko from './ko.ts';
import en from './en.ts';
import ja from './ja.ts';
import zhCN from './zh-CN.ts';
import es from './es.ts';
import de from './de.ts';
import fr from './fr.ts';

export type Lang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'es' | 'de' | 'fr';

/** 지원 언어 — 순서가 곧 설정 화면의 목록 순서다(한국어 먼저, 나머지는 사용자 수 순). */
export const LANGS: Lang[] = ['ko', 'en', 'ja', 'zh-CN', 'es', 'de', 'fr'];

/** 설정 화면에 보이는 이름은 **그 언어 자신의 표기**다(영어로 "Japanese" 라고 쓰면 못 찾는다). */
export const LANG_LABELS: Record<Lang, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-CN': '简体中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
};

type Catalog = Record<string, string>;
const CATALOGS: Record<Lang, Catalog> = {
  ko: ko as Catalog,
  en: en as Catalog,
  ja: ja as Catalog,
  'zh-CN': zhCN as Catalog,
  es: es as Catalog,
  de: de as Catalog,
  fr: fr as Catalog,
};

let lang: Lang = 'ko';
let catalog: Catalog = CATALOGS.ko;

export function getLang(): Lang { return lang; }

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as string[]).includes(v);
}

/** 부팅 시·설정 변경 시 호출. 모르는 값은 한국어. */
export function setLangRuntime(v: unknown) {
  lang = isLang(v) ? v : 'ko';
  catalog = CATALOGS[lang] || CATALOGS.ko;
}

/**
 * OS 언어 → 우리 언어. `zh-Hans-CN`·`zh_CN`·`en-US` 같은 실제 값들을 받는다.
 *  중국어는 번체(zh-Hant/TW/HK)를 간체로 떨어뜨리지 않는다 — 글자가 아예 다르다. 영어로 보낸다.
 */
export function matchDeviceLang(raw: unknown): Lang {
  const s = String(raw || '').replace(/_/g, '-');
  if (!s) return 'en';
  const low = s.toLowerCase();
  if (low.startsWith('ko')) return 'ko';
  if (low.startsWith('ja')) return 'ja';
  if (low.startsWith('zh')) {
    if (/hant|-tw|-hk|-mo/.test(low)) return 'en';
    return 'zh-CN';
  }
  if (low.startsWith('es')) return 'es';
  if (low.startsWith('de')) return 'de';
  if (low.startsWith('fr')) return 'fr';
  if (low.startsWith('en')) return 'en';
  return 'en';   // 모르는 언어에 한국어를 주는 건 "우리 기본값"이지 사용자를 위한 선택이 아니다
}

const VAR_RE = /\{(\w+)\}/g;

/**
 * 문구 조회. `text` 는 한국어 원문이고 그게 곧 사전의 키다.
 *  · 사전에 없거나 빈 값이면 원문을 돌려준다(번역이 안 된 화면도 읽을 수는 있어야 한다).
 *  · `{n}` 자리에 vars 를 끼운다. vars 에 없는 이름은 **그대로 둔다**(지워 버리면 문장이 망가진다).
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const src = typeof text === 'string' ? text : '';
  const hit = catalog[src];
  const out = typeof hit === 'string' && hit ? hit : src;
  if (!vars) return out;
  return out.replace(VAR_RE, (whole, name) => {
    const v = vars[name];
    return v == null ? whole : String(v);
  });
}

/** 이 언어에 실제로 번역이 있는 문장 수 — 설정 화면·테스트가 진행률을 말할 때 쓴다. */
export function translatedCount(l: Lang): number {
  const c = CATALOGS[l];
  if (!c) return 0;
  let n = 0;
  for (const k of Object.keys(c)) if (c[k] && c[k] !== k) n++;
  return n;
}

/** 사전 전체(테스트·대조용). 화면 코드가 직접 뒤지지 않는다. */
export function catalogFor(l: Lang): Catalog { return CATALOGS[l] || CATALOGS.ko; }
