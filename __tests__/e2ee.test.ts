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
import fs from 'fs';
import path from 'path';
import core from '../src/services/e2ee/e2eeCore.js';
import proto from '../src/services/e2ee/e2eeProto.js';
import { envNoncePrefix, envNonceReady, nextEnvCounter, _resetEnvNonce } from '../src/services/e2ee/envNonce';
import { gateFor, hostLockLabel, mayFallbackFor, reduceEnroll, stateLabel } from '../src/services/e2ee/e2eeState';
import { hostE2eeEpoch, resetHostLocks, setHostE2eeEpoch } from '../src/services/e2ee/hostLock';

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

  it('안전코드(60비트)/지문/확인숫자 — 데몬·back 과 같은 OKM 오프셋에서 파생', () => {
    const a = core.x25519Keypair();
    // 정본 파생: okm = HKDF(ikX, "cpt-e2ee/v1/fp", userId, 16)
    //   safety = okm[0..8](60비트) · fingerprint6 = u32BE(okm[8]) % 1e6 · verifyCode4 = u32BE(okm[12]) % 1e4
    //  ⚠ 이 오프셋이 데몬(runner-core/e2ee.js fingerprint)·back(deviceTrustService fingerprintOf)과
    //   어긋나면 두 화면 숫자가 100% 불일치하고, pickCode 가 항상 서버 값을 택해(verified=false)
    //   "서버 위조 차단" 방어가 사라진다. 바이트 동치는 scripts/e2ee-conformance.mjs 가 실제 데몬 모듈로 검증.
    const okm = core.hkdf(a.pub, core.utf8('cpt-e2ee/v1/fp'), core.utf8('77'), 16);
    const u32 = (o: number) => ((okm[o] << 24) | (okm[o + 1] << 16) | (okm[o + 2] << 8) | okm[o + 3]) >>> 0;
    expect(proto.verifyCode4(a.pub, '77')).toBe(String(u32(12) % 10000).padStart(4, '0'));
    expect(proto.fingerprint6(a.pub, '77').replace(' ', '')).toBe(String(u32(8) % 1000000).padStart(6, '0'));

    const c1 = proto.verifyCode4(a.pub, '77');
    expect(c1).toMatch(/^\d{4}$/);
    expect(proto.verifyCode4(a.pub, '77')).toBe(c1);      // 두 기기가 같은 값을 본다
    expect(proto.verifyCode4(a.pub, '78')).not.toBe(c1);  // 계정이 다르면 다르다
    expect(proto.fingerprint6(a.pub, '77')).toMatch(/^\d{3} \d{3}$/);
    expect(proto.verifyDigits(a.pub, '77', 4)).toBe(c1);

    // 실제 MITM 대조 대상은 60비트 안전코드다(4자리 13비트는 1코어 1.3초에 충돌 키가 나온다).
    const s = proto.safetyCode(a.pub, '77');
    expect(s).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(proto.safetyCode(a.pub, '78')).not.toBe(s);
    expect(proto.safetyCode(core.x25519Keypair().pub, '77')).not.toBe(s);
    // ★ default export 에 실려 있어야 UI 가 쓸 수 있다(과거 누락 = 60비트 방어가 화면에 배선되지 않음)
    expect(typeof proto.safetyCode).toBe('function');

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

  // ★ 실기기 사고 회귀 고정: 접두사를 **모듈 평가 시점**에 만들면(과거 e2ee.ts top-level IIFE)
  //   CSPRNG 폴리필 require 전이라 Hermes 에서 throw → 0×8 고정 → 계정 전역 K_rpc 로 nonce 재사용
  //   (ct XOR = 평문 XOR + Poly1305 키 노출). 아래 4건이 그 경로를 구조적으로 막는다.
  it('봉투 nonce 접두사 — 첫 봉인 시점에 만든다(지연 생성 + 프로세스 내 1회)', () => {
    _resetEnvNonce();
    let calls = 0;
    core.setRandomSource((n: number) => { calls += 1; return new Uint8Array(nodeCrypto.randomBytes(n)); });
    try {
      expect(calls).toBe(0);            // 아무도 부르지 않았으면 난수를 쓰지 않는다(폴리필이 늦게 와도 안전)
      expect(envNoncePrefix().length).toBe(8);
      expect(calls).toBe(1);
      expect(hex(envNoncePrefix())).toBe(hex(envNoncePrefix()));
      expect(calls).toBe(1);            // 캐시 — 카운터만 증가한다
    } finally {
      core.setRandomSource((n: number) => new Uint8Array(nodeCrypto.randomBytes(n)));
      _resetEnvNonce();
    }
  });

  it('CSPRNG 가 없으면 0×8 로 폴백하지 않고 던진다(평문 폴백 > 0 nonce 봉인)', () => {
    _resetEnvNonce();
    try {
      core.setRandomSource(() => { throw new Error('E2EE_NO_CSPRNG'); });
      expect(() => envNoncePrefix()).toThrow();
      expect(envNonceReady()).toBe(false);
      // 0 만 돌려주는 난수원도 거부 — 폴백이 있던 시절의 실제 증상이 이 값이었다
      core.setRandomSource((n: number) => new Uint8Array(n));
      expect(() => envNoncePrefix()).toThrow();
      expect(envNonceReady()).toBe(false);
      // 폴리필이 배선되면 그 다음 왕복부터 바로 살아난다(영구 불능이 아니다)
      core.setRandomSource((n: number) => new Uint8Array(nodeCrypto.randomBytes(n)));
      expect(envNonceReady()).toBe(true);
    } finally {
      core.setRandomSource((n: number) => new Uint8Array(nodeCrypto.randomBytes(n)));
      _resetEnvNonce();
    }
  });

  it('같은 열쇠로 nonce 를 두 번 쓰지 않는다(카운터 증가 + 재시작마다 새 접두사)', () => {
    _resetEnvNonce();
    const mk = core.randomBytes(32);
    const e1 = proto.sealRpc(mk, 2, 12, envNoncePrefix(), nextEnvCounter(), { m: 'fs.read' });
    const e2 = proto.sealRpc(mk, 2, 12, envNoncePrefix(), nextEnvCounter(), { m: 'fs.read' });
    expect(e1.nonce).not.toBe(e2.nonce);
    expect(e1.nonce.startsWith('AAAAAAAAAAA')).toBe(false); // 0×8 접두사면 여기서 걸린다
    const first = hex(envNoncePrefix());
    _resetEnvNonce();                                       // 앱 재시작
    expect(hex(envNoncePrefix())).not.toBe(first);
    expect(nextEnvCounter()).toBe(1);
    _resetEnvNonce();
  });

  it('e2ee.ts 에 모듈 평가 시점 난수(top-level bootRand)가 다시 생기지 않는다', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/e2ee.ts'), 'utf8');
    // 과거 형태: `const bootRand = (() => { try { return core.randomBytes(8) } catch (_) { return new Uint8Array(8) } })()`
    expect(src).not.toMatch(/^const\s+\w+\s*=\s*\(\s*\(\s*\)\s*=>/m);
    expect(src).not.toContain('new Uint8Array(8)');
    expect(src).toContain('envNoncePrefix()');
  });

  // ★ 회귀 고정: 파생 기준(userRef)을 모를 때 ''(빈 문자열)로 숫자를 만들면, 한쪽만 기준을 받은
  //   과도기에 두 화면의 숫자가 어긋나고 pickCode 가 **서버 값으로 폴백**한다 → 사람이 대조하는 값이
  //   서버가 준 값이 되어 위조 차단(승인 UX 의 존재 이유)이 통째로 무효가 된다. 그래서 기준 미상 =
  //   아무 숫자도 그리지 않는다. PC(codingpt_pc/src/js/e2ee.js fpRef)와 **같은 규칙**이어야 한다.
  it('파생 기준 미상이면 안전코드·지문을 만들지 않는다(빈 문자열 파생 금지)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/e2ee.ts'), 'utf8');
    // 기준 미상은 null 로 표현한다(과거: `return userRef || userId || ''`)
    expect(src).toMatch(/function fpRef\(\)\s*:\s*string \| null/);
    expect(src).not.toMatch(/function fpRef\(\)[^\n]*\|\|\s*''/);
    // 파생 3함수에 fpRef() 를 **가드 없이 직접** 넘기는 호출이 남아 있으면 안 된다.
    for (const fn of ['safetyCode', 'fingerprint6', 'verifyCode4']) {
      expect(src).not.toContain(`proto.${fn}(core.b64uDec(file.ikX.pub), fpRef())`);
      expect(src).not.toContain(`proto.${fn}(ikX, fpRef())`);
    }
    // PC 와 같은 규칙이라는 사실을 코드에 남겨 한쪽만 고치는 것을 막는다.
    expect(src).toContain('codingpt_pc/src/js/e2ee.js');
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

  // ★ 잠금 사고 회귀 고정: 열쇠 없는 PC 데몬(§2.6 2b 미구현 = 상시 상태)은
  //   openRpc 가 E2EE_NO_KEY → 데몬 control.js 가 E2EE_OPEN_FAILED 로 뭉갬 → back SEALED_UNSUPPORTED
  //   집합에 없어 **502**. preferred 에서 이걸 폴백 불가로 보면 fs.* 가 sealed 단계에서 throw 되어
  //   뒤의 평문 REST 라인에 못 가고 IDE 트리·파일 열기·800ms 자동저장이 붉은 오류로 죽는다.
  it('preferred 는 봉투 계층 실패(502 계열 포함)에서 반드시 평문으로 계속 간다', () => {
    for (const code of ['E2EE_OPEN_FAILED', 'E2EE_SEAL_FAILED', 'E2EE_HOST_MISMATCH', 'E2EE_REPLAY', 'E2EE_NO_KEY']) {
      expect(mayFallbackFor('preferred', code, 502)).toBe(true);
      expect(mayFallbackFor('required', code, 502)).toBe(false); // required 는 여전히 금지
    }
    expect(mayFallbackFor('preferred', 'E2EE_UNSUPPORTED', 501)).toBe(true);
    expect(mayFallbackFor('preferred', 'BAD_ENVELOPE', 400)).toBe(true);
    expect(mayFallbackFor('preferred', 'DAEMON_OFFLINE', 409)).toBe(true);
    expect(mayFallbackFor('preferred', 'UNSUPPORTED', 0)).toBe(true);   // 난수 없음/네트워크
    expect(mayFallbackFor('preferred', undefined, 404)).toBe(true);
    // 200 = 봉투가 왕복해 호스트가 실제로 처리했다 → 폴백하면 같은 변형을 평문으로 이중 실행한다
    expect(mayFallbackFor('preferred', 'ENOENT', 200)).toBe(false);
    expect(mayFallbackFor('preferred', 'DECRYPT_FAILED', 200)).toBe(true); // 회전 직후 = 호스트 처리 결과 아님
  });

  it('설정 라벨(3플랫폼 동일 정보 구조) — 자기 열쇠를 "켜짐" 이라고 쓰지 않는다(거짓 자물쇠 금지)', () => {
    expect(stateLabel({ state: 'trusted', policy: 'preferred', ready: true })).toEqual({ text: '이 기기 준비됨', tone: 'on' });
    expect(stateLabel({ state: 'pending', policy: 'preferred', ready: false })).toEqual({ text: '승인 대기', tone: 'wait' });
    expect(stateLabel({ state: 'trusted', policy: 'off', ready: false })).toEqual({ text: '꺼짐', tone: 'off' });
    expect(stateLabel({ state: 'unsupported', policy: 'preferred', ready: false })).toEqual({ text: '미지원', tone: 'off' });
  });

  // 실제 트래픽 자물쇠는 **호스트별**이다 — back 이 이미 팬아웃하는 runner_status.e2eeEpoch 가 근거.
  it('호스트별 자물쇠 — 열쇠 없는 PC 는 평문임을 그대로 표시한다', () => {
    expect(hostLockLabel(true, 3)).toEqual({ text: '암호화됨', tone: 'on' });
    expect(hostLockLabel(true, 0)).toEqual({ text: '이 PC 는 평문(열쇠 없음)', tone: 'off' });
    expect(hostLockLabel(true, undefined)).toEqual({ text: '확인 중', tone: 'wait' }); // 구 back = 모름
    expect(hostLockLabel(false, 3)).toEqual({ text: '평문', tone: 'off' });            // 이 기기에 열쇠 없음
  });

  // 회전 직후 데몬은 최대 15분(TRUSTED_MS) 옛 epoch 를 신고한다 → 그동안 봉투는 409 로 거절되고
  // 트래픽은 평문 폴백인데, epoch 를 대조하지 않으면 배지가 초록으로 남는다(거짓 자물쇠).
  it('호스트별 자물쇠 — 세대(epoch) 가 어긋나면 "암호화됨" 을 그리지 않는다', () => {
    expect(hostLockLabel(true, 2, 2)).toEqual({ text: '암호화됨', tone: 'on' });        // 교집합 성립
    expect(hostLockLabel(true, 1, 2)).toEqual({ text: '확인 중', tone: 'wait' });       // 호스트가 뒤처짐
    expect(hostLockLabel(true, 3, 2)).toEqual({ text: '확인 중', tone: 'wait' });       // 내가 뒤처짐
    expect(hostLockLabel(true, 0, 2)).toEqual({ text: '이 PC 는 평문(열쇠 없음)', tone: 'off' });
    expect(hostLockLabel(true, 2, 0)).toEqual({ text: '암호화됨', tone: 'on' });        // 내 epoch 미지 = 대조 생략
    expect(hostLockLabel(true, 2)).toEqual({ text: '암호화됨', tone: 'on' });           // 구 호출부(2인자) 호환
  });

  it('hostLock 스토어 — runner_status 반영/오프라인 삭제/전량 폐기', () => {
    resetHostLocks();
    expect(setHostE2eeEpoch(12, 4)).toBe(true);
    expect(hostE2eeEpoch(12)).toBe(4);
    expect(setHostE2eeEpoch(12, 4)).toBe(false);      // 변화 없으면 emit 도 없다
    expect(setHostE2eeEpoch(12, 0)).toBe(true);        // 열쇠 폐기(회전 실패 등)
    expect(hostE2eeEpoch(12)).toBe(0);
    expect(setHostE2eeEpoch(12, null)).toBe(true);     // 오프라인 → 삭제 = '모름'
    expect(hostE2eeEpoch(12)).toBeUndefined();
    expect(hostE2eeEpoch(null)).toBeUndefined();
    setHostE2eeEpoch(99, 1);
    expect(resetHostLocks()).toBe(true);
    expect(hostE2eeEpoch(99)).toBeUndefined();
  });
});
