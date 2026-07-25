import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';
import { getDeviceLabel } from './daemonService';

// 원격 승인 인박스(기능1) 클라이언트 — REST `/api/daemon/approvals/*`.
//
// 왜 apiRequest 를 안 쓰는가: 승인은 **HTTP 상태와 에러 코드로 분기**해야 한다
//  (409 ALREADY_RESOLVED → 카드 즉시 철수 / 409 HOST_OFFLINE → "PC 가 꺼져 있어요" / 410 EXPIRED).
//  utils/api 의 apiRequest 는 !ok 를 throw 로 접어 상태코드와 body.detail 을 버린다 → 문구 정규식에
//  의존하게 되고, 서버 문구가 바뀌는 순간 카드가 안 걷힌다. 그래서 이 모듈만 자체 fetch 를 쓴다.
//
// 경로가 `/api/daemon/*` 인 이유는 PC 앱 브리지 화이트리스트(bridge.rs) 때문이며 모바일은 JWT 로 호출한다.

export type ApprovalDecision = 'allow' | 'deny' | 'answer';

/** 선택형 도구(AskUserQuestion/ExitPlanMode)용 정규화 프롬프트 — 데몬이 채운다. */
export interface ApprovalPrompt {
  kind?: 'choice' | 'permission';
  questions?: Array<{
    question: string;
    header: string;
    multiSelect: boolean;
    options: Array<{ label: string; description?: string }>;
  }>;
  plan?: string;
  /** 8KB 초과로 서버가 통째 버린 경우(부분 절단 JSON 금지 규칙). */
  truncated?: boolean;
  bytes?: number;
}

export interface ApprovalRow {
  id: string;
  agent: string;
  tool: string;
  summary: string;
  inputPreview?: Record<string, unknown> | { truncated: true; bytes: number } | null;
  prompt?: ApprovalPrompt | null;
  diff?: { kind: string; oldContent?: string; newContent?: string; truncated?: boolean } | null;
  relPath?: string | null;
  cwd?: string | null;
  wsName?: string | null;
  workspaceId?: string | null;
  win?: number | null;
  sessionId?: string | null;
  toolUseId?: string | null;
  permissionMode?: string | null;
  requestedAt: number;
  deadlineAt: number;
  hostDeviceId?: number | null;
  hostName?: string;
  notifId?: number | null;
  /** 다른 기기가 먼저 눌러 클레임된 상태(목록 응답에만 실린다) — 버튼을 즉시 비활성. */
  claimed?: boolean;
}

export interface ApprovalActor { kind: 'pc' | 'mobile'; deviceId: number | null; deviceName: string }

/** approval_event 프레임의 event — pending(새 요청) | resolved(해소·회수). */
export type ApprovalEvent =
  | { kind: 'pending'; approval: ApprovalRow; alertClientKey?: string | null }
  | {
      kind: 'resolved'; id: string;
      decision: 'allow' | 'deny' | 'answer' | 'defer' | 'canceled';
      reason?: string | null; by?: ApprovalActor | null; notifId?: number | null; at?: number;
    };

/** 카드가 그릴 종류. 서버 화이트리스트가 최상위 kind 를 통과시키지 않으므로 prompt.kind 가 정본. */
export function approvalKind(a: ApprovalRow): 'choice' | 'permission' {
  const p = a.prompt;
  if (p && p.kind === 'choice') return 'choice';
  // 구 데몬 폴백 — prompt 가 없어도 questions 가 있으면 선택형으로 그린다.
  if (p && Array.isArray(p.questions) && p.questions.length) return 'choice';
  return 'permission';
}

/** 승인 응답 오류 — 카드 UI 가 code 로 분기한다(문구 의존 금지). */
export class ApprovalError extends Error {
  code: string;
  status: number;
  resolvedBy?: ApprovalActor | null;
  decision?: string | null;
  constructor(message: string, status: number, code: string, extra?: { resolvedBy?: ApprovalActor | null; decision?: string | null }) {
    super(message);
    this.status = status;
    this.code = code;
    this.resolvedBy = extra?.resolvedBy ?? null;
    this.decision = extra?.decision ?? null;
  }
}

interface RawResult<T> { status: number; body: T & { message?: string; detail?: { code?: string; resolvedBy?: ApprovalActor; decision?: string } } }

