#!/usr/bin/env node
/**
 * i18n-keys — **지금 소스가 실제로 조회하는 문구**를 뽑는다.
 *
 * 치환이 끝난 뒤에는 이게 유일하게 정확한 목록이다: 런타임에 `i18n.t('X')` 로 찾는 X 와
 *  `text/*` 사전이 지연 프록시로 흘려보내는 한국어 값. "한국어 문자열을 전부 긁는" 방식은
 *  이미 감싼 것·카탈로그 파일·코드 주석까지 같이 세서 못 쓴다.
 *
 * `--unwrap-code` 를 주면 **코드 덩어리를 감싼 자리를 되돌린다** — 주입 스크립트에 들어 있는
 *  한국어 주석이 번역 대상으로 잡혔던 것을 원복하는 용도(번역되면 웹뷰가 죽는다).
 *
 * 쓰기: node scripts/i18n-keys.js <out.json> <루트...> [--unwrap-code]
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const KO = /[가-힣]/;
const SKIP_DIR = ['node_modules', '.next', 'build', 'dist', 'ios', 'android', '__tests__', 'test', 'vendor', 'coverage', 'scripts', 'i18n'];

/** 화면 문구가 아니라 코드(주입 스크립트·CSS·마크업 조각)인가 — i18n-scan.js 와 같은 규칙. */
const CODE_HINT = /function\s*\(|=>|;\s*\n|\bvar \b|\bconst \b|\blet \b|window\.|document\.|\bcatch\s*\(/;
function looksLikeCode(s) {
  const v = String(s || '');
  if (v.length < 60) return false;
  if (!CODE_HINT.test(v)) return false;
  const ko = (v.match(/[가-힣]/g) || []).length;
  return ko / v.length < 0.35;
}

function walk(root, out) {
  let st;
  try { st = fs.statSync(root); } catch (_) { return out; }
  if (st.isDirectory()) {
    if (SKIP_DIR.includes(path.basename(root))) return out;
    for (const f of fs.readdirSync(root)) walk(path.join(root, f), out);
    return out;
  }
  if (!/\.(ts|tsx|js|jsx)$/.test(root) || /\.(test|spec)\./.test(root)) return out;
  out.push(root);
  return out;
}

const [, , outFile, ...rest] = process.argv;
const unwrapCode = rest.includes('--unwrap-code');
const roots = rest.filter((r) => !r.startsWith('--'));
if (!outFile || !roots.length) {
  console.error('쓰기: i18n-keys.js <out.json> <루트...> [--unwrap-code]');
  process.exit(1);
}

const files = [];
for (const r of roots) walk(r, files);
const keys = new Set();
let unwrapped = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let sf;
  try {
    sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
      /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  } catch (_) { continue; }

  const codeCalls = [];    // 되돌릴 자리 [start, end, 리터럴]
  const visit = (node) => {
    // ① `i18n.t('X')` 의 X
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 't'
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'i18n'
      && node.arguments.length
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      const text = node.arguments[0].text;
      if (looksLikeCode(text)) {
        codeCalls.push([node.getStart(sf), node.getEnd(), node.arguments[0].getText(sf)]);
      } else if (KO.test(text)) {
        keys.add(text);
      }
    }
    // ② `text/*` 사전의 한국어 값 — 지연 프록시가 런타임에 t() 로 흘려보낸다.
    if (/[\\/]text[\\/]/.test(file) && ts.isPropertyAssignment(node)
      && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
      && KO.test(node.initializer.text) && !looksLikeCode(node.initializer.text)) {
      keys.add(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (unwrapCode && codeCalls.length) {
    let out = src;
    for (const [s, e, lit] of codeCalls.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + lit + out.slice(e);
    fs.writeFileSync(file, out);
    unwrapped += codeCalls.length;
    console.log(`코드 되돌림 ${codeCalls.length}곳: ${file}`);
  }
}

const sorted = [...keys].sort();
const obj = {};
for (const k of sorted) obj[k] = k;
fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n');
console.log(`${sorted.length}개 문장 → ${outFile}${unwrapCode ? ` (코드 되돌림 ${unwrapped}곳)` : ''}`);
