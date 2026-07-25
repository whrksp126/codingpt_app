// LAN 경로 상태 머신(기능4) 임계값 고정 테스트.
//  플래핑은 "프리뷰가 몇 초마다 끊긴다"로 사용자에게 즉시 보이는 버그이고, 반대로 과한 히스테리시스는
//  "Wi-Fi 로 돌아왔는데 계속 느리다"가 된다. 이 파일이 그 균형점(경계값)을 고정한다.
import {
  initialState, step, canProbe, shouldUseLan, badge, fingerprintOf,
  PROBE_RTT_MAX_MS, OBSERVE_MS, MIN_DWELL_MS, COOLDOWN_BASE_MS, COOLDOWN_MAX_MS,
  HARD_FAIL_BLOCK, UNSUPPORTED_RETRY_MS,
  type PathState,
} from '../src/services/lanPath';

const FP = '192.168.0.0/24';
// probe 성공 2연속으로 lan 승격
function promote(now = 0): PathState {
  let s = initialState(FP, 0);
  s = step(s, { t: 'probe_ok', rttMs: 20, fingerprint: FP }, now);
  s = step(s, { t: 'probe_ok', rttMs: 25, fingerprint: FP }, now);
  return s;
}

describe('lanPath — 승격', () => {
  it('기본은 relay 이고, relay 는 에러가 아니라 정상이다', () => {
    const s = initialState(FP, 0);
    expect(s.mode).toBe('relay');
    expect(shouldUseLan(s)).toBe(false);
    expect(badge(s)).toBeNull();      // 정상 상태는 아무것도 표시하지 않는다
    expect(canProbe(s, 0)).toBe(true);
  });

  it('1회 성공으론 승격하지 않고(probing), 2회 연속에서 lan', () => {
    let s = initialState(FP, 0);
    s = step(s, { t: 'probe_ok', rttMs: 10, fingerprint: FP }, 0);
    expect(s.mode).toBe('probing');
    expect(shouldUseLan(s)).toBe(false);
    s = step(s, { t: 'probe_ok', rttMs: 10, fingerprint: FP }, 100);
    expect(s.mode).toBe('lan');
    expect(badge(s)).toBe('직결');
    expect(s.observeUntil).toBe(100 + OBSERVE_MS);
  });

  it('RTT 상한 경계 — 800ms 는 성공, 801ms 는 스트릭 초기화(릴레이보다 나을 게 없음)', () => {
    let s = initialState(FP, 0);
    s = step(s, { t: 'probe_ok', rttMs: PROBE_RTT_MAX_MS, fingerprint: FP }, 0);
    expect(s.okStreak).toBe(1);
    s = step(s, { t: 'probe_ok', rttMs: PROBE_RTT_MAX_MS + 1, fingerprint: FP }, 1);
    expect(s.okStreak).toBe(0);
    expect(s.mode).toBe('relay');
  });

  it('probing 중 소프트 실패는 쿨다운 없이 스트릭만 깬다(다음 기회 즉시)', () => {
    let s = step(initialState(FP, 0), { t: 'probe_ok', rttMs: 10, fingerprint: FP }, 0);
    s = step(s, { t: 'soft_fail' }, 10);
    expect(s.mode).toBe('relay');
    expect(canProbe(s, 10)).toBe(true);
  });
});

