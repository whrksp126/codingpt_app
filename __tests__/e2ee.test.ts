/**
 * E2EE(기능2) 순수 로직 회귀 — 실기기 없이도 깨지면 즉시 잡히는 부분만 다룬다.
 *
 *  ① 암호 코어 ↔ **node 내장 crypto 동치**(데몬 runner-core/e2ee.js 가 쓰는 것과 같은 알고리즘인지).
 *     이게 통과하지 못하면 데몬↔모바일 복호가 조용히 실패하고 전부 평문으로 떨어진다.
 *  ② 와이어 계약(설계 §2): grant 봉인/서명, RPC 봉투 AAD 바인딩, 알림 body, 복구 문구, 프레임.
 *  ③ 확인 숫자(4자리) 생성 — 사용자가 두 화면을 눈으로 대조하는 값.
 *  ④ 상태 전이 — "로그인만으로 되던 것이 승인 없이는 아무것도 안 되는" 회귀를 막는 게이팅 규칙.
 */
import nodeCrypto from 'crypto';
import core from '../src/services/e2ee/e2eeCore.js';
import proto from '../src/services/e2ee/e2eeProto.js';
import { gateFor, mayFallbackFor, reduceEnroll, stateLabel } from '../src/services/e2ee/e2eeState';

core.setRandomSource((n: number) => new Uint8Array(nodeCrypto.randomBytes(n)));

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const rawPriv = (k: any) => new Uint8Array(k.export({ type: 'pkcs8', format: 'der' }).subarray(16));
const rawPub = (k: any) => new Uint8Array(k.export({ type: 'spki', format: 'der' }).subarray(12));

