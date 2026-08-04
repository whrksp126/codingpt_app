#!/usr/bin/env node
/**
 * 번역 정본(`i18n/master.json`) → 각 프로젝트의 카탈로그 파일.
 *
 * 왜 정본을 하나 두나: 같은 문장("취소", "연결 끊김")이 앱에도 PC에도 나온다. 프로젝트마다 따로
 *  번역하면 **같은 버튼이 기기마다 다른 말을 한다**. 정본 한 벌에서 잘라 쓰면 그 일이 구조적으로
 *  불가능하다.
 *
 * 정본 모양: `{ "한국어 원문": { en: "...", ja: "...", ... }, ... }`
 * 각 프로젝트에는 **그 프로젝트가 실제로 쓰는 키만** 넣는다(안 쓰는 문장을 들고 다닐 이유가 없다).
 *
 * 쓰기:
 *   node scripts/i18n-emit.js <master.json> <keys.json> <출력디렉토리> [--js]
 *     --js = PC 용(번들러가 없어 JSON import 를 못 쓴다) `export default {...}` 형태로 쓴다.
 */
const fs = require('fs');
const path = require('path');

const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'es', 'de', 'fr'];

const [, , masterPath, keysPath, outDir, ...flags] = process.argv;
if (!masterPath || !keysPath || !outDir) {
  console.error('쓰기: i18n-emit.js <master.json> <keys.json> <outDir> [--js]');
  process.exit(1);
}
// 왜 JSON 이 아니라 모듈 파일인가: 이 카탈로그를 import 하는 앱 모듈들을 **node 가 직접 로드**한다
//  (PC↔앱 대조 테스트가 `--experimental-strip-types` 로 앱 원본을 그대로 실행한다). node ESM 은
//  JSON import 에 `with { type: 'json' }` 를 요구하는데 그 문법은 TS 5.0 이 파싱하지 못한다 →
//  둘 다 만족하는 유일한 모양이 "그냥 모듈"이다. PC 는 번들러가 없어 어차피 .js 였다.
const asJs = flags.includes('--js');
const asTs = flags.includes('--ts');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const keys = Object.keys(JSON.parse(fs.readFileSync(keysPath, 'utf8'))).sort();
fs.mkdirSync(outDir, { recursive: true });

const HEAD = (lang) => `// ${lang} 카탈로그 — **자동 생성물이다(scripts/i18n-emit.js).** 직접 고치지 말 것:
//  번역은 정본 \`i18n/master.json\` 한 벌에서 나온다(같은 문장이 앱·PC 에서 다른 말을 하지 않게).
//  키 = 한국어 원문. 값이 비면 원문(한국어)이 그대로 나온다 — 빈 화면보다 낫다.
`;

let report = [];
for (const lang of LANGS) {
  const obj = {};
  let done = 0;
  for (const k of keys) {
    if (lang === 'ko') { obj[k] = k; done++; continue; }
    const v = master[k] && master[k][lang];
    obj[k] = typeof v === 'string' ? v : '';
    if (obj[k]) done++;
  }
  const body = JSON.stringify(obj, null, 2);
  if (asJs) fs.writeFileSync(path.join(outDir, `${lang}.js`), `${HEAD(lang)}export default ${body};\n`);
  else if (asTs) fs.writeFileSync(path.join(outDir, `${lang}.ts`), `${HEAD(lang)}const CATALOG: Record<string, string> = ${body};\nexport default CATALOG;\n`);
  else fs.writeFileSync(path.join(outDir, `${lang}.json`), body + '\n');
  report.push(`${lang}: ${done}/${keys.length}`);
}
console.log(`${outDir} — ${report.join('  ')}`);
