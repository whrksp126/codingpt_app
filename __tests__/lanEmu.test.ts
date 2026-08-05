/**
 * 화면 영상 LAN 직결의 **안전 규칙** — 빠르다고 봉인을 벗기지 않는다.
 *
 * LAN leg 는 평문이다(설계 §5.7). 사용자가 E2EE 를 'required' 로 걸어 뒀다면 그 위로는 아무것도
 *  보내지 않고 릴레이(TLS)에 남아야 한다. 이 규칙은 원래 fs RPC 경로에만 있었는데, 2026-08-05 에
 *  화면 영상이 두 번째 사용자가 되면서 **한 곳(plaintextAllowed)** 으로 모았다.
 *  이 파일이 없으면 "빠른 경로"가 조용히 다운그레이드 경로가 된다.
 */
jest.mock('../src/services/e2ee', () => ({ __esModule: true, default: { getStatus: jest.fn() } }));
//  ★ grant 요청이 **한 번도 나가지 않는 것**까지 봐야 게이트를 증명한다. 안 그러면 "네트워크가
//   없어서 null" 인 것과 구분이 안 돼 테스트가 헛돈다(실제로 그렇게 통과하는 걸 확인하고 고쳤다).
jest.mock('../src/services/daemonService', () => ({
  __esModule: true,
  default: { getClientKey: jest.fn(async () => 'ck'), lanGrant: jest.fn(async () => ({ ok: false, reason: 'unsupported' })) },
}));

import lanLink from '../src/services/lanLink';
import e2ee from '../src/services/e2ee';
import daemonService from '../src/services/daemonService';

const status = (policy: string) => { (e2ee.getStatus as jest.Mock).mockReturnValue({ policy }); };

describe('평문 LAN 게이트', () => {
  test('E2EE required 면 평문 LAN 을 쓰지 않는다', () => {
    status('required');
    expect(lanLink.plaintextAllowed()).toBe(false);
  });

  test('그 외 정책에서는 쓴다', () => {
    status('optional');
    expect(lanLink.plaintextAllowed()).toBe(true);
  });

  test('★ 화면 영상도 같은 게이트를 지난다(grant 요청조차 안 나간다)', async () => {
    status('required');
    (daemonService.lanGrant as jest.Mock).mockClear();
    await expect(lanLink.openEmu(7, { id: 'android:x' }, () => {}, () => {})).resolves.toBeNull();
    expect(daemonService.lanGrant).not.toHaveBeenCalled();
  });

  test('반대로 봉인이 없으면 실제로 LAN 을 시도한다(게이트가 항상 막고 있으면 기능이 죽는다)', async () => {
    status('optional');
    (daemonService.lanGrant as jest.Mock).mockClear();
    await lanLink.openEmu(7, { id: 'android:x' }, () => {}, () => {});
    expect(daemonService.lanGrant).toHaveBeenCalled();
  });
});
