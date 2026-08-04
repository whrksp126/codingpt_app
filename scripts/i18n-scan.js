#!/usr/bin/env node
/**
 * i18n-scan — 화면에 나가는 한국어 문구를 **자리(위치)별로 갈라서** 세고, 사전을 뽑고, 감쌀 수 있는
 *  자리는 소스를 고쳐 준다.
 *
 * 왜 정규식이 아니라 파서인가: `t()` 는 **부를 때** 언어를 본다. 모듈 최상위 상수를 감싸면 앱이
 *  뜨는 순간(언어 설정을 읽기도 전에) 한국어로 굳어 버린다 — 그리고 이 사고는 한국어로 쓰는
 *  개발자에게는 **영원히 안 보인다**. 그래서 "함수/JSX 안인가"를 AST 로 확실히 판정한다.
 *
 * 쓰기:
 *   node scripts/i18n-scan.js report <루트...>          자리별 집계만
 *   node scripts/i18n-scan.js extract <out.json> <루트...>  사전(키 목록) 뽑기
 *   node scripts/i18n-scan.js rewrite <루트...>          감쌀 수 있는 자리만 t() 로 고치기
 *
 * 안 건드리는 것: 주석, import/require 경로, 객체 **키**, 비교 대상(=== 등), switch case,
 *  모듈 최상위(함수 밖), 콘솔 로그, 테스트 파일, 레거시(레슨·데이터).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const KO = /[가-힣]/;

/** 이 밑은 통째로 건너뛴다. */
const SKIP_DIR = [
  'node_modules', '.next', 'build', 'dist', 'ios', 'android', '__tests__', 'test',
  'vendor', 'coverage', 'scripts',
];
/** 레거시(레슨)·데이터 덩어리 — 번역 대상이 아니다(사용자 확정). */
const SKIP_PATH = [
  '/screens/Lesson/', '/data/class/', '/data/lesson', 'LessonLearningScreen', 'HtmlLessonScreen',
  'TextHighlightScreen', 'LessonDetailScreen', '/screens/MobileIDE/',
  '/data/item', '/data/onboarding', '/screens/MyInfo/LearningContent', 'MyPageScreen',
  'codemirrorAssets', 'd2codingFont', 'firaCodeFont', 'jetbrainsMonoFont',
  // 사용자가 지금 손대고 있는 파일(구독·과금) — 내 변경을 섞으면 사용자 작업과 분리할 수 없다.
  '/components/Billing/', '/screens/MyInfo/BillingContent', '/screens/MyInfo/MyInfoContent',
  '/screens/MyInfo/UsageContent', '/services/billingService', '/services/purchasesService',
  '/services/agentService', '/types/billing', '/config/features',
  // node 가 번들 없이 직접 import 하는 순수 ESM(암호 코어·적합성 테스트) — 디렉토리 import 를 못 읽는다.
  '/services/e2ee/e2eeCore',
];

function walkFiles(root, out) {
  let st;
  try { st = fs.statSync(root); } catch (_) { return out; }
  if (st.isDirectory()) {
    if (SKIP_DIR.includes(path.basename(root))) return out;
    for (const f of fs.readdirSync(root)) walkFiles(path.join(root, f), out);
    return out;
  }
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(root)) return out;
  if (/\.(test|spec)\./.test(root)) return out;
  if (SKIP_PATH.some((p) => root.includes(p))) return out;
  out.push(root);
  return out;
}

/** 함수/메서드/화살표 안인가 — 밖이면 `t()` 를 부를 시점이 "모듈 로드"라 언어가 안 정해져 있다. */
function insideFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p)
      || ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isConstructorDeclaration(p)) return true;
  }
  return false;
}

/** JSX 안인가 — JSX 는 렌더할 때 평가되므로 모듈 최상위에 있어도 안전하다. */
function insideJsx(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return true;
  }
  return false;
}

/** 이 문자열을 건드리면 **동작이 바뀌는** 자리인가. */
function isLogicPosition(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  // 객체 **키**('한글': 1) — 값이 아니라 이름이다
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  // 비교 — 번역하면 영어에서만 조건이 어긋난다(한국어로 쓰는 동안엔 영원히 안 보인다)
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken
      || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken) return true;
  }
  if (ts.isCaseClause(p)) return true;
  // includes/indexOf/startsWith… 의 인자 = 사실상 비교
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
    const m = p.expression.name.text;
    if (['includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'match', 'test',
      'split', 'replace', 'replaceAll', 'localeCompare'].includes(m)) return true;
  }
  // 타입 자리(리터럴 유니온 등)
  if (ts.isLiteralTypeNode(p)) return true;
  return false;
}

/** 개발자만 보는 자리(콘솔·주석성 로그) — 번역할 이유가 없다. */
function isDevOnly(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
      const o = p.expression.expression;
      if (ts.isIdentifier(o) && o.text === 'console') return true;
    }
  }
  return false;
}