describe('e2eeCore ↔ node crypto 동치', () => {
  it('sha256 / sha512 / hmac / hkdf', () => {
    for (const s of ['', 'abc', 'ㅎ한글 テスト', 'x'.repeat(500)]) {
      expect(hex(core.sha256(core.utf8(s)))).toBe(nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex'));
      expect(hex(core.sha512(core.utf8(s)))).toBe(nodeCrypto.createHash('sha512').update(s, 'utf8').digest('hex'));
    }
    const k = nodeCrypto.randomBytes(40);
    const m = nodeCrypto.randomBytes(77);
    expect(hex(core.hmacSha256(new Uint8Array(k), new Uint8Array(m)))).toBe(nodeCrypto.createHmac('sha256', k).update(m).digest('hex'));
    const salt = nodeCrypto.randomBytes(32);
    const info = core.utf8('cpt-e2ee/v1/rpc');
    expect(hex(core.hkdf(new Uint8Array(k), new Uint8Array(salt), info, 112)))
      .toBe(Buffer.from(nodeCrypto.hkdfSync('sha256', k, salt, Buffer.from(info), 112)).toString('hex'));
  });

  it('ChaCha20-Poly1305 봉인/개봉이 node 와 바이트 일치', () => {
    for (const len of [0, 1, 64, 65, 500]) {
      const key = nodeCrypto.randomBytes(32);
      const nonce = nodeCrypto.randomBytes(12);
      const aad = nodeCrypto.randomBytes(23);
      const pt = nodeCrypto.randomBytes(len);
      const c = nodeCrypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
      c.setAAD(aad, { plaintextLength: len });
      const expected = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
      const mine = core.aeadSeal(new Uint8Array(key), new Uint8Array(nonce), new Uint8Array(aad), new Uint8Array(pt));
      expect(hex(mine)).toBe(expected.toString('hex'));
      expect(hex(core.aeadOpen(new Uint8Array(key), new Uint8Array(nonce), new Uint8Array(aad), mine)!)).toBe(pt.toString('hex'));
    }
  });

  it('AEAD 변조/AAD 불일치는 null (예외 아님 — 호출부가 폴백 판단)', () => {
    const key = core.randomBytes(32);
    const nonce = core.randomBytes(12);
    const sealed = core.aeadSeal(key, nonce, core.utf8('aad'), core.utf8('hello'));
    const bad = core.concat(sealed);
    bad[bad.length - 1] ^= 1;
    expect(core.aeadOpen(key, nonce, core.utf8('aad'), bad)).toBeNull();
    expect(core.aeadOpen(key, nonce, core.utf8('other'), sealed)).toBeNull();
  });

  it('X25519 — RFC 7748 벡터 + node ECDH 일치', () => {
    expect(hex(core.x25519(
      new Uint8Array(Buffer.from('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4', 'hex')),
      new Uint8Array(Buffer.from('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c', 'hex')),
    ))).toBe('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');
    const a = nodeCrypto.generateKeyPairSync('x25519');
    const b = nodeCrypto.generateKeyPairSync('x25519');
    expect(hex(core.x25519Public(rawPriv(a.privateKey)))).toBe(hex(rawPub(a.publicKey)));
    expect(hex(core.x25519(rawPriv(a.privateKey), rawPub(b.publicKey))))
      .toBe(nodeCrypto.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey }).toString('hex'));
  });

  it('Ed25519 — 서명 바이트가 node 와 동일하고 양방향 검증', () => {
    for (let i = 0; i < 3; i++) {
      const kp = nodeCrypto.generateKeyPairSync('ed25519');
      const seed = rawPriv(kp.privateKey);
      const pub = rawPub(kp.publicKey);
      expect(hex(core.ed25519Public(seed))).toBe(hex(pub));
      const msg = new Uint8Array(nodeCrypto.randomBytes(97));
      const mine = core.ed25519Sign(core.concat(seed, pub), msg);
      const theirs = new Uint8Array(nodeCrypto.sign(null, Buffer.from(msg), kp.privateKey));
      expect(hex(mine)).toBe(hex(theirs));
      expect(nodeCrypto.verify(null, Buffer.from(msg), kp.publicKey, Buffer.from(mine))).toBe(true);
      expect(core.ed25519Verify(pub, msg, theirs)).toBe(true);
      const bad = core.concat(theirs);
      bad[10] ^= 1;
      expect(core.ed25519Verify(pub, msg, bad)).toBe(false);
    }
  });

  it('키 재료를 오염시키지 않는다 (Buffer.slice 는 뷰라는 함정)', () => {
    const kp = nodeCrypto.generateKeyPairSync('ed25519');
    const pub = Buffer.from(rawPub(kp.publicKey));
    const before = pub.toString('hex');
    core.ed25519Verify(new Uint8Array(pub), core.utf8('x'), new Uint8Array(64));
    expect(pub.toString('hex')).toBe(before);
    const xa = nodeCrypto.generateKeyPairSync('x25519');
    const priv = Buffer.from(rawPriv(xa.privateKey));
    const pb = priv.toString('hex');
    core.x25519(new Uint8Array(priv), core.randomBytes(32));
    expect(priv.toString('hex')).toBe(pb);
  });
});

