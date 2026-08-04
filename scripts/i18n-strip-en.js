#!/usr/bin/env node
/**
 * text/*.{ts,js} 사전에서 **`en` 반쪽을 잘라낸다**(번역은 i18n 카탈로그로 옮겼다).
 *
 * 파서로 자른다 — 정규식으로 중괄호를 세면 문자열 안의 `}` 하나에 파일이 망가진다.
 * 잘라내기 전에 값들은 이미 `i18n/en.json` 으로 회수해 뒀다(scripts 로그 참조).
 */
const fs = require('fs');
const ts = require('typescript');

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
    /\.tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  /** 잘라낼 구간 [start, end) — 사전 최상위의 `en:` 프로퍼티 전체. */
  const cuts = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const key = ts.isIdentifier(name) ? name.text
        : (ts.isStringLiteral(name) ? name.text : null);
      // 사전 최상위의 en 만 — 안쪽 어딘가에 en 이라는 키가 또 있을 수 있다.
      if (key === 'en' && node.parent && ts.isObjectLiteralExpression(node.parent)
        && node.parent.properties.some((p) => {
          const n = p.name;
          const k = n && (ts.isIdentifier(n) ? n.text : (ts.isStringLiteral(n) ? n.text : null));
          return k === 'ko';
        })) {
        // 바로 앞의 쉼표·주석까지 같이 잘라야 문법이 남지 않는다.
        let start = node.getFullStart();
        let end = node.getEnd();
        if (src[end] === ',') end++;
        cuts.push([start, end]);
        return;   // 안쪽은 더 안 본다
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!cuts.length) { console.log('건드릴 것 없음:', file); continue; }
  let out = src;
  for (const [s, e] of cuts.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + '\n' + out.slice(e);
  fs.writeFileSync(file, out);
  console.log(`en 반쪽 ${cuts.length}개 제거:`, file);
}
