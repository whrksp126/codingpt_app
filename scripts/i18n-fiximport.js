#!/usr/bin/env node
/**
 * `import { t } from '…/i18n';` 줄을 **import 문 전체가 끝난 뒤**로 옮긴다.
 *
 * 왜 필요했나: 처음엔 "마지막으로 `import` 로 시작하는 줄" 뒤에 넣었는데, 여러 줄 import
 *  (`import {\n  Modal,\n} from 'react-native';`)에서는 그 줄이 **첫 줄**이라 괄호 안으로 들어갔다.
 *  줄 단위로 소스를 다루면 늘 이런 식으로 진다 → 여기서는 파서가 알려 준 import 문의 끝을 쓴다.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const IMPORT_RE = /^\s*import\s*(?:\*\s*as\s+i18n|\{\s*t\s*\})\s*from\s*['"][^'"]*i18n[^'"]*['"];?\s*$/;

let fixed = 0;
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const kept = lines.filter((l) => !IMPORT_RE.test(l));
  if (kept.length === lines.length) continue;   // 이 파일엔 없음
  src = kept.join('\n');

  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let end = 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) end = st.getEnd();
    else break;   // import 무리는 파일 맨 위에 붙어 있다 — 첫 비-import 에서 멈춘다
  }
  const target = process.env.I18N_DIR ? path.resolve(process.env.I18N_DIR) : path.resolve('src/i18n');
  const rel = path.relative(path.dirname(path.resolve(file)), target).replace(/\\/g, '/');
  const spec = (rel.startsWith('.') ? rel : './' + rel) + (process.env.I18N_ENTRY || '');
  const stmt = `\nimport * as i18n from '${spec}';`;
  const out = end > 0 ? src.slice(0, end) + stmt + src.slice(end) : stmt.slice(1) + '\n' + src;
  fs.writeFileSync(file, out);
  fixed++;
}
console.log(`import 위치 교정: ${fixed}개 파일`);