describe('와이어 계약 (설계 §2)', () => {
  const mkDevice = () => {
    const x = core.x25519Keypair();
    const ed = core.ed25519Keypair();
    return { x, ed, edPriv: core.concat(ed.seed, ed.pub) };
  };

  it('grant — 수신 기기만 열고, 승인자 서명이 검증된다', () => {
    const approver = mkDevice();
    const newDev = mkDevice();
    const other = mkDevice();
    const mk = core.randomBytes(32);
    const sealed = proto.sealGrant(mk, 2, newDev.x.pub);
    const sig = proto.signGrant(approver.edPriv, 2, newDev.x.pub, sealed);

    expect(hex(proto.openGrant(sealed, newDev.x.priv, newDev.x.pub, 2)!)).toBe(hex(mk));
    expect(proto.verifyGrantSig(approver.ed.pub, 2, newDev.x.pub, sealed, sig)).toBe(true);
    // 다른 기기 개인키로는 열리지 않는다
    expect(proto.openGrant(sealed, other.x.priv, other.x.pub, 2)).toBeNull();
    // epoch 을 바꿔치기하면 AAD 불일치로 실패
    expect(proto.openGrant(sealed, newDev.x.priv, newDev.x.pub, 3)).toBeNull();
    // 봉인문 변조 → 서명 불일치
    const t = core.concat(sealed);
    t[40] ^= 1;
    expect(proto.verifyGrantSig(approver.ed.pub, 2, newDev.x.pub, t, sig)).toBe(false);
    // 다른 사람의 서명은 통과하지 못한다(서버가 만든 봉인문 주입 차단)
    expect(proto.verifyGrantSig(other.ed.pub, 2, newDev.x.pub, sealed, sig)).toBe(false);
  });

  it('확인 숫자 = 4자리, ikX·userId 에서 결정적으로 파생(서버 위조 불가)', () => {
    const a = core.x25519Keypair();
    const c1 = proto.verifyCode4(a.pub, '77');
    expect(c1).toMatch(/^\d{4}$/);
    expect(proto.verifyCode4(a.pub, '77')).toBe(c1);      // 두 기기가 같은 값을 본다
    expect(proto.verifyCode4(a.pub, '78')).not.toBe(c1);  // 계정이 다르면 다르다
    expect(proto.fingerprint6(a.pub, '77')).toMatch(/^\d{3} \d{3}$/);
    // 6자리 지문의 뒤 4자리와 4자리 코드는 같은 4바이트에서 나온 서로 다른 mod 값이다
    expect(proto.verifyDigits(a.pub, '77', 4)).toBe(c1);
    // QR 핀은 ikX 에 결정적으로 묶인다
    expect(proto.qrPin(a.pub)).toBe(proto.qrPin(a.pub));
    expect(proto.qrPin(core.x25519Keypair().pub)).not.toBe(proto.qrPin(a.pub));
  });

  it('RPC 봉투 — 왕복 + hostDeviceId/epoch 바인딩', () => {
    const mk = core.randomBytes(32);
    const boot = core.randomBytes(4);
    const env = proto.sealRpc(mk, 2, 12, boot, 1, { id: 'x', m: 'fs.read', p: { path: 'a/b.ts' }, ts: 1 });
    expect(env.suite).toBe('cpt-e2ee/v1');
    expect(JSON.stringify(env)).not.toContain('fs.read'); // 서버는 메서드명조차 못 본다
    expect(JSON.stringify(env)).not.toContain('a/b.ts');
    expect(proto.openRpcRequest(mk, env, 12).m).toBe('fs.read');
    expect(proto.openRpcRequest(mk, env, 13)).toBeNull(); // 다른 PC 로 몰래 라우팅 → 실패
    const resp = proto.sealRpcResponse(mk, 2, 12, boot, 1, { ok: true, r: { content: 'hi' } });
    expect(proto.openRpcResponse(mk, resp, 12).r.content).toBe('hi');
    expect(proto.openRpcResponse(core.randomBytes(32), resp, 12)).toBeNull(); // 다른 열쇠
  });

  it('논스 = [부팅난수4][카운터8] — 카운터마다 달라진다', () => {
    const boot = core.randomBytes(4);
    const n1 = proto.makeNonce(boot, 1);
    const n2 = proto.makeNonce(boot, 2);
    expect(n1.length).toBe(12);
    expect(hex(n1.subarray(0, 4))).toBe(hex(boot));
    expect(hex(n1)).not.toBe(hex(n2));
    expect(hex(proto.makeNonce(boot, 1))).toBe(hex(n1));
  });

  it('알림 body — 봉인 접두사 인식, 열쇠 없으면 잠금(연결을 깨지 않는다)', () => {
    const mk = core.randomBytes(32);
    const body = proto.sealNotifBody(mk, 2, '작업이 끝났습니다: 3개 파일 수정');
    expect(proto.isSealedBody(body)).toBe(true);
    expect(body).not.toContain('작업이');
    expect(proto.openNotifBody(() => mk, body)).toBe('작업이 끝났습니다: 3개 파일 수정');
    expect(proto.openNotifBody(() => null, body)).toBeNull();                 // 열쇠 없음 → UI 가 🔒 표기
    expect(proto.openNotifBody(() => mk, '평문 알림입니다')).toBe('평문 알림입니다'); // 평문은 그대로
    // 옛 epoch 키 보존 규칙: keyForEpoch 가 epoch 별로 골라준다
    const old = core.randomBytes(32);
    const b1 = proto.sealNotifBody(old, 1, 'old');
    const pick = (e: number) => (e === 1 ? old : mk);
    expect(proto.openNotifBody(pick, b1)).toBe('old');
    expect(proto.openNotifBody(pick, body)).toBe('작업이 끝났습니다: 3개 파일 수정');
  });

  it('복구 코드 — 자기완결형(데몬 형식): 왕복 + 1글자 오타 거부', () => {
    const mk = core.randomBytes(32);
    const code = proto.recoveryCode(3, mk);
    // "CPT1-" + 5자 12그룹(Crockford, I·L·O·U 제외)
    expect(code).toMatch(/^CPT1(-[0-9A-HJKMNP-TV-Z]{5}){12}$/);
    const got = proto.parseRecoveryCode(code);
    expect(got && got.epoch).toBe(3);
    expect(got && hex(got.mk)).toBe(hex(mk));
    // 하이픈/소문자/공백 무시, 혼동문자(O→0, I/L→1, U→V) 흡수
    const loose = proto.parseRecoveryCode(code.toLowerCase().replace(/-/g, ' '));
    expect(loose && hex(loose.mk)).toBe(hex(mk));
    // 마지막 한 글자 오타도 거부(잉여 비트 정규성 검사 — 체크섬만으로는 통과하던 함정)
    const idx = code.length - 1;
    const other = code[idx] === '0' ? '1' : '0';
    expect(proto.parseRecoveryCode(code.slice(0, idx) + other)).toBeNull();
    // 중간 오타·길이 이상도 거부
    expect(proto.parseRecoveryCode(code.slice(0, 20))).toBeNull();
    expect(proto.parseRecoveryCode('CPT1-' + '00000-'.repeat(12).slice(0, -1))).toBeNull();
  });

  it('스트림 프레임 — 헤더 왕복 + 변조/다른 sid 거부', () => {
    const key = core.randomBytes(32);
    const sid = core.randomBytes(32);
    const payload = core.utf8('{"type":"resize","cols":118,"rows":48}');
    const f = proto.sealFrame(key, sid, proto.DIR_V2H, proto.KIND_CTRL, 0x1234abcd, 7, payload);
    const o = proto.openFrame(key, sid, f);
    expect(o.dir).toBe(proto.DIR_V2H);
    expect(o.kind).toBe(proto.KIND_CTRL);
    expect(o.connId).toBe(0x1234abcd);
    expect(o.counter).toBe(7);
    expect(core.fromUtf8(o.payload)).toContain('"cols":118');
    expect(proto.openFrame(key, core.randomBytes(32), f)).toBeNull(); // sid 불일치
    const t = core.concat(f);
    t[1] = proto.DIR_H2V; // 방향 혼동 시도
    expect(proto.openFrame(key, sid, t)).toBeNull();
  });

  it('세션 트랜스크립트 — 라우팅/에폭이 바뀌면 키가 달라진다(서버 몰래 라우팅 차단)', () => {
    const viewer = core.x25519Keypair();
    const host = core.x25519Keypair();
    const mk = core.randomBytes(32);
    const base = {
      purpose: 'pty', epoch: 2, hostDeviceId: 12, clientKey: 'abc',
      pubViewer: viewer.pub, pubHost: host.pub,
      nonceViewer: core.randomBytes(32), nonceHost: core.randomBytes(32),
      privSelf: viewer.priv, pubPeer: host.pub, mk,
      routingCanonical: proto.routingCanonical('pty', { cwd: 'proj/a', paneId: 'p1', win: 3 }),
    };
    const s1 = proto.deriveSession(base);
    // 호스트가 자기 개인키로 파생해도 같은 키에 도달한다(양쪽 동치)
    const s1h = proto.deriveSession({ ...base, privSelf: host.priv, pubPeer: viewer.pub });
    expect(hex(s1.kV2H)).toBe(hex(s1h.kV2H));
    expect(hex(s1.sid)).toBe(hex(s1h.sid));
    expect(hex(s1.confirm)).toBe(hex(s1h.confirm));
    const s2 = proto.deriveSession({ ...base, routingCanonical: proto.routingCanonical('pty', { cwd: 'proj/a', paneId: 'p1', win: 4 }) });
    expect(hex(s2.kV2H)).not.toBe(hex(s1.kV2H));
    const s3 = proto.deriveSession({ ...base, hostDeviceId: 13 });
    expect(hex(s3.sid)).not.toBe(hex(s1.sid));
    // MK 를 모르는 서버는 같은 ECDH 를 알아도 세션키를 만들 수 없다
    const s4 = proto.deriveSession({ ...base, mk: core.randomBytes(32) });
    expect(hex(s4.kV2H)).not.toBe(hex(s1.kV2H));
  });
});

