// envNonce.ts — 봉투 RPC nonce 의 소유자(8B 부팅 난수 + 4B 카운터).
//
// 왜 별 모듈인가(사고 재발 방지):
//  이 값은 원래 e2ee.ts 의 **모듈 평가 시점** top-level IIFE 였다
//    `const bootRand = (()=>{ try { return core.randomBytes(8) } catch(_) { return new Uint8Array(8) } })()`
//  그런데 CSPRNG 폴리필(react-native-get-random-values)은 `init()` 안에서야 require 되고, RN Hermes 에는
//  globalThis.crypto 가 없다 → 실기기에서는 모듈이 평가되는 순간 randomBytes 가 E2EE_NO_CSPRNG 로 던지고
//  **접두사가 0×8 로 프로세스 수명 내내 고정**됐다. 봉투 키 K_rpc 는 MK 에서만 파생돼 계정 전역이므로
//  이것은 곧 **같은 키로 같은 nonce 재사용**이다(모든 기기·모든 재시작이 nonce 0…01 부터 시작).
//  ChaCha20-Poly1305 에서 nonce 재사용은 ct XOR = 평문 XOR(키스트림 복원) + Poly1305 one-time key 노출
//  (위조 가능)이라 **평문보다 위험**하다. 릴레이하는 서버는 두 암호문을 모두 본다.
//
// 그래서 규칙 3개를 여기서 코드로 고정한다:
//  ① 지연 생성 — 첫 봉인 시점(=폴리필 require 이후)에 만든다. 모듈 import 만으로는 난수를 쓰지 않는다.
//  ② 실패 시 **던진다** — 0×8 폴백 금지. 봉인 불가는 평문 폴백(policy=preferred 의 정상 경로)으로
//    흡수되지만, 0 nonce 로 봉인하면 조용히 암호가 무력화된다.
//  ③ 접두사는 프로세스 1회 · 카운터는 부팅당 2^32(데몬 runner-core/e2ee.js envNonce 와 같은 분할이라
//    호스트측 리플레이 창 집계가 맞는다).
import core from './e2eeCore.js';

let prefix: Uint8Array | null = null;
let counter = 0;

/**
 * 봉투 nonce 의 8바이트 접두사. 첫 호출에서 CSPRNG 로 만들고 프로세스 내내 재사용한다.
 * @throws Error('E2EE_NO_CSPRNG') 난수원이 없을 때 — 호출부는 봉인을 포기하고 평문으로 폴백한다.
 */
export function envNoncePrefix(): Uint8Array {
  if (!prefix) {
    const p = core.randomBytes(8); // 실패는 그대로 전파(0×8 폴백 금지)
    if (!p || p.length !== 8) throw new Error('E2EE_NO_CSPRNG');
    let zero = 0;
    for (let i = 0; i < 8; i++) zero |= p[i];
    if (zero === 0) throw new Error('E2EE_NO_CSPRNG'); // 난수원이 0 만 주는 가짜 구현 방어
    prefix = p;
  }
  return prefix;
}

/** 다음 카운터(1 부터). 접두사×카운터가 같은 조합은 이 프로세스에서 두 번 나오지 않는다. */
export function nextEnvCounter(): number {
  counter += 1;
  return counter;
}

/** 지금 봉인 가능한 난수원이 있는가(왕복 전 게이팅용 — 던지지 않는다). */
export function envNonceReady(): boolean {
  try { return !!envNoncePrefix(); } catch (_) { return false; }
}

/** 테스트 전용 — 접두사/카운터 초기화(프로세스 재시작 시뮬레이션). */
export function _resetEnvNonce(): void { prefix = null; counter = 0; }

export default { envNoncePrefix, nextEnvCounter, envNonceReady, _resetEnvNonce };
