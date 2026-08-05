// lanLink.ts — `cpt-lan/1` 프레임 코덱 + 핸드셰이크 + 채널 다중화(모바일 → PC 데몬 직결).
//
// 무엇을 해결하나: 같은 Wi-Fi 에 있는 폰↔PC 인데도 프리뷰 HTTP·파일 저장 바이트가 전부 홈서버를
//  왕복한다(RELAY_WS_URL 은 CF 엣지만 우회하고 서버 자체는 필수). LAN 직결은 그 왕복을 없앤다.
//  릴레이는 **삭제하지 않는다** — NAT/셀룰러/외부 접속에 필수인 영구 폴백이다.
//
// 왜 raw TCP 인가(반드시 지킬 제약 — 설계 §2.1)
//  · Android `network_security_config.xml` 은 base cleartext=false 이고 <domain> 에 CIDR 을 못 쓴다.
//    LAN IP 는 DHCP 로 변하므로 열거가 불가능 → RN WebSocket/fetch(OkHttp)로 ws://192.168.x.x 는
//    **릴리스 빌드에서 차단**된다. java.net.Socket 기반 react-native-tcp-socket 은 NSC 적용 대상이 아니다.
//  · RN TLS 는 `ca` 를 번들 에셋으로만 해석해 데몬의 런타임 자가서명 인증서를 핀닝할 수 없다.
//  → 따라서 전송은 raw TCP + 자체 프레이밍. 프레임 TYPE 이 기존 릴레이의 텍스트/바이너리 시맨틱을
//    1:1 승계하므로 pty 계약(binary=stdin, text=resize JSON)을 깨지 않는다.
//
// 보안 모델(요약 — 상세는 설계 §5.7)
//  · 인증: 서버가 발급한 단명 grant 를 **와이어에 흘리지 않고** challenge-response(HMAC)로 증명한다.
//    서버가 secret 을 알아도 같은 사설망 안에 들어오지 못하면 쓸 수 없다(네트워크 인접성이 2요소).
//  · 기밀성: LAN leg 는 평문이다. 그래서 1단계 scope 는 프리뷰(tcp)뿐이고 — 프리뷰는 원래 로컬 HTTP
//    평문이다 — fs/터미널 개방은 **서버 env(LAN_SCOPES)** 로만 열린다. 공유 WiFi 에서 파일 내용이
//    스니핑되는 위험을 클라이언트 코드가 아니라 서버 스위치로 통제한다.
//  · 데몬은 사설 대역 피어만 받고 UPnP 를 쓰지 않는다(WAN 노출 0).
//
// 절대 규율
//  · 실패는 **조용히** 릴레이로 강등한다. 어떤 에러도 사용자에게 표시하지 않고, '데몬이 연결'·
//    'DAEMON_OFFLINE' 문구를 만들지 않는다(모바일이 그 문구로 호스트 오프라인을 판정 — §5.3).
//  · 터미널(pty)은 이 파일이 채널을 열 수 있게 만들어 두었지만 **아직 아무도 호출하지 않는다**
//    (F3). 터미널 WS 경로/RECONNECT_MAX 카운터는 이 커밋에서 한 줄도 건드리지 않는다.
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import daemonService, { type LanEndpoint, type LanGrant } from './daemonService';
import {
  initialState, step, canProbe, shouldUseLan, badge, fingerprintOf, isPrivateHost,
  OBSERVE_MS, type PathState,
} from './lanPath';
// HMAC-SHA256 은 이미 리포에 있는 순수 JS 코어를 재사용한다(신규 의존성 0 — 설계 미결정 #6 해소).
//  ★ e2eeCore 는 PC(src/vendor/e2ee/e2ee-core.js)와 바이트 동일 사본이므로 양 플랫폼이 같은 MAC 을 만든다.
import { hmacSha256, utf8 } from './e2ee/e2eeCore';

type TcpConn = InstanceType<typeof TcpSocket.Socket>;

// ── 프레임 코덱 `cpt-lan/1` (설계 §2.2) ────────────────────────────────
//  프레임 = LEN(4,BE = TYPE+CH+PAYLOAD 길이) | TYPE(1) | CH(2,BE) | PAYLOAD
const T_CTRL = 0x01;   // CH=0, UTF-8 JSON (핸드셰이크·open·rpc)
const T_DATA = 0x02;   // CH=n, raw bytes (= WS 바이너리 등가)
const T_TEXT = 0x03;   // CH=n, UTF-8    (= WS 텍스트 등가: resize JSON)
const T_CLOSE = 0x04;  // CH=n
const T_PING = 0x05;   // CH=0
const T_PONG = 0x06;   // CH=0
const FRAME_MAX = 1024 * 1024; // 초과 = 프로토콜 위반 → 즉시 소켓 파괴

