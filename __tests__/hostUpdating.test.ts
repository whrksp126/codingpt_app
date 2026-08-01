// 업데이트 재시작을 원격에 명시 — "고장" 과 "업데이트 중" 을 구분한다.
//
// 지키는 불변식(2026-08-01):
//  PC 는 업데이트를 적용할 때 20~30초 스스로 재시작한다. 그 사이 폰에서 보고 있던 사용자가 일반
//  "연결 끊김" 을 보면 PC 가 죽은 건지 인터넷이 끊긴 건지 알 수 없어 고장으로 읽는다. 이유를 알면
//  기다린다 — 그래서 사유를 실어 나르고, **영영 안 돌아오면 거짓말이 되지 않게 만료**시킨다.
import hostUpdating, { _internals } from '../src/workspace/hostUpdating';

describe('hostUpdating', () => {
  beforeEach(() => { hostUpdating.resetHostUpdating(); });

  it('표식이 없으면 평소(오프라인) 문구다', () => {
    expect(hostUpdating.isHostUpdating(7)).toBe(false);
    expect(hostUpdating.isHostUpdating(null)).toBe(false);
  });

  it('업데이트 예고를 받으면 그 호스트만 업데이트 중으로 본다', () => {
    hostUpdating.markHostUpdating(7, '0.1.208');
    expect(hostUpdating.isHostUpdating(7)).toBe(true);
    expect(hostUpdating.hostUpdatingTarget(7)).toBe('0.1.208');
    expect(hostUpdating.isHostUpdating(8)).toBe(false); // 다른 PC 는 영향 없음
  });

  it('돌아오면 표식이 사라진다(다음 끊김을 업데이트로 오인 금지)', () => {
    hostUpdating.markHostUpdating(7);
    hostUpdating.clearHostUpdating(7);
    expect(hostUpdating.isHostUpdating(7)).toBe(false);
  });

  it('업데이트가 실패해 영영 안 돌아오면 만료된다 — "곧 다시 연결"이 영구 거짓말이 되면 안 된다', () => {
    hostUpdating.markHostUpdating(7);
    const mark = _internals.marks.get(7)!;
    mark.at -= _internals.MAX_UPDATING_MS + 1;
    expect(hostUpdating.isHostUpdating(7)).toBe(false);
  });

  it('구독자에게 변화를 알린다(오버레이 재렌더)', () => {
    const seen: number[] = [];
    const un = hostUpdating.subscribeHostUpdating(() => seen.push(hostUpdating.getHostUpdatingVersion()));
    hostUpdating.markHostUpdating(7);
    hostUpdating.clearHostUpdating(7);
    un();
    hostUpdating.markHostUpdating(7); // 구독 해제 후엔 안 온다
    expect(seen.length).toBe(2);
  });

  it('로그아웃/채널 리셋은 근거가 사라진 표식을 버린다', () => {
    hostUpdating.markHostUpdating(7);
    hostUpdating.resetHostUpdating();
    expect(hostUpdating.isHostUpdating(7)).toBe(false);
  });
});

describe('배선', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');

  it('runner_status 의 업데이트 사유를 스토어로 흘린다', () => {
    const ctx = read('../src/contexts/WorkspaceShellContext.tsx');
    expect(ctx).toMatch(/e\.updating \|\| \(!e\.online && e\.reason === 'updating'\)/);
    expect(ctx).toMatch(/hostUpdating\.clearHostUpdating\(e\.deviceId\)/);
  });

  it('오프라인 오버레이가 업데이트 중일 땐 다른 문구를 쓴다', () => {
    const view = read('../src/workspace/WorkspaceView.tsx');
    expect(view).toMatch(/업데이트 중/);
    expect(view).toMatch(/곧 다시 연결돼요 · 하던 작업은 그대로 있어요/);
  });

  it('PC 는 재시작 직전에 사유를 예고한다', () => {
    const pc = read('../../codingpt_service/codingpt_pc/src/js/update-scheduler.js');
    expect(pc).toMatch(/announceUpdating\(stagedVersion \|\| ""\)/);
  });

  it('back 은 예고를 받아 오프라인 팬아웃에 사유를 싣는다', () => {
    const back = read('../../codingpt_service/codingpt_back/services/daemonRelayService.js');
    expect(back).toMatch(/msg\.type === 'host_updating'/);
    expect(back).toMatch(/reason: 'updating', toVersion/);
    // 자기 자신만 표시할 수 있다(타 기기 사칭 금지).
    expect(back).toMatch(/ws\._cptMeta\?\.kind === 'pc' && Number\.isInteger\(id\)/);
  });
});