const BUCKETS = ['jsxText', 'jsxAttr', 'jsxExpr', 'call', 'prop', 'other', 'moduleConst', 'logic', 'dev', 'code'];

function classify(node) {
  if (looksLikeCode(node.text != null ? node.text : node.getText())) return 'code';
  if (isDevOnly(node)) return 'dev';
  if (isLogicPosition(node)) return 'logic';
  if (ts.isJsxText(node)) return 'jsxText';
  const inFn = insideFunction(node);
  const inJsx = insideJsx(node);
  if (!inFn && !inJsx) return 'moduleConst';
  const p = node.parent;
  if (ts.isJsxAttribute(p) || (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent))) return 'jsxAttr';
  if (inJsx && p && ts.isJsxExpression(p)) return 'jsxExpr';
  if (inJsx && p && (ts.isConditionalExpression(p) || ts.isBinaryExpression(p))) return 'jsxExpr';
  if (p && ts.isCallExpression(p)) return 'call';
  if (p && ts.isPropertyAssignment(p)) return 'prop';
  return 'other';
}

/** 파일 하나 → 발견 목록. */
function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
    /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (KO.test(node.text)) {
        // PC 는 화면을 **HTML 문자열**로 만든다. 통째로 감싸면 번역자가 마크업을 다시 써야 하고,
        //  마크업을 한 글자 고칠 때마다 7개 언어가 전부 무효가 된다 → 텍스트 노드만 따로 감싼다.
        const raw = node.getText(sf);
        const kind = looksLikeCode(node.text) ? 'code' : (isHtmlish(raw) ? 'html' : classify(node));
        found.push({ node, text: node.text, kind, start: node.getStart(sf), end: node.getEnd(),
          raw: node.getText(sf) });
        // ★ HTML 리터럴 안으로는 **더 안 들어간다**. 템플릿은 흔히 중첩된다
        //  (`<span>${cond ? `<i>${'직결'}</i>` : ""}</span>`) — 안팎을 둘 다 고치면 치환 구간이
        //  겹쳐 파일이 통째로 망가진다(실제로 sidebar.js 가 그렇게 깨졌다). 바깥 하나만 고친다.
        if (kind === 'html') return;
      }
    } else if (ts.isJsxText(node)) {
      if (KO.test(node.text) && node.text.trim()) {
        found.push({ node, text: node.text.trim(), kind: classify(node), start: node.getStart(sf), end: node.getEnd(), raw: node.text });
      }
    } else if (ts.isTemplateExpression(node)) {
      // `파일 ${n}개` — 조각마다 한국어가 있으면 **문장 조립**이다. 자동으로 못 고친다(어순).
      const whole = node.getText(sf);
      if (KO.test(whole)) {
        const kind = looksLikeCode(whole) ? 'code' : (isHtmlish(whole) ? 'html' : 'template');
        found.push({ node, text: whole, kind, start: node.getStart(sf), end: node.getEnd(), raw: whole });
        if (kind === 'html') return;   // 중첩 템플릿 — 바깥 하나만(위 주석)
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { src, sf, found };
}

function cmd_files(kind, roots) {
  const files = [];
  for (const r of roots) walkFiles(r, files);
  const rows = [];
  for (const f of files) {
    let r;
    try { r = scanFile(f); } catch (_) { continue; }
    const n = r.found.filter((it) => it.kind === kind);
    if (n.length) rows.push([n.length, f, n.slice(0, 3).map((x) => x.text.slice(0, 30))]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  for (const [n, f, sample] of rows) console.log(String(n).padStart(4), f, '|', sample.join(' / '));
}

function cmd_report(roots) {
  const files = [];
  for (const r of roots) walkFiles(r, files);
  const tally = {};
  const perKindFiles = {};
  let total = 0;
  for (const f of files) {
    let r;
    try { r = scanFile(f); } catch (e) { console.error('파싱 실패', f, e.message); continue; }
    for (const it of r.found) {
      tally[it.kind] = (tally[it.kind] || 0) + 1;
      (perKindFiles[it.kind] || (perKindFiles[it.kind] = new Set())).add(f);
      total++;
    }
  }
  console.log(`파일 ${files.length}개 / 한국어 문자열 ${total}개`);
  for (const k of [...BUCKETS, 'template']) {
    if (!tally[k]) continue;
    console.log(`  ${k.padEnd(12)} ${String(tally[k]).padStart(5)}  (파일 ${perKindFiles[k].size})`);
  }
}

/** 감쌀 수 있는 자리 = 실제로 화면에 나가고, 렌더 시점에 평가되는 자리. */
const WRAPPABLE = new Set(['jsxText', 'jsxAttr', 'jsxExpr', 'call', 'prop', 'other']);

function cmd_extract(outFile, roots) {
  const files = [];
  for (const r of roots) walkFiles(r, files);
  const keys = new Set();
  for (const f of files) {
    let r;
    try { r = scanFile(f); } catch (_) { continue; }
    for (const it of r.found) {
      if (it.kind === 'dev' || it.kind === 'logic' || it.kind === 'template' || it.kind === 'code') continue;
      if (it.kind === 'html') {
        // HTML 은 통째로가 아니라 **감쌀 조각만** 사전에 넣는다(rewrite 와 같은 규칙이어야
        //  "번역은 있는데 안 바뀌는" 유령 항목이 안 생긴다).
        const rewritten = rewriteHtmlLiteral(it.raw);
        if (!rewritten) continue;
        for (const m of rewritten.matchAll(/\$\{i18n\.t\((['"])((?:\\.|(?!\1).)*)\1\)\}/g)) {
          const v = m[2].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
          if (v.trim()) keys.add(v.trim());
        }
        continue;
      }
      // rewrite 와 **같은 규칙**이어야 한다(자르면 키가 어긋나 "번역은 있는데 안 바뀌는" 유령이 된다).
      const s = it.kind === 'jsxText' ? it.text.trim() : it.text;
      if (s.trim()) keys.add(s);
    }
  }
  const sorted = [...keys].sort();
  const obj = {};
  for (const k of sorted) obj[k] = k;
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n');
  console.log(`${sorted.length}개 문장 → ${outFile}`);
}

/** t() 호출로 바꿔치기. 뒤에서 앞으로 치환해야 앞쪽 오프셋이 안 밀린다. */
function cmd_rewrite(roots, opts) {
  const files = [];
  for (const r of roots) walkFiles(r, files);
  let changedFiles = 0;
  let changed = 0;
  for (const f of files) {
    let r;
    try { r = scanFile(f); } catch (_) { continue; }
    const targets = r.found.filter((it) => WRAPPABLE.has(it.kind) || it.kind === 'html');
    if (!targets.length) continue;
    let out = r.src;
    for (const it of targets.slice().sort((a, b) => b.start - a.start)) {
      let replacement;
      if (it.kind === 'html') {
        const html = rewriteHtmlLiteral(it.raw);
        if (!html) continue;         // 감쌀 텍스트가 없다(속성·클래스에만 한국어) — 건드리지 않는다
        out = out.slice(0, it.start) + html + out.slice(it.end);
        changed++;
        continue;
      }
      // ★ 일반 문자열은 **자르지 않는다.** 앞뒤 공백이 값의 일부다 —
      //   `'추론 ' + effort` 를 잘라 감쌌더니 화면에 "추론high" 로 붙었다(대조 테스트가 잡았다).
      //   JSX 텍스트만 자른다(거기서는 공백이 값이 아니라 레이아웃이다).
      const lit = quote(it.kind === 'jsxText' ? it.text.trim() : it.text);
      if (it.kind === 'jsxText') {
        // 앞뒤 공백/줄바꿈은 레이아웃에 영향을 주므로 **그대로 보존**하고 가운데만 바꾼다.
        const raw = it.raw;
        const lead = raw.slice(0, raw.length - raw.trimStart().length);
        const tail = raw.slice(raw.trimEnd().length);
        replacement = `${lead}{i18n.t(${lit})}${tail}`;
      } else if (it.kind === 'jsxAttr' && ts.isJsxAttribute(it.node.parent)) {
        replacement = `{i18n.t(${lit})}`;
      } else {
        replacement = `i18n.t(${lit})`;
      }
      out = out.slice(0, it.start) + replacement + out.slice(it.end);
      changed++;
    }
    if (out !== r.src) {
      out = ensureImport(out, f);
      if (!opts.dry) fs.writeFileSync(f, out);
      changedFiles++;
    }
  }
  console.log(`${changed}곳 / 파일 ${changedFiles}개${opts.dry ? ' (dry-run)' : ''}`);
}


/**
 * **코드**인가 — 화면 문구가 아니라 주입 스크립트·CSS·마크업 조각.
 *
 * 왜 필요한가: 웹뷰에 넣는 스크립트에는 한국어 **주석**이 들어 있다. 그걸 감싸면
 *  ① 번역자에게 "이 자바스크립트를 일본어로 번역하세요" 가 가고, ② 누가 실제로 번역하면
 *  **웹뷰가 통째로 죽는다**. 화면 문구와 코드는 여기서 갈라 놓는다.
 */
const CODE_HINT = /function\s*\(|=>|;\s*\n|\bvar \b|\bconst \b|\blet \b|window\.|document\.|\bcatch\s*\(|\{\s*\n\s*(?:\/\/|[a-zA-Z$_]+\s*[:(])/;
function looksLikeCode(text) {
  const s = String(text || '');
  if (s.length < 60) return false;                  // 짧은 문장은 문구로 본다
  if (!CODE_HINT.test(s)) return false;
  // 한국어 비중이 낮으면(=대부분 코드) 확실하다. 높으면 "코드 예시가 섞인 안내문"일 수 있다.
  const ko = (s.match(/[가-힣]/g) || []).length;
  return ko / s.length < 0.35;
}

/** HTML 마크업을 담은 문자열인가 — 태그가 하나라도 열리고 닫히면 그렇게 본다. */
function isHtmlish(raw) {
  return /<[a-zA-Z][^>]*>/.test(raw);
}

/**
 * HTML 문자열 안의 **사람이 읽는 부분만** `${i18n.t('…')}` 로 바꾼다.
 *  · 태그 사이의 텍스트 노드
 *  · placeholder/title/aria-label/value 같은 **보이는** 속성값
 * 나머지(클래스·id·이벤트·이미 있는 `${...}`)는 손대지 않는다.
 * 결과는 여전히 템플릿 리터럴이라 백틱을 유지해야 한다(따옴표 문자열이면 백틱으로 바꾼다).
 */
const VISIBLE_ATTR = /\b(placeholder|title|aria-label|alt|value)="([^"]*[가-힣][^"]*)"/g;
function rewriteHtmlLiteral(raw) {
  const quote0 = raw[0];
  let body = raw.slice(1, -1);          // 따옴표/백틱 벗기기
  if (quote0 === "'" || quote0 === '"') {
    // 백틱으로 바꾸면 원래 이스케이프(\' 등)가 필요 없어지고, 백틱/${ 는 새로 막아야 한다.
    body = body.replace(/\\(['"])/g, '$1').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  }
  let changed = 0;
  // 보이는 속성값
  body = body.replace(VISIBLE_ATTR, (whole, attr, val) => {
    changed++; return `${attr}="\${i18n.t(${quote(val.trim())})}"`;
  });
  // 태그 사이 텍스트 — `>` 와 다음 `<` 사이. `${...}` 가 낀 조각은 건드리지 않는다(어순이 섞인다).
  body = body.replace(/>([^<>]*[가-힣][^<>]*)</g, (whole, inner) => {
    if (inner.includes('${')) return whole;
    const lead = inner.slice(0, inner.length - inner.trimStart().length);
    const tail = inner.slice(inner.trimEnd().length);
    changed++;
    return `>${lead}\${i18n.t(${quote(inner.trim())})}${tail}<`;
  });
  return changed ? '`' + body + '`' : null;
}

/** 리포 스타일에 맞춰 홑따옴표를 우선한다(문장에 홑따옴표가 있으면 겹따옴표). */
function quote(s) {
  if (!s.includes("'")) return "'" + s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + "'";
  return JSON.stringify(s);
}

/** `t` import 를 파일 맨 위 import 무리 뒤에 한 줄 넣는다(이미 있으면 안 넣는다). */
function ensureImport(src, file) {
  // ⚠ 이름은 반드시 `i18n` 네임스페이스다 — 이 리포에서 `t` 는 지역 변수로 너무 흔해
  //   전역 import 로 들여오면 어느 스코프에선 조용히 다른 값을 부른다(scripts/i18n-rename.js 주석).
  if (/\bimport\s*\*\s*as\s+i18n\s+from/.test(src)) return src;
  // PC 는 번들러가 없어 확장자까지 적어야 한다(`../i18n/index.js`). 앱(Metro)은 디렉토리로 족하다.
  const target = process.env.I18N_DIR ? path.resolve(process.env.I18N_DIR) : path.join(APP_SRC, 'i18n');
  const suffix = process.env.I18N_ENTRY || '';
  const rel = path.relative(path.dirname(path.resolve(file)), target).replace(/\\/g, '/');
  const spec = (rel.startsWith('.') ? rel : './' + rel) + suffix;
  const lines = src.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) last = i;
    if (last >= 0 && i > last + 6 && !/^\s*(import|\/\/|\s*$)/.test(lines[i])) break;
  }
  const stmt = `import * as i18n from '${spec}';`;
  if (last < 0) return stmt + '\n' + src;
  lines.splice(last + 1, 0, stmt);
  return lines.join('\n');
}

let APP_SRC = path.resolve(__dirname, '..', 'src');

const [, , cmd, ...rest] = process.argv;
if (cmd === 'files') cmd_files(rest[0], rest.slice(1));
else if (cmd === 'report') cmd_report(rest.length ? rest : [APP_SRC]);
else if (cmd === 'extract') cmd_extract(rest[0], rest.slice(1));
else if (cmd === 'rewrite') cmd_rewrite(rest.filter((a) => a !== '--dry'), { dry: rest.includes('--dry') });
else {
  console.error('쓰기: i18n-scan.js report|extract|rewrite ...');
  process.exit(1);
}
