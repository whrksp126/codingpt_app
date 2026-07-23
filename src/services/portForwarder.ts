// portForwarder.ts — 로컬 포트 포워딩 클라이언트(프리뷰 "진짜 오리진"화).
//  폰 자신의 127.0.0.1:<port> 에 TCP 리스너를 세우고, accept 된 연결마다 back WS 1개를 열어
//  PC 데몬의 dev 서버(127.0.0.1:<port>)와 양방향 raw 바이너리 파이프로 잇는다.
//  → WebView 가 http://localhost:<port> 를 그대로 로드해 상대경로 /api 충돌·절대주소
//    localhost 문제가 근본 해결된다. 경로형 프록시(previewStart)는 폴백/외부열기 전용으로 유지.
//  와이어 계약: POST /api/daemon/forward/start → {token}, WS /api/daemon/forward/<token>
//  (토큰=(port, PC)당 재사용, TTL 1h·사용 시 연장. 만료/무효면 서버가 WS 를 즉시 닫는다.)

import { AppState } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import daemonService from './daemonService';

type TcpServer = InstanceType<typeof TcpSocket.Server>;
type TcpConn = InstanceType<typeof TcpSocket.Socket>;

interface FwdEntry {
  hostDeviceId: number | null; // null = 활성 러너(백엔드 라우팅)
  port: number;
  token: string;               // (port, PC)당 재사용 — 연결별 WS 가 이 토큰으로 붙는다
  server: TcpServer | null;
  listening: boolean;
  sockets: Set<TcpConn>;       // accept 된 연결(정리용)
  wss: Set<WebSocket>;         // 연결별 back WS(정리용)
}

// 폰의 127.0.0.1 은 포트당 리스너 1개 — 키=포트. 같은 포트를 다른 PC 가 요구하면 최신 요청이 이긴다.
const entries = new Map<number, FwdEntry>();
// 같은 포트 ensureForward 동시 호출 병합(이중 bind 방지).
const pending = new Map<number, Promise<'ok' | 'bind-failed'>>();

// Buffer → ArrayBuffer(정확한 구간만) — RN WebSocket.send 는 ArrayBuffer 를 받는다.
const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// accept 된 TCP 연결 1개 ↔ back WS 1개 파이프.
function pipeConnection(entry: FwdEntry, socket: TcpConn): void {
  entry.sockets.add(socket);
  let ws: WebSocket | null = null;
  let wsOpen = false;
  let gotAny = false;  // WS 로 1바이트라도 수신했는지 — 이전엔 토큰 만료 재시도 대상
  let retried = false; // 토큰 재발급 재시도는 연결당 1회
  let closed = false;
  // WS open 전 도착분 버퍼링(WebView 는 연결 직후 바로 HTTP 요청을 쏨) + 첫 수신 전까지 보관해
  //  토큰 만료로 WS 가 즉시 닫힌 경우 재발급 후 처음부터 재전송한다. flushed = 전송 완료 인덱스.
  let outbox: Buffer[] = [];
  let flushed = 0;

  const teardown = () => {
    if (closed) return;
    closed = true;
    entry.sockets.delete(socket);
    try { socket.destroy(); } catch (_) { /* noop */ }
    if (ws) { entry.wss.delete(ws); try { ws.close(); } catch (_) { /* noop */ } }
  };

  const connectWs = (token: string) => {
    const w = new WebSocket(daemonService.buildForwardWsUrl(token));
    w.binaryType = 'arraybuffer';
    ws = w;
    entry.wss.add(w);
    w.onopen = () => {
      if (closed) { try { w.close(); } catch (_) { /* noop */ } return; }
      wsOpen = true;
      for (; flushed < outbox.length; flushed++) w.send(toArrayBuffer(outbox[flushed]));
    };
    w.onmessage = (ev: WebSocketMessageEvent) => {
      if (closed) return;
      if (!gotAny) { gotAny = true; outbox = []; flushed = 0; } // 재전송 로그 불필요 — 즉시 해제
      const d = ev.data;
      if (d instanceof ArrayBuffer) socket.write(Buffer.from(new Uint8Array(d)));
      else if (typeof d === 'string') socket.write(Buffer.from(d, 'utf8'));
    };
    w.onerror = () => { /* onclose 가 뒤따른다 */ };
    w.onclose = () => {
      entry.wss.delete(w);
      if (closed || ws !== w) return;
      wsOpen = false;
      if (!gotAny && !retried) {
        // 1바이트도 못 받고 닫힘 = 토큰 만료/무효 가능성 — 1회 재발급 후 이 연결만 재시도.
        retried = true;
        flushed = 0;
        daemonService.forwardStart(entry.port, entry.hostDeviceId)
          .then(({ token: t }) => { entry.token = t; if (!closed) connectWs(t); })
          .catch(() => teardown());
        return;
      }
      teardown();
    };
  };

  socket.on('data', (data) => {
    if (closed) return;
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    if (gotAny && wsOpen && ws) { ws.send(toArrayBuffer(buf)); return; }
    outbox.push(buf);
    if (wsOpen && ws) for (; flushed < outbox.length; flushed++) ws.send(toArrayBuffer(outbox[flushed]));
  });
  socket.on('error', () => teardown());
  socket.on('close', () => teardown());

  connectWs(entry.token);
}