const HANDSHAKE_MS = 3_000;    // 핸드셰이크 데드라인(데몬도 같은 값으로 소켓을 버린다)
const CONNECT_MS = 2_500;      // TCP connect 타임아웃 — iOS 로컬 네트워크 권한 거부는 여기서 걸린다
const PING_MS = 25_000;
const PONG_MS = 10_000;
const OPEN_MS = 5_000;         // 채널 open 응답 대기
const RPC_MS = 15_000;
const IDLE_CLOSE_MS = 120_000; // 채널/RPC 없이 이만큼 지나면 소켓을 닫아 무선을 쉬게 한다
const PROBE_GAP_MS = 1_000;    // 승격용 연속 probe 간격
// 링크 1개가 프리뷰(tcp)와 fs(rpc) 를 함께 다중화하므로 grant 는 **한 번에 둘 다** 요청한다.
//  실제로 무엇이 열리는지는 서버(LAN_SCOPES) ∩ 데몬(CPT_LAN_SCOPE) 이 정한다 → 단계 개방이 서버 몫으로 유지되고,
//  링크가 tcp 로만 열려 fs 가 영원히 릴레이에 남는 부조화도 생기지 않는다.
//  pty(터미널)는 **일부러 요청하지 않는다** — F3. 요청하지 않으면 서버가 켜져 있어도 채널이 열리지 않는다.
//  emu(모바일 화면 영상)를 함께 요청한다 — 실제 개방은 서버(LAN_SCOPES)가 정하므로, 여기서
//   요청하는 것만으로 열리지는 않는다. 안 열리면 화면은 조용히 릴레이로 간다.
const WANT_SCOPES: LanScope[] = ['tcp', 'rpc', 'emu'];

function frame(type: number, ch: number, payload?: Buffer): Buffer {
  const body = payload && payload.length ? payload : Buffer.alloc(0);
  const out = Buffer.allocUnsafe(4 + 3 + body.length);
  out.writeUInt32BE(3 + body.length, 0);
  out.writeUInt8(type, 4);
  out.writeUInt16BE(ch, 5);
  if (body.length) body.copy(out, 7);
  return out;
}
const ctrl = (obj: unknown): Buffer => frame(T_CTRL, 0, Buffer.from(JSON.stringify(obj), 'utf8'));

// base64 — 와이어는 표준 base64(패딩 포함)를 쓴다. 디코드는 url-safe 도 관용적으로 받는다
//  (양 끝 구현이 갈릴 여지를 없애기 위한 의도적 관용 — 인코드는 한 가지로 고정).
const b64enc = (b: Uint8Array): string => Buffer.from(b).toString('base64');

export type LanScope = 'tcp' | 'rpc' | 'pty' | 'emu';

/** 프리뷰 포워딩 등에서 쓰는 raw TCP 채널(릴레이 WS 와 교체 가능한 최소 표면). */
export interface LanTcpChannel {
  write(data: Buffer): void;
  close(): void;
  readonly closed: boolean;
}

interface Channel {
  ch: number;
  /** isText = 데몬이 T_TEXT 로 보낸 프레임(화면 스트림의 meta 처럼 JSON 한 줄). */
  onData: (b: Buffer, isText: boolean) => void;
  onClose: () => void;
  closed: boolean;
}

interface Link {
  hostDeviceId: number;
  socket: TcpConn;
  endpoint: LanEndpoint;
  scopes: string[];
  grant: LanGrant;
  ready: boolean;
  dead: boolean;
  buf: Buffer;
  nextCh: number;
  channels: Map<number, Channel>;
  pendingOpen: Map<number, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>;
  pendingRpc: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  rpcSeq: number;
  lastUse: number;
  rxBytes: number;
  rxFrames: number;
  /** PONG 수신을 기다리는 콜백들(probe RTT 측정용). PONG 1개가 대기자 전부를 깨우고, 링크 사망은 false. */
  pongWaiters: Set<(ok: boolean) => void>;
  pingTimer?: ReturnType<typeof setInterval>;
  pongTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setInterval>;
  onCtrl?: (msg: Record<string, unknown>) => void; // 핸드셰이크 단계 전용 훅
}

// ── 모듈 상태 ─────────────────────────────────────────────────────────
const states = new Map<number, PathState>();   // hostDeviceId → 경로 상태
const links = new Map<number, Link>();         // hostDeviceId → 살아있는 링크
const linking = new Map<number, Promise<Link | null>>(); // 동시 요청 병합
const probing = new Set<number>();             // 승격 시도 중복 방지
const listeners = new Set<() => void>();
let enabled = true;                            // 사용자 설정(기본 ON, 마찰 0)
let enabledLoaded = false;

const LAN_ENABLED_KEY = 'cpt.lanDirect';

