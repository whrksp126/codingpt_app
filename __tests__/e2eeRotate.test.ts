/**
 * 세대 회전(rotate) 자가복구 회귀 — "화면은 암호화됨, 실제 트래픽은 평문" 을 막는다.
 *
 * 왜 이 파일이 따로 있는가:
 *  e2ee.test.ts 는 **순수 로직**만 다룬다(네트워크·저장소 없음). 그런데 2026-07-25 교차검증에서 나온
 *  결함은 순수 함수가 아니라 **서비스 모듈의 배선**이었다:
 *   ① back 이 팬아웃하는 `device_approval_event kind:'rotated'` 를 앱이 무시한다(핸들러 0건).
 *   ② `sealedRpc` 가 409 `E2EE_EPOCH_MISMATCH` 에서 `refresh()` 를 부르지 않는다
 *      (refresh 는 200+DECRYPT_FAILED 분기에만 있었다).
 *  둘 다 없으면 앱은 낡은 epoch 로 계속 봉인하고 → 409 → `mayFallbackFor`=true → **평문 REST**를
 *  포그라운드에 머무는 동안 무한 반복한다(자가복구 트리거가 앱 재활성화뿐이었다).
 *  그래서 여기서는 keychain/AsyncStorage/fetch 를 메모리로 갈아끼워 **실제 e2ee.ts 를 그대로** 돌린다.
 */
import nodeCrypto from 'crypto';
import core from '../src/services/e2ee/e2eeCore.js';
import proto from '../src/services/e2ee/e2eeProto.js';

const KC: Record<string, string> = {};
const AS: Record<string, string> = {};

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'afu' },
  setGenericPassword: async (_u: string, p: string, o: any) => { KC[o.service] = p; return true; },
  getGenericPassword: async (o: any) => (KC[o.service] ? { username: 'e2ee', password: KC[o.service] } : false),
  resetGenericPassword: async (o: any) => { delete KC[o.service]; return true; },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (k in AS ? AS[k] : null),
    setItem: async (k: string, v: string) => { AS[k] = v; },
    removeItem: async (k: string) => { delete AS[k]; },
  },
}));
jest.mock('../src/utils/service', () => ({ BACK_URL: 'http://test.local' }));
jest.mock('../src/utils/api', () => ({ refreshAccessToken: async () => null }));

core.setRandomSource((n: number) => new Uint8Array(nodeCrypto.randomBytes(n)));

const idX = core.x25519Keypair();
const idEd = core.ed25519Keypair();
const MK1 = new Uint8Array(nodeCrypto.randomBytes(32));
const MK2 = new Uint8Array(nodeCrypto.randomBytes(32));

/** 이 기기 앞으로 봉인된 grant(승인자 서명 없음 = 사후 검증 생략 경로). */
const grantFor = (epoch: number, mk: Uint8Array) => ({
  epoch,
  sealed: core.b64uEnc(proto.sealGrant(mk, epoch, idX.pub)),
});

type Call = { path: string; method: string; body: any };
let calls: Call[] = [];
/** 다음 enroll 응답 — 회전 전/후를 테스트가 갈아끼운다. */
let enrollBody: any = { state: 'trusted', epoch: 1 };
/** 다음 /api/daemon/rpc 응답. */
let rpcReply: { status: number; body: any } = { status: 200, body: {} };

beforeAll(() => {
  KC['codingpt.e2ee'] = JSON.stringify({
    v: 1, suite: core.SUITE, userId: 'u1',
    ikX: { pub: core.b64uEnc(idX.pub), priv: core.b64uEnc(idX.priv) },
    ikEd: { pub: core.b64uEnc(idEd.pub), priv: core.b64uEnc(core.concat(idEd.seed, idEd.pub)) },
    epoch: 1, keys: { 1: core.b64uEnc(MK1) },
    policy: 'preferred', scope: 'rpc', recoverySet: false,
    updatedAt: new Date().toISOString(),
  });
  (global as any).fetch = async (url: string, init: any) => {
    const path = String(url).replace('http://test.local', '');
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method: init?.method || 'GET', body });
    if (path === '/api/daemon/e2ee/enroll') return jsonRes(200, enrollBody);
    if (path === '/api/daemon/rpc') return jsonRes(rpcReply.status, rpcReply.body);
    if (path === '/api/daemon/e2ee/keyring') return jsonRes(200, { devices: [] });
    return jsonRes(404, { message: 'not found' });
  };
});

const jsonRes = (status: number, body: any) => ({ status, json: async () => body }) as any;
/** void 로 발사된 비동기(refresh) 가 실제로 왕복할 시간을 준다. */
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const enrollCount = () => calls.filter((c) => c.path === '/api/daemon/e2ee/enroll').length;