async function authHeaders(): Promise<Record<string, string>> {
  let tok: string | null = null;
  try { tok = await AsyncStorage.getItem('accessToken'); } catch (_) { tok = null; }
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  };
}

// 상태코드 보존 fetch(+401 1회 리프레시 재시도). 타임아웃은 승인 UX 상 짧게(사용자가 버튼을 누르고 기다린다).
async function raw<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }, retry = true): Promise<RawResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${BACK_URL}${path}`, {
      method: init.method,
      headers: await authHeaders(),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(timer); }
  if (res.status === 401 && retry) {
    const t = await refreshAccessToken().catch(() => null);
    if (t) return raw<T>(path, init, false);
  }
  let body: any = {};
  try { body = await res.json(); } catch (_) { body = {}; }
  return { status: res.status, body };
}

/** 대기 목록(캐치업 정본) — 앱 복귀·딥링크 콜드스타트·소켓 재접속마다 다시 부른다. */
export async function listApprovals(): Promise<ApprovalRow[]> {
  const r = await raw<{ approvals?: ApprovalRow[] }>('/api/daemon/approvals', { method: 'GET' });
  if (r.status !== 200) return [];
  return Array.isArray(r.body.approvals) ? r.body.approvals : [];
}

/**
 * 응답 — 성공하면 서버가 resolved 팬아웃 + 알림 읽음(크로스기기 배너 회수)까지 처리한다.
 *  answer 는 선택형 도구용(라벨/자유입력) — 데몬이 훅 message 로 번역해 claude 에 전달한다.
 */
export async function respondApproval(
  id: string,
  decision: ApprovalDecision,
  opts?: { message?: string; answer?: { questionIndex: number; labels: string[]; text?: string | null } },
): Promise<{ id: string; decision: string; by?: ApprovalActor }> {
  const r = await raw<{ id: string; decision: string; by?: ApprovalActor }>(`/api/daemon/approvals/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: {
      decision,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.answer ? { answer: opts.answer } : {}),
      // 표시용 — 서버는 기기 레지스트리 이름을 우선하고 없을 때만 이 값을 쓴다.
      deviceName: getDeviceLabel(),
    },
  });
  if (r.status === 200) return r.body;
  const d = r.body.detail || {};
  throw new ApprovalError(
    r.body.message || '응답을 전달하지 못했어요.',
    r.status,
    d.code || (r.status === 404 ? 'NOT_FOUND' : 'UNKNOWN'),
    { resolvedBy: d.resolvedBy ?? null, decision: d.decision ?? null },
  );
}

// ── approval_event 리스너 ───────────────────────────────────────────
//  notificationService 의 단일 WSS(agent/stream)에 동승한 프레임을 여기로 흘린다(runnerStatus 패턴).
type ApprovalEventListener = (e: ApprovalEvent) => void;
const listeners = new Set<ApprovalEventListener>();

export function addApprovalEventListener(fn: ApprovalEventListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function dispatchApprovalEvent(e: ApprovalEvent): void {
  for (const fn of [...listeners]) { try { fn(e); } catch (_) { /* noop */ } }
}

/** 승인 딥링크 파싱: codingpt://approval/<id>?ws=&cwd=&win= */
export function parseApprovalDeeplink(url: string | null | undefined): { id: string; ws: string | null; cwd: string | null; win: number | null } | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/^codingpt:\/\/approval\/([^/?]+)(?:\?(.*))?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1] || '');
  if (!id) return null;
  let ws: string | null = null;
  let cwd: string | null = null;
  let win: number | null = null;
  if (m[2]) {
    for (const kv of m[2].split('&')) {
      const eq = kv.indexOf('=');
      if (eq <= 0) continue;
      const k = kv.slice(0, eq);
      let v = '';
      try { v = decodeURIComponent(kv.slice(eq + 1)); } catch (_) { v = kv.slice(eq + 1); }
      if (k === 'ws') ws = v || null;
      else if (k === 'cwd') cwd = v || null;
      else if (k === 'win') { const n = Number(v); win = Number.isInteger(n) ? n : null; }
    }
  }
  return { id, ws, cwd, win };
}

export default {
  listApprovals, respondApproval, approvalKind,
  addApprovalEventListener, dispatchApprovalEvent, parseApprovalDeeplink,
};