function notify(): void { listeners.forEach((f) => { try { f(); } catch (_) { /* noop */ } }); }

function stateOf(hostDeviceId: number): PathState {
  let s = states.get(hostDeviceId);
  if (!s) { s = initialState('', Date.now()); states.set(hostDeviceId, s); }
  return s;
}
// 상태 전이 + 변화 시에만 구독자 통지(사이드바 재랜더 억제).
function dispatch(hostDeviceId: number, ev: Parameters<typeof step>[1]): PathState {
  const prev = stateOf(hostDeviceId);
  const next = step(prev, ev, Date.now());
  states.set(hostDeviceId, next);
  if (next.mode !== prev.mode) {
    console.log(`[lan] host=${hostDeviceId} 경로 ${prev.mode} → ${next.mode} (${ev.t})`);
    notify();
  }
  return next;
}

/** 사이드바 배지용 — 'lan' 일 때만 '직결', 그 외엔 null(정상을 시끄럽게 하지 않는다). */
export function badgeFor(hostDeviceId: number | null | undefined): string | null {
  if (hostDeviceId == null) return null;
  const s = states.get(hostDeviceId);
  return s ? badge(s) : null;
}
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── 사용자 설정(기본 ON) ───────────────────────────────────────────────
export async function loadEnabled(): Promise<boolean> {
  if (enabledLoaded) return enabled;
  try { const v = await AsyncStorage.getItem(LAN_ENABLED_KEY); enabled = v !== '0'; } catch (_) { enabled = true; }
  enabledLoaded = true;
  return enabled;
}
export function isEnabled(): boolean { return enabled; }
export async function setEnabled(on: boolean): Promise<void> {
  enabled = on;
  enabledLoaded = true;
  try { await AsyncStorage.setItem(LAN_ENABLED_KEY, on ? '1' : '0'); } catch (_) { /* noop */ }
  for (const id of [...states.keys()]) dispatch(id, on ? { t: 'enable' } : { t: 'disable' });
  if (!on) for (const id of [...links.keys()]) killLink(links.get(id)!, 'disabled');
  notify();
}

// ── 링크 수명 ─────────────────────────────────────────────────────────
function killLink(link: Link, why: string): void {
  if (link.dead) return;
  link.dead = true;
  link.ready = false;
  if (link.pingTimer) clearInterval(link.pingTimer);
  if (link.pongTimer) clearTimeout(link.pongTimer);
  if (link.idleTimer) clearInterval(link.idleTimer);
  for (const [, p] of link.pendingOpen) { clearTimeout(p.timer); p.resolve(false); }
  link.pendingOpen.clear();
  for (const [, p] of link.pendingRpc) { clearTimeout(p.timer); p.reject(new Error('LAN_LINK_CLOSED')); }
  link.pendingRpc.clear();
  for (const [, c] of link.channels) { if (!c.closed) { c.closed = true; try { c.onClose(); } catch (_) { /* noop */ } } }
  link.channels.clear();
  const waiters = [...link.pongWaiters];
  link.pongWaiters.clear();
  for (const w of waiters) { try { w(false); } catch (_) { /* noop */ } } // 링크 사망 = probe 실패
  try { link.socket.destroy(); } catch (_) { /* noop */ }
  if (links.get(link.hostDeviceId) === link) links.delete(link.hostDeviceId);
  console.log(`[lan] host=${link.hostDeviceId} 링크 종료 (${why})`);
}