describe('상태 전이 — 무마찰 불변식', () => {
  it('enroll 응답 분기', () => {
    expect(reduceEnroll({ state: 'bootstrap', epoch: 0 }, false)).toEqual({ state: 'bootstrap', action: 'bootstrap' });
    expect(reduceEnroll({ state: 'pending', enrollmentId: 'e_1' }, false)).toEqual({ state: 'pending', action: 'poll' });
    expect(reduceEnroll({ state: 'trusted', grant: { epoch: 2, sealed: 'x' } }, false)).toEqual({ state: 'trusted', action: 'adopt' });
    // 서버 이상(빈 응답)이 이미 켜져 있는 암호화를 끄면 안 된다
    expect(reduceEnroll({}, true)).toEqual({ state: 'trusted', action: 'none' });
    expect(reduceEnroll({}, false)).toEqual({ state: 'error', action: 'none' });
    // trusted 인데 grant 를 안 준 회전 중 상태
    expect(reduceEnroll({ state: 'trusted' }, false)).toEqual({ state: 'pending', action: 'poll' });
    expect(reduceEnroll({ state: 'trusted' }, true)).toEqual({ state: 'trusted', action: 'none' });
  });

  it('preferred(기본)에서는 승인 전에도 무엇도 막지 않는다', () => {
    for (const st of ['pending', 'unavailable', 'unsupported', 'error', 'bootstrap'] as const) {
      expect(gateFor({ policy: 'preferred', ready: false, state: st })).toBeNull();
    }
    expect(gateFor({ policy: 'off', ready: false, state: 'pending' })).toBeNull();
  });

  it('required 를 켠 경우에만 게이팅 + 사유 문구', () => {
    expect(gateFor({ policy: 'required', ready: true, state: 'trusted' })).toBeNull();
    expect(gateFor({ policy: 'required', ready: false, state: 'pending' })).toContain('승인 대기');
    expect(gateFor({ policy: 'required', ready: false, state: 'unsupported' })).toContain('지원하지 않');
  });

  it('required 는 평문 폴백을 금지(다운그레이드 공격 차단)', () => {
    expect(mayFallbackFor('preferred', 'UNSUPPORTED', 400)).toBe(true);
    expect(mayFallbackFor('preferred', 'RPC_ERROR', 200)).toBe(false); // 진짜 실패는 폴백 아님
    expect(mayFallbackFor('required', 'UNSUPPORTED', 404)).toBe(false);
    expect(mayFallbackFor('off', undefined, 404)).toBe(true);
  });

  it('설정 라벨(3플랫폼 동일 정보 구조)', () => {
    expect(stateLabel({ state: 'trusted', policy: 'preferred', ready: true })).toEqual({ text: '켜짐', tone: 'on' });
    expect(stateLabel({ state: 'pending', policy: 'preferred', ready: false })).toEqual({ text: '승인 대기', tone: 'wait' });
    expect(stateLabel({ state: 'trusted', policy: 'off', ready: false })).toEqual({ text: '꺼짐', tone: 'off' });
    expect(stateLabel({ state: 'unsupported', policy: 'preferred', ready: false })).toEqual({ text: '미지원', tone: 'off' });
  });
});
