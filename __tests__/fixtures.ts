// Agent Tasks 공유 계약 픽스처 로더 — 경로 계약(설계 §7.4).
//
// 앱은 별도 git 리포다. 픽스처 정본은 codingpt_service/codingpt_daemon/docs/fixtures/agent-tasks/ 에 있고
//  (데몬·PC 구현자가 쓴다) 두 리포가 나란히 체크아웃돼 있을 때만 교차 테스트가 돈다.
//  `CPT_FIXTURES` 로 경로를 바꿀 수 있고, 없으면 경고 한 줄 뒤 **skip** — 앱 리포 단독 CI 가 깨지지 않게.
//
// ⚠ jest 는 __tests__ 아래의 .ts 를 전부 테스트 파일로 수집한다 → 이 파일이 직접 실행될 때만 경로 계약 자체를
//   검사하는 테스트 한 개를 등록한다(다른 테스트가 import 할 때는 등록하지 않는다).
import fs from 'fs';
import path from 'path';

export const FIXTURES_DIR: string = process.env.CPT_FIXTURES
  || path.resolve(__dirname, '../../codingpt_service/codingpt_daemon/docs/fixtures/agent-tasks');

export const fixturesAvailable: boolean = (() => {
  try { return fs.statSync(FIXTURES_DIR).isDirectory(); } catch (_) { return false; }
})();

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn('[fixtures] agent-tasks 픽스처 없음 — 교차 테스트 skip');
}

/** prefix 로 시작하는 픽스처 파일 이름들(정렬). 디렉토리가 없으면 경고 후 []. */
export function listFixtures(prefix: string): string[] {
  if (!fixturesAvailable) { warnOnce(); return []; }
  return fs.readdirSync(FIXTURES_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
}

/** 픽스처 JSON 하나. 없으면 null(경고 1회). */
export function loadFixture<T = any>(name: string): T | null {
  const p = path.join(FIXTURES_DIR, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch (_) { warnOnce(); return null; }
}

/** 픽스처가 없으면 test.skip, 있으면 test — 설계 §7.4 의 계약 그대로. */
export const fixtureTest: jest.It = (fixturesAvailable ? test : test.skip) as jest.It;
if (!fixturesAvailable) warnOnce();

const self = (expect as any).getState?.().testPath as string | undefined;
if (self && /__tests__[\\/]fixtures\.ts$/.test(self)) {
  test('픽스처 경로 계약 — CPT_FIXTURES 우선, 없으면 형제 리포의 docs/fixtures/agent-tasks', () => {
    const expected = process.env.CPT_FIXTURES
      || path.resolve(__dirname, '../../codingpt_service/codingpt_daemon/docs/fixtures/agent-tasks');
    expect(FIXTURES_DIR).toBe(expected);
    expect(typeof fixturesAvailable).toBe('boolean');
  });
}