function onFrame(link: Link, type: number, ch: number, payload: Buffer): void {
  link.lastUse = Date.now();
  if (type === T_PING) { try { link.socket.write(frame(T_PONG, 0, payload)); } catch (_) { /* noop */ } return; }
  if (type === T_PONG) {
    if (link.pongTimer) { clearTimeout(link.pongTimer); link.pongTimer = undefined; }
    const waiters = [...link.pongWaiters];
    link.pongWaiters.clear();
    for (const w of waiters) { try { w(true); } catch (_) { /* noop */ } }
    return;
  }
  if (type === T_CTRL) {
    let msg: Record<string, unknown> | null = null;
    try { msg = JSON.parse(payload.toString('utf8')); } catch (_) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (link.onCtrl) { link.onCtrl(msg); return; }        // 핸드셰이크 단계
    const t = msg.t as string;
    if (t === 'opened' || t === 'openfail') {
      const c = Number(msg.ch);
      const p = link.pendingOpen.get(c);
      if (p) { link.pendingOpen.delete(c); clearTimeout(p.timer); p.resolve(t === 'opened'); }
      return;
    }
    if (t === 'rpc_result') {
      const id = Number(msg.id);
      const p = link.pendingRpc.get(id);
      if (!p) return;
      link.pendingRpc.delete(id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(Object.assign(new Error(String(msg.error || 'LAN_RPC_FAILED')), { lanRpcError: true }));
      return;
    }
    return; // 미지의 CTRL 은 무시(하위호환)
  }
  const chan = link.channels.get(ch);
  if (!chan) return;
  if (type === T_DATA || type === T_TEXT) {
    link.rxFrames += 1;
    //  ★ 예전엔 여기서 예외를 **통째로 삼켰다**. 그래서 수신측 버그(예: 화면 코드의 ReferenceError)가
    //   "데이터가 안 온다" 로 보였다 — 실제로는 초당 30장이 오고 있었다. 삼키되 말은 한다.
    try { chan.onData(payload, type === T_TEXT); }
    catch (e) { console.log(`[lan] 채널 수신 처리 실패 ch=${ch}: ${(e as Error)?.message || e}`); }
    return;
  }
  if (type === T_CLOSE) {
    link.channels.delete(ch);
    if (!chan.closed) { chan.closed = true; try { chan.onClose(); } catch (_) { /* noop */ } }
  }
}

function feed(link: Link, chunk: Buffer): void {
  link.buf = link.buf.length ? Buffer.concat([link.buf, chunk]) : chunk;
  for (;;) {
    if (link.buf.length < 4) return;
    const len = link.buf.readUInt32BE(0);
    if (len < 3 || len > FRAME_MAX) { killLink(link, 'frame-violation'); dispatch(link.hostDeviceId, { t: 'hard_fail', cause: 'proto' }); return; }
    if (link.buf.length < 4 + len) return;
    const type = link.buf.readUInt8(4);
    const ch = link.buf.readUInt16BE(5);
    const payload = link.buf.subarray(7, 4 + len);
    // subarray 는 뷰다 — 소비 전에 사본을 만든다(다음 concat 이 원본을 바꾸면 데이터가 깨진다).
    const copy = Buffer.from(payload);
    link.buf = Buffer.from(link.buf.subarray(4 + len));
    onFrame(link, type, ch, copy);
    if (link.dead) return;
  }
}

// grant + endpoint 하나로 TCP 연결 + 핸드셰이크. 성공 시 rttMs 를 함께 돌려준다.
function handshake(hostDeviceId: number, grant: LanGrant, endpoint: LanEndpoint, clientKey: string): Promise<{ link: Link; rttMs: number } | { err: 'hard' | 'auth'; cause?: 'proto' | 'unreachable' }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const finish = (v: { link: Link; rttMs: number } | { err: 'hard' | 'auth'; cause?: 'proto' | 'unreachable' }) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(v);
    };
    // 심층방어: 서버가 준 주소라도 **사설 대역이 아니면 다이얼하지 않는다**(위 isPrivateHost 주석).
    if (!isPrivateHost(endpoint.host)) { finish({ err: 'hard', cause: 'proto' }); return; }
    const socket = TcpSocket.createConnection(
      { host: endpoint.host, port: endpoint.port, connectTimeout: CONNECT_MS },
      () => {
        try { socket.write(ctrl({ t: 'hello', v: 1, grantId: grant.grantId, client: clientKey, kind: 'mobile' })); }
        catch (_) { finish({ err: 'hard', cause: 'unreachable' }); }
      },
    );
    const link: Link = {
      hostDeviceId, socket, endpoint, scopes: grant.scopes || [], grant,
      ready: false, dead: false, buf: Buffer.alloc(0), nextCh: 1,
      channels: new Map(), pendingOpen: new Map(), pendingRpc: new Map(), rpcSeq: 0, rxBytes: 0, rxFrames: 0,
      lastUse: Date.now(), pongWaiters: new Set(),
    };
    const deadline = setTimeout(() => {
      // 연결이 안 되거나 핸드셰이크가 안 끝난다 = 방화벽/iOS 로컬 네트워크 권한 거부(감지 API 없음).
      killLink(link, 'handshake-timeout');
      // 닿지 않은 것 — 폰이 다른 망에 있는 정상 상황에서도 항상 이 결과가 나온다.
      //  blocked 카운터에 넣으면 외출 중 실패가 집 지문을 오염시켜 직결이 영구 정지된다.
      finish({ err: 'hard', cause: 'unreachable' });
    }, HANDSHAKE_MS + CONNECT_MS);

    let nonceSeen = ''; // chal 의 nonce — auth(mac)와 ok(smac) 검증이 **같은 문자열**을 써야 한다
    link.onCtrl = (msg) => {
      if (msg.t === 'chal') {
        const nonce = typeof msg.nonce === 'string' ? msg.nonce : '';
        if (!nonce) { killLink(link, 'bad-chal'); finish({ err: 'hard' }); return; }
        nonceSeen = nonce;
        // MAC 재료는 **받은 nonce 문자열 그대로** — 인코딩 해석 차이로 양 끝이 갈리지 않게(설계 §2.3).
        const key = Buffer.from(grant.secret, 'base64');
        const mac = b64enc(hmacSha256(new Uint8Array(key), utf8(`${grant.grantId}|${nonce}|${clientKey}`)));
        try { socket.write(ctrl({ t: 'auth', mac })); } catch (_) { finish({ err: 'hard' }); }
        return;
      }
      if (msg.t === 'ok') {
        // 상호 인증 — 호스트가 smac 으로 "나도 secret 을 안다"를 증명한다. 검증하지 않으면 같은 Wi-Fi 의
        //  공격자가 데몬을 사칭해 이 기기의 파일 쓰기·키 입력을 그대로 받아낼 수 있다.
        //  smac 이 없는 구 데몬은 통과시킨다(additive) — 대신 scope 는 서버가 이미 제한한다.
        if (typeof msg.smac === 'string' && msg.smac) {
          const key = Buffer.from(grant.secret, 'base64');
          const want = b64enc(hmacSha256(new Uint8Array(key), utf8(`srv|${grant.grantId}|${nonceSeen}|${clientKey}`)));
          if (msg.smac !== want) {
            console.log('[lan] 호스트 인증 실패(smac 불일치) — 직결 중단');
            killLink(link, 'srv-auth-failed');
            finish({ err: 'hard' });
            return;
          }
        }
        link.onCtrl = undefined;
        link.ready = true;
        if (Array.isArray(msg.scopes)) link.scopes = (msg.scopes as unknown[]).filter((x): x is string => typeof x === 'string');
        links.set(hostDeviceId, link);
        startKeepalive(link);
        finish({ link, rttMs: Date.now() - t0 });
        return;
      }
      if (msg.t === 'err') {
        const code = String(msg.code || '');
        killLink(link, `auth-err:${code || 'unknown'}`);
        // BAD_GRANT/EXPIRED = 데몬 재시작으로 grant 가 사라진 것 → 재발급 1회는 강등으로 세지 않는다(§5.5).
        finish({ err: code === 'BAD_GRANT' || code === 'EXPIRED' ? 'auth' : 'hard' });
      }
    };
    socket.on('data', (data) => {
      if (link.dead) return;
      const b = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
      link.rxBytes += b.length;
      feed(link, b);
    });
    //  왜 죽었는지까지 남긴다 — '그냥 닫혔다' 만 남으면 원인 추적이 소켓 바이트 세기로 내려간다.
    socket.on('error', (e: unknown) => {
      killLink(link, `socket-error(${(e as { message?: string })?.message || e})`);
      finish({ err: 'hard' });
    });
    socket.on('close', () => { killLink(link, `socket-close rx=${link.rxBytes}B/${link.rxFrames}f`); finish({ err: 'hard' }); });
  });
}

