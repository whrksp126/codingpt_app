import * as i18n from '../../i18n/index.ts';
// attachWords.ts — 첨부 토큰(`[사진 1]`)에 쓰는 낱말을 사전에서 뽑는다.
//  composer.ts 는 import 를 가질 수 없다(PC 대조 테스트가 그 파일을 그대로 실행한다) → 사전을 아는 일은 여기서 한다.

/** 지금 언어의 토큰 낱말 — 새 토큰을 만들 때. */
export function attachWordsNow(): { photo: string; file: string } {
  return { photo: i18n.t('사진'), file: i18n.t('파일') };
}

/** 모든 언어의 토큰 낱말 — 고아 토큰을 걷을 때(언어를 바꾼 뒤 복원된 초안에는 옛 언어의 토큰이 남아 있다). */
export function attachWordsAll(): string[] {
  return [...i18n.variants('사진'), ...i18n.variants('파일')];
}
