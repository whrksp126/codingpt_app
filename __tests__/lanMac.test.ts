// LAN 직결 challenge-response MAC 의 **와이어 호환성** 고정 테스트.
//
// 왜 필요한가: 모바일은 순수 JS(e2eeCore.hmacSha256)로, 데몬은 node:crypto 로 같은 MAC 을 만든다.
//  한쪽이라도 재료 문자열/인코딩이 틀리면 증상은 "인증 실패 → 조용히 릴레이" 뿐이라 **성능 이득이
//  사라진 것을 아무도 눈치채지 못한다**(조용한 폴백의 대가). 그래서 계약을 테스트로 못박는다.
//
// 계약(설계 §2.3 + codingpt_daemon/packages/runner-core/lan.js macFor/srvMacFor)
//   mac  = base64( HMAC-SHA256(secret, "<grantId>|<nonceB64>|<clientKey>") )      뷰어 → 호스트
//   smac = base64( HMAC-SHA256(secret, "srv|<grantId>|<nonceB64>|<clientKey>") )  호스트 → 뷰어(상호 인증)
//   · secret 은 서버가 준 base64 문자열을 **디코드한 원시 바이트**가 키다.
//   · nonce 는 **받은 base64 문자열 그대로** 재료에 넣는다(디코드하지 않는다 — 인코딩 해석 차이 제거).
//   · 출력은 표준 base64(패딩 포함).
import crypto from 'crypto';
import { hmacSha256, utf8 } from '../src/services/e2ee/e2eeCore';

// 모바일 구현(lanLink.ts 와 동일한 조립)
const macJs = (secretB64: string, grantId: string, nonceB64: string, clientKey: string) =>
  Buffer.from(hmacSha256(new Uint8Array(Buffer.from(secretB64, 'base64')), utf8(`${grantId}|${nonceB64}|${clientKey}`))).toString('base64');
const srvMacJs = (secretB64: string, grantId: string, nonceB64: string, clientKey: string) =>
  Buffer.from(hmacSha256(new Uint8Array(Buffer.from(secretB64, 'base64')), utf8(`srv|${grantId}|${nonceB64}|${clientKey}`))).toString('base64');

// 데몬 구현(runner-core/lan.js 원문 그대로)
const macNode = (secretB64: string, grantId: string, nonceB64: string, clientKey: string) =>
  crypto.createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`${grantId}|${nonceB64}|${clientKey}`, 'utf8').digest('base64');
const srvMacNode = (secretB64: string, grantId: string, nonceB64: string, clientKey: string) =>
  crypto.createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`srv|${grantId}|${nonceB64}|${clientKey}`, 'utf8').digest('base64');

describe('cpt-lan/1 MAC — 모바일(순수 JS) ↔ 데몬(node:crypto) 바이트 일치', () => {
  const cases: Array<[string, string, string, string]> = [
    // secret(b64 32B), grantId, nonce(b64 16B), clientKey
    [Buffer.alloc(32, 7).toString('base64'), 'lg-0123456789abcdef01234567', Buffer.alloc(16, 9).toString('base64'), 'ctl12345ab'],
    [crypto.randomBytes(32).toString('base64'), 'lg-deadbeefdeadbeefdeadbeef', crypto.randomBytes(16).toString('base64'), 'pc-abc123'],
    // 한글/기호가 섞인 clientKey — utf8 인코딩 경로 검증(우리 utf8() 자체 구현 회귀 방지)
    [crypto.randomBytes(32).toString('base64'), 'lg-aaaabbbbccccddddeeeeffff', crypto.randomBytes(16).toString('base64'), '내PC-키+/='],
  ];

  it.each(cases)('mac 일치 (clientKey=%s→)', (secret, grantId, nonce, clientKey) => {
    expect(macJs(secret, grantId, nonce, clientKey)).toBe(macNode(secret, grantId, nonce, clientKey));
  });

  it.each(cases)('smac(상호 인증) 일치', (secret, grantId, nonce, clientKey) => {
    expect(srvMacJs(secret, grantId, nonce, clientKey)).toBe(srvMacNode(secret, grantId, nonce, clientKey));
  });

  it('mac 과 smac 은 서로 다르다 — 사칭 호스트가 뷰어의 mac 을 되돌려 통과할 수 없어야 한다', () => {
    const [s, g, n, c] = cases[0];
    expect(macJs(s, g, n, c)).not.toBe(srvMacJs(s, g, n, c));
  });

  it('재료 한 글자만 달라도 MAC 이 달라진다(재생·교차 grant 재사용 차단)', () => {
    const [s, g, n, c] = cases[0];
    expect(macJs(s, g, n, c)).not.toBe(macJs(s, g + 'x', n, c));
    expect(macJs(s, g, n, c)).not.toBe(macJs(s, g, n, c + 'x'));
    expect(macJs(s, g, n, c)).not.toBe(macJs(s, g, Buffer.alloc(16, 1).toString('base64'), c));
  });

  it('secret 은 base64 를 디코드한 원시 바이트가 키다(문자열을 그대로 키로 쓰면 안 된다)', () => {
    const [s, g, n, c] = cases[0];
    const wrong = crypto.createHmac('sha256', s).update(`${g}|${n}|${c}`, 'utf8').digest('base64');
    expect(macJs(s, g, n, c)).not.toBe(wrong);
  });
});

// 프레임 헤더 인코딩 — LEN 은 "TYPE+CH+PAYLOAD 길이"(자기 4바이트 제외)라는 규약을 못박는다.
//  이 정의가 어긋나면 첫 프레임부터 파서가 오프셋을 잃고 소켓이 프로토콜 위반으로 파괴된다.
describe('cpt-lan/1 프레임 헤더', () => {
  const frame = (type: number, ch: number, payload: Buffer) => {
    const out = Buffer.allocUnsafe(4 + 3 + payload.length);
    out.writeUInt32BE(3 + payload.length, 0);
    out.writeUInt8(type, 4);
    out.writeUInt16BE(ch, 5);
    payload.copy(out, 7);
    return out;
  };
  it('LEN = 3 + payload, 총 길이 = 4 + LEN', () => {
    const f = frame(0x02, 1, Buffer.from('hello'));
    expect(f.readUInt32BE(0)).toBe(3 + 5);
    expect(f.length).toBe(4 + 3 + 5);
    expect(f.readUInt8(4)).toBe(0x02);
    expect(f.readUInt16BE(5)).toBe(1);
    expect(f.subarray(7).toString()).toBe('hello');
  });
  it('빈 payload(CLOSE/PING)도 LEN=3 으로 유효하다', () => {
    expect(frame(0x04, 9, Buffer.alloc(0)).readUInt32BE(0)).toBe(3);
  });
});