function startKeepalive(link: Link): void {
  link.pingTimer = setInterval(() => {
    if (link.dead) return;
    try { link.socket.write(frame(T_PING, 0, Buffer.alloc(8))); } catch (_) { killLink(link, 'ping-write'); return; }
    if (link.pongTimer) return;
    link.pongTimer = setTimeout(() => {
      link.pongTimer = undefined;
      killLink(link, 'pong-timeout');
      dispatch(link.hostDeviceId, { t: 'soft_fail' }); // 무응답은 소프트(순간 혼잡일 수 있다)
    }, PONG_MS);
  }, PING_MS);
  link.idleTimer = setInterval(() => {
    if (link.dead) return;
    if (link.channels.size || link.pendingRpc.size) return;
    if (Date.now() - link.lastUse < IDLE_CLOSE_MS) return;
    killLink(link, 'idle'); // 강등 아님 — 다음 사용 때 다시 붙는다
  }, 30_000);
}

// 대상 호스트로 살아있는 링크 확보(없으면 grant 발급 → 핸드셰이크). null = LAN 불가(조용히 릴레이).
async function ensureLink(hostDeviceId: number, scopes: LanScope[]): Promise<Link | null> {
  const alive = links.get(hostDeviceId);
  if (alive && alive.ready && !alive.dead) return alive;
  const inflight = linking.get(hostDeviceId);
  if (inflight) return inflight;
  const p = (async (): Promise<Link | null> => {
    const clientKey = await daemonService.getClientKey();
    for (let attempt = 0; attempt < 2; attempt++) {
      const g = await daemonService.lanGrant(hostDeviceId, scopes, 'mobile');
      if (!g.ok) {
        // unsupported = 정상(서버 스위치 off/구 데몬/클라우드) → 오래 쉰다. offline/error 는 릴레이가 처리.
        dispatch(hostDeviceId, g.reason === 'unsupported' ? { t: 'unsupported' } : { t: 'hard_fail', cause: 'unreachable' });
        return null;
      }
      // 네트워크 지문을 **연결 전에** 갱신한다 — 실패만 반복하면 지문을 배울 기회가 없어(성공 시에만
      //  배우면) 첫 네트워크의 실패 이력이 영원히 남는다. 호스트가 다른 서브넷으로 옮기면 여기서
      //  지문이 바뀌어 blocked/쿨다운이 자동 해제된다(카페 실패 → 집에서 즉시 재시도).
      dispatch(hostDeviceId, { t: 'net_change', fingerprint: fingerprintOf(g.grant.endpoints[0].host) });
      // endpoint 를 순서대로 시도(서버가 IPv4 우선 정렬해 준다).
      let authRetry = false;
      let lastCause: 'auth' | 'proto' | 'unreachable' = 'unreachable';
      for (const ep of g.grant.endpoints) {
        const r = await handshake(hostDeviceId, g.grant, ep, clientKey);
        if ('link' in r) {
          dispatch(hostDeviceId, { t: 'probe_ok', rttMs: r.rttMs, fingerprint: fingerprintOf(ep.host) });
          return r.link;
        }
        if (r.err === 'auth') { authRetry = true; lastCause = 'auth'; break; } // grant 재발급하고 1회 재시도
        if (r.cause) lastCause = r.cause;
      }
      // 마지막 시도의 원인을 물려준다 — 인증/프레임 거부만 blocked 카운터에 들어간다.
      if (!authRetry) { dispatch(hostDeviceId, { t: 'hard_fail', cause: lastCause }); return null; }
    }
    dispatch(hostDeviceId, { t: 'hard_fail' });
    return null;
  })().finally(() => { linking.delete(hostDeviceId); });
  linking.set(hostDeviceId, p);
  return p;
}

