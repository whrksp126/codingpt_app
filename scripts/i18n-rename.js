#!/usr/bin/env node
/**
 * 자동 치환이 넣은 `t('…')` 를 `i18n.t('…')` 로 바꾸고, import 를 네임스페이스로 돌린다.
 *
 * 왜: 이 리포에서 `t` 는 **지역 변수로 너무 흔하다**(tab·target·time·tabRect…). 108개 파일 중
 *  대부분이 어딘가에서 `t` 를 쓰고 있어서, 전역 import 로 들여오면 그 스코프 안의 `t('…')` 가
 *  조용히 **다른 값을 부른다**. 타입이 우연히 맞으면 tsc 도 못 잡는다 — 그러면 화면에 엉뚱한
 *  것이 뜨거나 크래시가 난다. `i18n.t` 는 이름이 겹칠 수 없다.
 *
 * 한국어 문자열을 받는 `t(...)` 호출만 바꾼다 — 원래 있던 남의 `t(...)` 는 건드리지 않는다.
 */
const fs = require('fs');
const ts = require('typescript');

const KO = /[가-힣]/;
const IMPORT_RE = /^\s*import\s*\{\s*t\s*\}\s*from\s*(['"][^'"]*i18n['"]);?\s*$/;

let files = 0;
let calls = 0;
for (const file of process.argv.slice(2)) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  if (!IMPORT_RE.test(src.split('\n').find((l) => IMPORT_RE.test(l)) || '')) continue;

  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cuts = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't'
      && node.arguments.length && ts.isStringLiteral(node.arguments[0])
      && KO.test(node.arguments[0].text)) {
      cuts.push(node.expression.getStart(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let out = src;
  for (const at of cuts.sort((a, b) => b - a)) out = out.slice(0, at) + 'i18n.' + out.slice(at);
  out = out.split('\n').map((l) => {
    const m = IMPORT_RE.exec(l);
    return m ? `import * as i18n from ${m[1]};` : l;
  }).join('\n');

  if (out !== src) { fs.writeFileSync(file, out); files++; calls += cuts.length; }
}
console.log(`i18n.t 로 교체: 호출 ${calls}곳 / 파일 ${files}개`);
