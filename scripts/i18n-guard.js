#!/usr/bin/env node
/**
 * `t` 라는 이름이 **이미 쓰이고 있는 파일**을 찾아낸다.
 *
 * 왜: 자동 치환이 `import { t }` 를 넣는데, 그 파일이 이미 `const t = targetRef.current` 처럼
 *  `t` 를 쓰고 있으면 **조용히 다른 값을 부른다**. 타입이 맞아떨어지는 파일에서는 tsc 도 못 잡는다
 *  (SttPanel 은 운 좋게 걸렸다). 그래서 치환 전에 이 목록을 먼저 본다.
 *
 * 쓰기: node scripts/i18n-guard.js <파일...>   — 충돌 파일 경로를 한 줄씩 출력(없으면 조용)
 */
const fs = require('fs');
const ts = require('typescript');

for (const file of process.argv.slice(2)) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hit = false;
  const visit = (node) => {
    if (hit) return;
    // 선언 이름이 `t` 인 것들 — 변수·매개변수·함수·import 별칭
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)
      || ts.isFunctionDeclaration(node) || ts.isImportSpecifier(node) || ts.isImportClause(node))
      && node.name && ts.isIdentifier(node.name) && node.name.text === 't') {
      // 우리가 넣은 i18n import 는 제외
      const imp = node.parent && node.parent.parent;
      const isOurs = imp && ts.isImportDeclaration(imp)
        && ts.isStringLiteral(imp.moduleSpecifier) && /i18n/.test(imp.moduleSpecifier.text);
      if (!isOurs) hit = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (hit) console.log(file);
}
