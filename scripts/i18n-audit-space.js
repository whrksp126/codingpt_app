#!/usr/bin/env node
/**
 * 치환하면서 **앞뒤 공백을 잃은 자리**를 찾는다.
 *
 * 왜 필요했나: 처음 만든 치환기가 모든 리터럴에 `.trim()` 을 걸었다. JSX 텍스트는 앞뒤 공백이
 *  레이아웃이라 잘라야 맞지만, **일반 문자열은 공백이 값의 일부**다 —
 *  `'추론 ' + st.effort` 가 `i18n.t('추론') + st.effort` 가 되어 화면에 "추론high" 로 붙었다.
 *  (PC↔앱 대조 테스트가 잡아 줬다. 안 잡혔으면 7개 언어에 그대로 실려 나갔을 결함이다.)
 *
 * 쓰기: node scripts/i18n-audit-space.js <git기준> <파일...>
 *   기준 리비전의 원본에서 "앞뒤 공백이 있는 한국어 리터럴"을 뽑아, 지금 파일이 그 자리를
 *   공백 없이 감쌌으면 알려 준다.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const KO = /[가-힣]/;
const [, , rev, ...files] = process.argv;
if (!rev || !files.length) {
  console.error('쓰기: i18n-audit-space.js <rev> <파일...>');
  process.exit(1);
}

let hits = 0;
for (const file of files) {
  let before;
  try {
    before = execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (_) { continue; }        // 새 파일 — 비교할 원본이 없다
  let now;
  try { now = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }

  const sf = ts.createSourceFile(file, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const padded = [];
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && KO.test(node.text) && node.text !== node.text.trim() && node.text.trim()) {
      // JSX 속성값은 원래도 공백이 의미 없다(레이아웃) — 제외.
      if (!(node.parent && ts.isJsxAttribute(node.parent))) padded.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const text of new Set(padded)) {
    const trimmed = text.trim();
    // 지금 파일이 그 문장을 **공백 없이** 감쌌고, 공백 있는 원본은 사라졌는가
    const wrappedTrimmed = now.includes(`i18n.t('${trimmed}')`) || now.includes(`i18n.t("${trimmed}")`);
    const keptOriginal = now.includes(text);
    if (wrappedTrimmed && !keptOriginal) {
      console.log(`${file}\n  원본: ${JSON.stringify(text)}  →  지금: i18n.t(${JSON.stringify(trimmed)})`);
      hits++;
    }
  }
}
console.log(hits ? `\n공백을 잃은 자리 ${hits}곳` : '공백을 잃은 자리 없음');
process.exit(hits ? 1 : 0);