/**
 * 승격 시도(fire-and-forget) — probe 2연속 성공이면 경로가 'lan' 이 된다.
 *  호출측은 결과를 기다리지 않는다: 지금 이 순간의 연결은 그냥 릴레이로 가고, **다음** 연결이 직결된다.
 *  ("끊고 승격" 금지 — 사용자 체감 악화 + tmux 이중 attach 위험 §5.1)
 */
export function maybePromote(hostDeviceId: number | null | undefined, scopes: LanScope[] = WANT_SCOPES): void {
  if (hostDeviceId == null || !enabled) return;
  if (probing.has(hostDeviceId)) return;
  if (!canProbe(stateOf(hostDeviceId), Date.now())) return;
  probing.add(hostDeviceId);
  void (async () => {
    try {
      const first = await ensureLink(hostDeviceId, scopes);
      if (!first) return;
      await new Promise((r) => setTimeout(r, PROBE_GAP_MS));
      if (links.get(hostDeviceId) !== first || first.dead) return;
      // 두 번째 probe = 살아있는 링크의 ping RTT(새 연결을 또 만들지 않는다).
      const rtt = await pingRtt(first);
      if (rtt == null) { dispatch(hostDeviceId, { t: 'soft_fail' }); return; }
      const s = dispatch(hostDeviceId, { t: 'probe_ok', rttMs: rtt, fingerprint: fingerprintOf(first.endpoint.host) });
      if (s.mode !== 'lan') return;
      // 관찰 구간(3s) 을 오류 없이 넘기면 정착 — 백오프가 기본값으로 리셋된다.
      setTimeout(() => {
        const cur = links.get(hostDeviceId);
        if (cur && !cur.dead && shouldUseLan(stateOf(hostDeviceId))) dispatch(hostDeviceId, { t: 'settle' });
      }, OBSERVE_MS + 50);
    } catch (_) { /* 조용히 릴레이 */ } finally { probing.delete(hostDeviceId); }
  })();
}

// 살아있는 링크의 PING→PONG 왕복 시간(승격용 2번째 probe). 실패/무응답은 null.
function pingRtt(link: Link): Promise<number | null> {
  return new Promise((resolve) => {
    if (link.dead) { resolve(null); return; }
    const t0 = Date.now();
    let done = false;
    const waiter = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok ? Date.now() - t0 : null);
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      link.pongWaiters.delete(waiter);
      resolve(null);
    }, PONG_MS);
    link.pongWaiters.add(waiter);
    try { link.socket.write(frame(T_PING, 0, Buffer.alloc(8))); }
    catch (_) { done = true; clearTimeout(timer); link.pongWaiters.delete(waiter); resolve(null); }
  });
}

