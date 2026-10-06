#!/usr/bin/env node
/**
 * i18n-add — 정본(`i18n/master.json`)에 있는 문구 중 **이 소스 파일이 쓰는 것**을 앱 카탈로그(src/i18n/*.ts)에 더한다.
 *  전체를 다시 뽑는(i18n-emit) 대신 새 화면의 문구만 덧붙일 때 쓴다. 이미 있는 키는 건드리지 않는다.
 *  `t = i18n.t` 처럼 별칭으로 부르거나 표(`t(MAP[x])`)를 거치는 자리는 i18n-keys 가 못 보므로, 파일의 한국어 작은따옴표 글을 전부 후보로 본다.
 * 쓰기: node scripts/i18n-add.js <소스 파일...>
 */
const fs = require('fs');
const path = require('path');
const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'es', 'de', 'fr'];
const root = path.resolve(__dirname, '..');
const master = JSON.parse(fs.readFileSync(path.join(root, 'i18n/master.json'), 'utf8'));
const keys = new Set();
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*[가-힣](?:[^'\\\n]|\\.)*)'/g)) keys.add(m[1]);
}
const missing = [...keys].filter((k) => !master[k]);
if (missing.length) { console.error('정본에 없는 문구:\n  ' + missing.join('\n  ')); process.exit(1); }
for (const lang of LANGS) {
  const p = path.join(root, 'src/i18n', lang + '.ts');
  let s = fs.readFileSync(p, 'utf8');
  const end = s.lastIndexOf('\n};');
  let add = '';
  for (const k of keys) {
    if (s.includes('\n  ' + JSON.stringify(k) + ':')) continue;
    add += ',\n  ' + JSON.stringify(k) + ': ' + JSON.stringify(lang === 'ko' ? k : (master[k][lang] || ''));
  }
  if (add) fs.writeFileSync(p, s.slice(0, end) + add + s.slice(end));
  console.log(lang, add ? add.split('\n').length - 1 : 0);
}
