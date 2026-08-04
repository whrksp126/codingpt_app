// 잘려 나간 공백을 원본 그대로 되돌린다(동작 보존이 최우선 — 문장 구조 개선은 별개 작업).
const { execFileSync } = require('child_process');
const fs = require('fs'); const ts = require('typescript');
const KO = /[가-힣]/;
const [,, rev, ...files] = process.argv;
let fixed = 0;
for (const file of files) {
  let before; try { before = execFileSync('git',['show',`${rev}:${file}`],{encoding:'utf8',maxBuffer:32*1024*1024}); } catch(_) { continue; }
  let now; try { now = fs.readFileSync(file,'utf8'); } catch(_) { continue; }
  const sf = ts.createSourceFile(file, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const padded = new Set();
  const visit = (n) => {
    if ((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) && KO.test(n.text)
      && n.text !== n.text.trim() && n.text.trim()
      && !(n.parent && ts.isJsxAttribute(n.parent))) padded.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = now;
  for (const text of padded) {
    const t = text.trim();
    for (const q of ["'", '"']) {
      const from = `i18n.t(${q}${t}${q})`;
      if (!out.includes(from)) continue;
      const qq = text.includes("'") ? '"' : "'";
      out = out.split(from).join(`i18n.t(${qq}${text.replace(/\\/g,'\\\\')}${qq})`);
      fixed++;
    }
  }
  if (out !== now) fs.writeFileSync(file, out);
}
console.log(`공백 복원 ${fixed}곳`);
