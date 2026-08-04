// text/ — 화면에 나가는 **문구를 기능별 한 파일로 모으는 자리**(2026-08-04 사용자 확정).
//
// PC 의 `codingpt_pc/src/js/text/index.js` 와 같은 규율·같은 모양이다. 왜 이렇게만 하는지는
//  그 파일의 머리주석에 정리돼 있다(요약: 다국어는 다음 차수 — 지금은 구조만 맞춰 둔다).
//
// 규율:
//  · 사전은 `{ ko: {...}, en: {...} }` 이고 **키 집합이 같아야 한다**(en 이 비면 ko 로 떨어진다).
//  · 언어는 부팅 시 한 번 정해진다. 실행 중 전환은 아직 없다.
//  · 값에 문장 조립을 넣지 않는다 — 어순이 언어마다 달라 깨진다. 함수 값으로 둔다.

export type Lang = 'ko' | 'en';
export type Dict<T> = { ko: T; en: T };

const SUPPORTED: Lang[] = ['ko', 'en'];
let lang: Lang = 'ko';

/** 부팅 시 1회. 모르는 값은 한국어로 떨어진다. */
export function setLang(v: string) {
  lang = (SUPPORTED as string[]).includes(v) ? (v as Lang) : 'ko';
}

export function getLang(): Lang {
  return lang;
}

/** 사전에서 현재 언어 묶음을 고른다. */
export function tx<T>(dict: Dict<T>): T {
  return dict[lang] || dict.ko;
}