describe('lanPath — 강등/히스테리시스', () => {
  it('하드 실패 1회로 즉시 강등 + 60s 쿨다운(최소 체류 무관)', () => {
    let s = promote(0);
    s = step(s, { t: 'hard_fail', cause: 'auth' }, 1_000); // 최소 체류(30s) 훨씬 안쪽
    expect(s.mode).toBe('cooldown');
    expect(s.cooldownUntil).toBe(1_000 + COOLDOWN_BASE_MS);
    expect(canProbe(s, 1_000 + COOLDOWN_BASE_MS - 1)).toBe(false);
    expect(canProbe(s, 1_000 + COOLDOWN_BASE_MS)).toBe(true);
  });

  it('최소 체류 경계 — 30s 전 소프트 실패는 무시, 30s 이후 2연속이면 강등', () => {
    let s = promote(0);
    s = step(s, { t: 'settle' }, OBSERVE_MS + 1); // 관찰 구간 통과
    // 29.999s: 무시
    s = step(s, { t: 'soft_fail' }, MIN_DWELL_MS - 1);
    expect(s.mode).toBe('lan');
    expect(s.softStreak).toBe(0);
    // 30.000s: 1회는 버틴다
    s = step(s, { t: 'soft_fail' }, MIN_DWELL_MS);
    expect(s.mode).toBe('lan');
    expect(s.softStreak).toBe(1);
    // 2연속이면 강등
    s = step(s, { t: 'soft_fail' }, MIN_DWELL_MS + 10);
    expect(s.mode).toBe('cooldown');
  });

  it('관찰 구간(3s) 안의 소프트 실패는 최소 체류 예외 — 즉시 강등', () => {
    let s = promote(0);
    s = step(s, { t: 'soft_fail' }, OBSERVE_MS - 1);
    expect(s.mode).toBe('cooldown'); // "승격이 틀렸다"는 신호
  });

  it('연속 강등마다 쿨다운 ×2, 상한 15분에서 포화', () => {
    let s = promote(0);
    let t = 0;
    const spans: number[] = [];
    for (let i = 0; i < 10; i++) {
      s = step(s, { t: 'hard_fail', cause: 'auth' }, t);
      spans.push(s.cooldownUntil - t);
      t = s.cooldownUntil;
      s = { ...s, mode: 'lan', blocked: false, hardFails: 0, enteredAt: t, observeUntil: 0 }; // 재승격 가정
    }
    expect(spans.slice(0, 4)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(spans[spans.length - 1]).toBe(COOLDOWN_MAX_MS);
  });

  it('settle 이 백오프를 기본값으로 되돌린다(오래 잘 쓰다 한 번 끊긴 걸 벌주지 않는다)', () => {
    let s = promote(0);
    s = step(s, { t: 'hard_fail', cause: 'auth' }, 0);          // cooldownMs 120s 로 증가
    s = { ...promote(0), cooldownMs: s.cooldownMs };
    s = step(s, { t: 'settle' }, OBSERVE_MS + 1);
    expect(s.cooldownMs).toBe(COOLDOWN_BASE_MS);
    s = step(s, { t: 'hard_fail', cause: 'auth' }, 999);
    expect(s.cooldownUntil - 999).toBe(COOLDOWN_BASE_MS);
  });
});

describe('lanPath — 부활/차단/미지원', () => {
  it('부활 트리거는 쿨다운을 1회 무시한다(앱 복귀·네트워크 변화)', () => {
    let s = step(promote(0), { t: 'hard_fail', cause: 'auth' }, 0);
    expect(canProbe(s, 1_000)).toBe(false);
    s = step(s, { t: 'revive' }, 1_000);
    expect(s.mode).toBe('relay');
    expect(canProbe(s, 1_000)).toBe(true);
  });

  // ⚠ blocked 는 "이 망이 우리를 **거부**한다"는 증거(인증 실패/프레임 위반)에만 걸린다.
  //  타임아웃(cause:'unreachable')까지 세면, 폰이 외부망에 있을 때의 정상 실패가 **집 지문**에
  //  누적돼(지문은 대상 PC 의 서브넷) 귀가 후에도 직결이 영구 정지된다 — 조용히 죽는 유형이라 최악이다.
  it('거부성 하드 실패 3회면 중단(자동 부활로는 안 풀리고, 사용자 재시도로는 풀린다)', () => {
    let s = promote(0);
    for (let i = 0; i < HARD_FAIL_BLOCK; i++) {
      s = step(s, { t: 'hard_fail', cause: 'auth' }, i * 1000);
      s = { ...s, mode: i < HARD_FAIL_BLOCK - 1 ? 'lan' : s.mode };
    }
    expect(s.blocked).toBe(true);
    expect(canProbe(s, 10_000_000)).toBe(false);
    // 자동 부활(포그라운드 복귀)로는 안 풀린다 — 스팸 방지.
    expect(step(s, { t: 'revive' }, 10_000_000).blocked).toBe(true);
    // 사용자가 직접 다시 시도하면 풀린다 — 해제 수단이 없으면 기능이 영구히 죽는다.
    const revived = step(s, { t: 'revive', user: true }, 10_000_000);
    expect(revived.blocked).toBe(false);
    expect(canProbe(revived, 10_000_001)).toBe(true);
    // 사용자가 설정에서 다시 켜면(명시적 의사) 초기화된다
    expect(step(s, { t: 'enable' }, 1).blocked).toBe(false);
  });

  it('타임아웃(unreachable) 하드 실패는 아무리 반복돼도 blocked 를 만들지 않는다', () => {
    // 재현하려던 버그: 외출 중 프리뷰를 3번 열면(항상 타임아웃) 귀가 후 같은 Wi-Fi 에서도
    //  직결이 영구 미사용이 되고, 해제 수단이 설정 토글뿐이라 사용자가 원인을 알 수 없다.
    let s = promote(0);
    for (let i = 0; i < HARD_FAIL_BLOCK * 3; i++) {
      s = step({ ...s, mode: 'lan' }, { t: 'hard_fail', cause: 'unreachable' }, i * 1000);
    }
    expect(s.blocked).toBe(false);
    expect(s.hardFails).toBe(0);
    // 쿨다운은 걸린다(무한 재시도 방지) — 만료되면 다시 시도할 수 있다.
    expect(s.mode).toBe('cooldown');
    expect(canProbe(s, 10_000_000)).toBe(true);
  });

  it('네트워크가 바뀌면 실패 이력이 리셋된다(카페에서 실패해도 집에서 즉시 재시도)', () => {
    let s = promote(0);
    for (let i = 0; i < HARD_FAIL_BLOCK; i++) s = step({ ...s, mode: 'lan' }, { t: 'hard_fail', cause: 'auth' }, i);
    expect(s.blocked).toBe(true);
    s = step(s, { t: 'net_change', fingerprint: '10.0.1.0/24' }, 5);
    expect(s.blocked).toBe(false);
    expect(canProbe(s, 5)).toBe(true);
    // 같은 지문이면 아무 일도 없다(불필요한 리셋 금지)
    const same = step(s, { t: 'net_change', fingerprint: '10.0.1.0/24' }, 6);
    expect(same).toBe(s);
  });

  it('LAN_UNSUPPORTED 는 정상 상태 — 오래 쉬고, 부활로도 앞당기지 않는다(grant 스팸 방지)', () => {
    let s = step(initialState(FP, 0), { t: 'unsupported' }, 0);
    expect(s.unsupported).toBe(true);
    expect(s.blocked).toBe(false);
    expect(badge(s)).toBeNull();
    expect(canProbe(s, UNSUPPORTED_RETRY_MS - 1)).toBe(false);
    expect(step(s, { t: 'revive' }, 1_000)).toBe(s);        // 무변화
    expect(canProbe(s, UNSUPPORTED_RETRY_MS)).toBe(true);   // 30분 뒤 한 번 재확인
  });

  it('사용자 OFF 는 어떤 이벤트로도 켜지지 않는다', () => {
    let s = step(promote(0), { t: 'disable' }, 0);
    expect(s.mode).toBe('relay');
    expect(canProbe(s, 999_999)).toBe(false);
    s = step(s, { t: 'probe_ok', rttMs: 5, fingerprint: FP }, 1);
    expect(s.mode).toBe('relay');
    expect(step(s, { t: 'enable' }, 2).disabled).toBe(false);
  });
});

describe('fingerprintOf', () => {
  it('IPv4 는 /24, IPv6 는 /64 — NetInfo 없이 네트워크 동일성 판정', () => {
    expect(fingerprintOf('192.168.0.31')).toBe('192.168.0.0/24');
    expect(fingerprintOf('192.168.0.99')).toBe(fingerprintOf('192.168.0.31'));
    expect(fingerprintOf('192.168.1.31')).not.toBe(fingerprintOf('192.168.0.31'));
    expect(fingerprintOf('fd00:1:2:3:4:5:6:7')).toBe('fd00:1:2:3::/64');
    expect(fingerprintOf('')).toBe('');
  });
});