function stopEntry(e: FwdEntry): void {
  entries.delete(e.port);
  e.listening = false;
  try { e.server?.close(); } catch (_) { /* noop */ }
  e.server = null;
  e.sockets.forEach((s) => { try { s.destroy(); } catch (_) { /* noop */ } });
  e.sockets.clear();
  e.wss.forEach((w) => { try { w.close(); } catch (_) { /* noop */ } });
  e.wss.clear();
}

// 127.0.0.1:<정확히 그 port> 에 listen. bind 실패(EADDRINUSE 등)= 'bind-failed'
//  — 다른 포트로 도피 금지(오리진 정합이 목적: 페이지가 자기 포트 절대주소를 쓴다).
function listenEntry(hostDeviceId: number | null, port: number, token: string): Promise<'ok' | 'bind-failed'> {
  return new Promise((resolve) => {
    const entry: FwdEntry = { hostDeviceId, port, token, server: null, listening: false, sockets: new Set(), wss: new Set() };
    let settled = false;
    const server = TcpSocket.createServer((socket: TcpConn) => pipeConnection(entry, socket));
    entry.server = server;
    server.on('listening', () => {
      entry.listening = true;
      if (!settled) { settled = true; resolve('ok'); }
    });
    server.on('error', () => {
      entry.listening = false;
      if (!settled) { settled = true; stopEntry(entry); resolve('bind-failed'); }
    });
    entries.set(port, entry);
    wireAppState();
    server.listen({ port, host: '127.0.0.1' });
  });
}

/**
 * (hostDeviceId, port) 포워딩 리스너 확보 — 살아있으면 즉시 'ok'.
 *  토큰 발급 실패(구 back 미지원/데몬 오프라인 등)는 throw 전파 — 호출측이 프록시 폴백.
 */
export async function ensureForward(hostDeviceId: number | null, port: number): Promise<'ok' | 'bind-failed'> {
  const cur = entries.get(port);
  if (cur && cur.listening && (cur.hostDeviceId ?? null) === (hostDeviceId ?? null)) return 'ok';
  const inflight = pending.get(port);
  if (inflight) return inflight;
  const p = (async () => {
    // 같은 포트를 다른 PC 가 점유 중이거나 죽은 리스너면 교체 — 최신 요청(지금 보는 PC)이 이긴다.
    const stale = entries.get(port);
    if (stale) stopEntry(stale);
    const { token } = await daemonService.forwardStart(port, hostDeviceId); // 실패 throw 전파
    return listenEntry(hostDeviceId, port, token);
  })().finally(() => pending.delete(port));
  pending.set(port, p);
  return p;
}

export function stopForward(hostDeviceId: number | null, port: number): void {
  const e = entries.get(port);
  if (e && (e.hostDeviceId ?? null) === (hostDeviceId ?? null)) stopEntry(e);
}

export function stopAll(): void {
  [...entries.values()].forEach(stopEntry);
}

// ── AppState — iOS 는 백그라운드에서 소켓이 회수됨 → 복귀 시 리스너 재수립(기존 토큰 재사용,
//   만료면 연결별 1회 재발급 경로가 흡수). 백그라운드 진입 시엔 플래그만(즉시 정리 안 함).
let wentBackground = false;
let appStateWired = false;
function wireAppState(): void {
  if (appStateWired) return;
  appStateWired = true;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') { wentBackground = true; return; }
    if (st !== 'active' || !wentBackground) return;
    wentBackground = false;
    [...entries.values()].forEach((e) => {
      const { hostDeviceId, port, token } = e;
      stopEntry(e);
      void listenEntry(hostDeviceId, port, token);
    });
  });
}

export default { ensureForward, stopForward, stopAll };