/** 지금 이 호스트로 새 연결을 LAN 으로 열어야 하는가(경로 상태만 본다 — I/O 없음). */
/**
 * LAN leg 는 **평문**이다. 사용자가 E2EE 를 'required' 로 걸어 뒀으면 그 위로 무엇도 보내지 않는다
 *  — 빠르다고 봉인을 몰래 벗기면 그건 다운그레이드 공격을 우리가 대신 해 주는 것이다.
 *  (원래 daemonService 의 LAN RPC 경로에만 있던 규칙이다. 화면 영상이 두 번째 사용자가 되면서
 *   두 곳이 각자 판단하지 않도록 여기 한 곳으로 옮겼다.)
 */
export function plaintextAllowed(): boolean {
  try {
    const e2ee = require('./e2ee').default as typeof import('./e2ee').default;
    return e2ee.getStatus().policy !== 'required';
  } catch (_) { return true; }   // e2ee 미초기화 = 아직 봉인 없음
}

export function shouldDirect(hostDeviceId: number | null | undefined, scope: LanScope = 'tcp'): boolean {
  if (hostDeviceId == null || !enabled) return false;
  if (!shouldUseLan(stateOf(hostDeviceId))) return false;
  const link = links.get(hostDeviceId);
  // scope 는 서버가 grant 로 정한다 — 링크가 그 scope 를 못 받았으면 이 용도로는 릴레이를 쓴다.
  return !link || link.dead ? true : link.scopes.includes(scope);
}

/**
 * 프리뷰 포워딩용 raw TCP 채널. null = LAN 불가 → 호출측이 **조용히** 릴레이로 간다.
 *  ★ ECONNREFUSED(대상 포트에 dev 서버가 없음)는 LAN 문제가 아니므로 경로를 강등하지 않는다.
 */
export async function openTcp(
  hostDeviceId: number,
  port: number,
  onData: (b: Buffer) => void,
  onClose: () => void,
): Promise<LanTcpChannel | null> {
  if (!enabled) return null;
  const link = await ensureLink(hostDeviceId, WANT_SCOPES);
  if (!link || link.dead || !link.scopes.includes('tcp')) return null;
  const ch = link.nextCh++;
  if (link.nextCh > 65535) link.nextCh = 1;
  const chan: Channel = { ch, onData, onClose, closed: false };
  link.channels.set(ch, chan);
  link.lastUse = Date.now();
  const opened = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => { link.pendingOpen.delete(ch); resolve(false); }, OPEN_MS);
    link.pendingOpen.set(ch, { resolve, timer });
    try { link.socket.write(ctrl({ t: 'open', ch, kind: 'tcp', params: { port } })); }
    catch (_) { clearTimeout(timer); link.pendingOpen.delete(ch); resolve(false); }
  });
  if (!opened) {
    link.channels.delete(ch);
    // 채널 오픈 타임아웃은 소프트(링크는 살아 있는데 응답이 늦다) — openfail(포트 없음)은 강등 대상 아님.
    if (!link.dead && link.channels.size === 0) dispatch(hostDeviceId, { t: 'soft_fail' });
    return null;
  }
  return {
    write(data: Buffer) {
      if (chan.closed || link.dead) return;
      link.lastUse = Date.now();
      try { link.socket.write(frame(T_DATA, ch, data)); } catch (_) { /* close 가 뒤따른다 */ }
    },
    close() {
      if (chan.closed) return;
      chan.closed = true;
      link.channels.delete(ch);
      if (!link.dead) { try { link.socket.write(frame(T_CLOSE, ch)); } catch (_) { /* noop */ } }
    },
    get closed() { return chan.closed || link.dead; },
  };
}

/**
 * 모바일 화면 라이브 영상(H.264)을 **LAN 직결로** 받는다. null = LAN 불가 → 조용히 릴레이.
 *
 * 왜(2026-08-05 실측 — 사용자 지적 "PC 반응은 즉시인데 안드로이드에 표현되는 게 느리다"):
 *  에뮬레이터에 밀리초 시계를 띄우고 폰 화면을 찍어 재 본 지연.
 *    릴레이(폰→CF→홈서버→CF→PC)  310~420 ms
 *    LAN 직결(폰→PC)               96~109 ms
 *  인코딩+캡처 자체가 64ms 이므로, 릴레이가 얹던 250ms 가 통째로 사라진다.
 *
 * 바이트는 릴레이 WS 와 **완전히 같다** — meta(JSON 텍스트) 한 줄 뒤 `[플래그][H.264]`.
 *  그래서 화면(EmulatorVideo)은 어느 길로 왔는지 몰라도 된다.
 */
