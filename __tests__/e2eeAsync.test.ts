/**
 * 양보형 봉인(aeadSealAsync·sealRpcAsync)과 고속 코어의 **바이트 동일성** 회귀.
 *  2026-11-24: 첨부 조각(1MB)을 동기 봉인하면 폰 JS 가 초 단위로 멈춰 입력칸 타이핑이 사라졌다 →
 *  Poly1305 를 BigInt 에서 32비트 구현으로, ChaCha 를 지역변수 전개로 바꾸고 양보형 경로를 더했다.
 *  와이어가 한 바이트라도 바뀌면 데몬이 못 연다 — node crypto 와 RFC 벡터로 고정한다.
 */
import crypto from 'crypto';
import core from '../src/services/e2ee/e2eeCore.js';
import * as C from '../src/services/e2ee/e2eeCore.js';
import proto from '../src/services/e2ee/e2eeProto.js';

const rnd = (n: number) => new Uint8Array(crypto.randomBytes(n));
const nodeSeal = (k: Uint8Array, n: Uint8Array, aad: Uint8Array, pt: Uint8Array) => {
  const c = crypto.createCipheriv('chacha20-poly1305', k, n, { authTagLength: 16 } as any) as any;
  c.setAAD(aad, { plaintextLength: pt.length });
  return new Uint8Array(Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]));
};
const z = () => Promise.resolve();

describe('e2ee 고속/양보형 봉인', () => {
  it('RFC 8439 §2.8.2 벡터', () => {
    const hex = (h: string) => new Uint8Array(Buffer.from(h, 'hex'));
    const out = core.aeadSeal(hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f'),
      hex('070000004041424344454647'), hex('50515253c0c1c2c3c4c5c6c7'),
      core.utf8("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."));
    expect(Buffer.from(out.slice(-16)).toString('hex')).toBe('1ae10b594f09e26a7e902ecbd0600691');
  });
  it('동기·양보형 봉인 = node crypto (경계 길이 전부)', async () => {
    for (const n of [0, 1, 15, 16, 17, 63, 64, 65, 4095, 4096, 4097, 70001]) {
      const k = rnd(32), nn = rnd(12), aad = rnd(n % 29), pt = rnd(n);
      const want = nodeSeal(k, nn, aad, pt);
      expect(Buffer.from(core.aeadSeal(k, nn, aad, pt)).equals(Buffer.from(want))).toBe(true);
      expect(Buffer.from(await C.aeadSealAsync(k, nn, aad, pt, z, 0)).equals(Buffer.from(want))).toBe(true);
      expect(Buffer.from(core.aeadOpen(k, nn, aad, want)!).equals(Buffer.from(pt))).toBe(true);
    }
  });
  it('utf8/base64 = Buffer (양보형 포함, 서로게이트 경계)', async () => {
    let s = '';
    for (let i = 0; i < 70000; i++) s += i % 16383 === 16382 ? '😀' : String.fromCharCode(i % 3 ? 97 + (i % 26) : 0xac00 + (i % 300));
    const head = s;   // 짝이 맞는 문자열 — Buffer 와 정확히 같아야 한다
    //  lone surrogate 는 Buffer 가 EF BF BD 로 바꾼다 — 우리 규약(옛 구현)은 3바이트 그대로라 양보형=동기형만 대조
    s += '\ud800 lone \udc00';
    const want = new Uint8Array(Buffer.from(head, 'utf8'));
    expect(Buffer.from(core.utf8(head)).equals(Buffer.from(head, 'utf8'))).toBe(true);
    expect(Buffer.from(await C.utf8Async(s, z, 0)).equals(Buffer.from(core.utf8(s)))).toBe(true);
    expect(core.fromUtf8(want)).toBe(head);
    const b = rnd(100003);
    const b64u = Buffer.from(b).toString('base64url');
    expect(core.b64uEnc(b)).toBe(b64u);
    expect(await C.b64uEncAsync(b, z, 0)).toBe(b64u);
    expect(Buffer.from(core.b64uDec(b64u)).equals(Buffer.from(b))).toBe(true);
  });
  it('sealRpcAsync = sealRpc (같은 봉투)', async () => {
    const mk = rnd(32), boot = rnd(8);
    const payload = { id: 'x', m: 'fs.write', p: { path: '/한글/a.png', content: 'Q'.repeat(300000), base64: true }, ts: 1 };
    const a = proto.sealRpc(mk, 3, 7, boot, 42, payload);
    const b = await proto.sealRpcAsync(mk, 3, 7, boot, 42, payload, z);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