describe('세대 회전 자가복구(거짓 자물쇠 방지)', () => {
  let svc: any;

  beforeAll(async () => {
    // ⚠ 지연 require — jest.mock 팩토리가 KC/AS 클로저를 참조하므로 모듈 평가가 이 시점 이후여야 한다.
    svc = require('../src/services/e2ee').default;
    await svc.init('u1');
    await flush();
  });

  beforeEach(() => { calls = []; });

  it('전제: 열쇠가 있고 봉인 가능하다', () => {
    const st = svc.getStatus();
    expect(st.state).toBe('trusted');
    expect(st.epoch).toBe(1);
    expect(svc.canSeal()).toBe(true);
  });

  it("sealedRpc 가 409 E2EE_EPOCH_MISMATCH 를 받으면 즉시 keyring 을 갱신한다(back 의 '상태가 바뀌면 낫는다' 를 수행)", async () => {
    rpcReply = { status: 409, body: { success: false, message: '세대가 다릅니다.', detail: { code: 'E2EE_EPOCH_MISMATCH' } } };
    enrollBody = { state: 'trusted', epoch: 2, grant: grantFor(2, MK2) };
    let code = '';
    try { await svc.sealedRpc('fs.read', { path: 'a.ts' }, { hostDeviceId: 12 }); }
    catch (e: any) { code = e?.code; }
    expect(code).toBe('E2EE_EPOCH_MISMATCH');
    expect(svc.mayFallback({ code, status: 409 })).toBe(true); // 폴백 규칙은 그대로(평문으로 계속 간다)
    await flush();
    expect(enrollCount()).toBe(1);            // ← 회전 감지 = 낡은 epoch 로 무한 재시도하지 않는다
    expect(svc.getStatus().epoch).toBe(2);    // 새 세대 열쇠를 채택했다
  });

  it('연속 실패에서 refresh 를 폭주시키지 않는다(왕복 1회로 억제)', async () => {
    for (let i = 0; i < 4; i++) {
      try { await svc.sealedRpc('fs.read', { path: 'a.ts' }, { hostDeviceId: 12 }); } catch (_) { /* 예상된 실패 */ }
    }
    await flush();
    expect(enrollCount()).toBe(0); // 직전 테스트의 refresh 로 이미 갱신됨 → 억제 창 안에서는 재발사 없음
  });

  it("device_approval_event kind:'rotated' 를 받으면 refresh 한다(back 은 이미 팬아웃한다)", async () => {
    enrollBody = { state: 'trusted', epoch: 3, grant: grantFor(3, MK2) };
    svc.dispatchDeviceApprovalEvent({ kind: 'rotated', epoch: 3, revokedKeyIds: [7] });
    await flush();
    expect(enrollCount()).toBe(1);
    expect(svc.getStatus().epoch).toBe(3);
  });

  it("kind:'policy' / 'bootstrapped' 도 계정 상태 변경이므로 refresh 한다", async () => {
    enrollBody = { state: 'trusted', epoch: 3 };
    svc.dispatchDeviceApprovalEvent({ kind: 'policy', policy: 'preferred', epoch: 3 });
    await flush();
    expect(enrollCount()).toBe(1);
    calls = [];
    svc.dispatchDeviceApprovalEvent({ kind: 'bootstrapped', epoch: 3, keyId: 5 });
    await flush();
    expect(enrollCount()).toBe(1);
  });

  it('새 세대 열쇠를 채택하면 UNSUPPORTED 네거티브 캐시(10분)를 만료시킨다', async () => {
    rpcReply = { status: 502, body: { success: false, detail: { code: 'E2EE_OPEN_FAILED' } } };
    try { await svc.sealedRpc('fs.read', { path: 'a.ts' }, { hostDeviceId: 12 }); } catch (_) { /* 예상된 실패 */ }
    expect(svc.rpcAvailable()).toBe(false);      // 캐시가 걸렸다(왕복 절감 — 그동안은 평문)
    enrollBody = { state: 'trusted', epoch: 4, grant: grantFor(4, MK2) };
    svc.dispatchDeviceApprovalEvent({ kind: 'rotated', epoch: 4 });
    await flush();
    expect(svc.getStatus().epoch).toBe(4);
    expect(svc.rpcAvailable()).toBe(true);       // 갱신했으면 즉시 다시 봉인을 시도해야 한다
  });

  it("모르는 kind 는 왕복 0(구·신 서버 혼재에서 조용히 안전)", async () => {
    svc.dispatchDeviceApprovalEvent({ kind: 'something-new' } as any);
    await flush();
    expect(enrollCount()).toBe(0);
  });
});