export async function openEmu(
  hostDeviceId: number,
  params: Record<string, unknown>,
  onFrame: (b: Buffer, isText: boolean) => void,
  onClose: () => void,
): Promise<{ close(): void; readonly closed: boolean } | null> {
  if (!enabled || !plaintextAllowed()) return null;
  const link = await ensureLink(hostDeviceId, WANT_SCOPES);
  if (!link || link.dead || !link.scopes.includes('emu')) {
    //  왜 못 썼는지 한 줄. 침묵은 규율이지만(사용자에게 문구를 안 만든다) 로그까지 지우면
    //   "링크는 붙었는데 영상만 릴레이" 같은 상태를 아무도 못 본다.
    console.log(`[lan] emu 채널 불가 host=${hostDeviceId} link=${!!link} scopes=${link ? link.scopes.join(',') : '-'}`);
    return null;
  }
  const ch = link.nextCh++;
  if (link.nextCh > 65535) link.nextCh = 1;
  const chan: Channel = { ch, onData: onFrame, onClose, closed: false };
  link.channels.set(ch, chan);
  link.lastUse = Date.now();
  const opened = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => { link.pendingOpen.delete(ch); resolve(false); }, OPEN_MS);
    link.pendingOpen.set(ch, { resolve, timer });
    try { link.socket.write(ctrl({ t: 'open', ch, kind: 'emu', params })); }
    catch (_) { clearTimeout(timer); link.pendingOpen.delete(ch); resolve(false); }
  });
  if (!opened) { link.channels.delete(ch); return null; }
  return {
    close() {
      if (chan.closed) return;
      chan.closed = true;
      link.channels.delete(ch);
      if (!link.dead) { try { link.socket.write(frame(T_CLOSE, ch)); } catch (_) { /* noop */ } }
    },
    get closed() { return chan.closed || link.dead; },
  };
}

/**
 * fs 등 제어 RPC 를 LAN 으로 1건 왕복. **null = LAN 미사용(릴레이로 가라)** 이고,
 *  데몬이 돌려준 진짜 실패(파일 없음/권한)는 throw 한다 — 빈 결과로 뭉개면 리컨실러가 오판한다(§5.3).
 */
export async function rpc<T>(hostDeviceId: number, method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T | null> {
  if (!enabled || !shouldDirect(hostDeviceId, 'rpc')) return null;
  const link = await ensureLink(hostDeviceId, WANT_SCOPES);
  if (!link || link.dead || !link.scopes.includes('rpc')) return null;
  const id = ++link.rpcSeq;
  link.lastUse = Date.now();
  try {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        link.pendingRpc.delete(id);
        dispatch(hostDeviceId, { t: 'soft_fail' });
        reject(Object.assign(new Error('LAN_TIMEOUT'), { lanTransport: true }));
      }, timeoutMs || RPC_MS);
      link.pendingRpc.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try { link.socket.write(ctrl({ t: 'rpc', id, method, params })); }
      catch (_) {
        clearTimeout(timer); link.pendingRpc.delete(id);
        reject(Object.assign(new Error('LAN_UNREACHABLE'), { lanTransport: true }));
      }
    });
  } catch (e) {
    // 전송 계층 실패(연결/타임아웃) = 릴레이로 폴백(null). 데몬의 논리 실패는 그대로 throw.
    const anyE = e as { lanTransport?: boolean; message?: string };
    if (anyE?.lanTransport || anyE?.message === 'LAN_LINK_CLOSED') return null;
    throw e;
  }
}

/** 부활 트리거 — 앱 포그라운드 복귀 / 네트워크 변화(runner_status lan_update) / 사용자 새로고침. */
export function revive(): void {
  for (const id of [...states.keys()]) dispatch(id, { t: 'revive' });
}
/** 대상 PC 의 LAN 주소가 바뀌었다(back runner_status.lanEpoch 변화) — 링크를 버리고 다시 승격 시도. */
export function onHostLanChanged(hostDeviceId: number): void {
  const link = links.get(hostDeviceId);
  if (link) killLink(link, 'lan-changed');
  const s = states.get(hostDeviceId);
  if (s) { states.set(hostDeviceId, step(s, { t: 'revive' }, Date.now())); notify(); }
}
/** 로그아웃/계정 전환 — 전부 정리(클린 슬레이트). */
export function reset(): void {
  for (const id of [...links.keys()]) killLink(links.get(id)!, 'reset');
  states.clear();
  notify();
}

// ── AppState — iOS 는 백그라운드에서 소켓을 회수한다. 복귀 시 부활 트리거(설계 §6 revival) ──
let wired = false;
let wentBackground = false;
export function wireAppState(): void {
  if (wired) return;
  wired = true;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') {
      wentBackground = true;
      for (const id of [...links.keys()]) killLink(links.get(id)!, 'background'); // 강등 아님(killLink 는 상태를 안 건드림)
      return;
    }
    if (st !== 'active' || !wentBackground) return;
    wentBackground = false;
    revive();
  });
}

export default {
  badgeFor, subscribe, loadEnabled, isEnabled, setEnabled,
  maybePromote, shouldDirect, plaintextAllowed, openTcp, openEmu, rpc, revive, onHostLanChanged, reset, wireAppState,
};
