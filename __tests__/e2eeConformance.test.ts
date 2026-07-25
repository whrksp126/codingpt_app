/**
 * E2EE 크로스 구현 적합성 — **모바일 순수 JS ↔ 데몬(node crypto) 와이어 동치**.
 *
 * 왜 필요한가: 두 구현이 1바이트라도 어긋나면 복호가 조용히 실패하고 전부 평문으로 떨어진다
 *  (= 기능이 안 켜졌는데 아무 에러도 안 보이는 최악의 실패 모드). 그래서 설계서가 추상 표기한
 *  AAD/트랜스크립트/복구코드 직렬화를 **데몬 소스를 직접 로드해** 바이트로 대조한다.
 *
 * 왜 자식 프로세스인가: 데몬은 형제 리포의 CJS 모듈이고 그 리포에는 @babel/runtime 이 없다 →
 *  jest 변환기를 통과시키면 helper 해석에 실패한다(실측). 순수 node 로 "있는 그대로" 로드해야
 *  진짜 동치를 검증할 수 있어, 실검증 로직은 `scripts/e2ee-conformance.mjs` 에 두고 여기서 돌린다.
 *  (사람이 직접 볼 때: `node scripts/e2ee-conformance.mjs`)
 *
 * 데몬 리포가 없으면 스크립트가 SKIP 을 출력하고 0 으로 끝난다(앱 단독 체크아웃 보호).
 */
import { execFileSync } from 'child_process';
import path from 'path';

describe('데몬 e2ee.js 와 바이트 동치(scripts/e2ee-conformance.mjs)', () => {
  it('전 항목 적합(grant·봉투·알림·지문·복구코드·세션/프레임 골든벡터)', () => {
    const script = path.resolve(__dirname, '../scripts/e2ee-conformance.mjs');
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 120000 });
    // 데몬 리포 부재 = 스킵(앱 단독 체크아웃)
    if (out.includes('SKIP:')) { expect(out).toContain('SKIP:'); return; }
    expect(out).toContain('ALL CONFORMANT');
    expect(out).not.toContain('FAIL ');
  });
});
