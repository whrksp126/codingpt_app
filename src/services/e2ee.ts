import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACK_URL } from '../utils/service';
import { refreshAccessToken } from '../utils/api';
import core from './e2ee/e2eeCore.js';
import proto from './e2ee/e2eeProto.js';
import { gateFor, mayFallbackFor, reduceEnroll } from './e2ee/e2eeState';

// 종단간 암호화(기능2) 클라이언트 — 열쇠 수립 · 기기 승인 · 봉투 RPC.
//
// ★ 제품 제약(사용자 확정) — 위반하면 제품 가치가 깎인다
//  1) "같은 계정 로그인만으로 내 PC 를 찾아 쓰는" 사용성을 훼손하지 않는다. 기기 발견은 계정 기반 그대로.
//     승인 전에도 **기기 목록·워크스페이스 목록·상태·알림은 전부 보인다**(암호화가 필요한 조작만 게이팅).
//  2) 새 폰/태블릿의 열쇠는 기존 신뢰 기기의 **원탭 승인**으로 받는다(확인 숫자 4자리 대조).
//  3) 열쇠는 계정 단위 마스터키(MK) 1개 — PC 별 승인 금지(멀티 PC 제품).
//  4) 협상 실패·구버전·키 부재 시 **평문 폴백**. 연결이 끊기거나 기능이 죽으면 실패다.
//     그래서 이 모듈의 모든 실패 경로는 `state` 를 내리고 `null/false` 를 돌려주며, **던지지 않는다**
//     (단 sealedRpc 는 예외 — 설계 §6-5: 실패를 빈 결과로 뭉개면 리컨실러가 레이아웃을 지운다).
//
// 킬스위치: 설정 토글(policy='off') → 즉시 평문. 데몬쪽은 CPT_E2EE=0.
//
// 저장: Keychain / Android Keystore(`react-native-keychain`, service 'codingpt.e2ee').
//  ⚠ AsyncStorage 는 평문이라 **MK 를 절대 두지 않는다**. 모듈이 없으면 state='unavailable' 로
//    남아 평문으로 동작한다(앱은 그대로 쓸 수 있다) — 네이티브 의존성 추가는 사용자 빌드 작업.
//
// ─────────────────────────────────────────────────────────────────
// 서버 계약(이 파일이 실제로 호출하는 것 — back/데몬 구현의 참조점)
//  · 능력 문자열 = 단계별로 쪼갠다(서버 config/caps.js 와 동일 이름):
//    'e2ee.keys.v1'(열쇠 배포=A) · 'e2ee.rpc.v1'(봉투 RPC=B) · 'e2ee.stream.v1'(PTY/forward=D).
//    설계서의 'e2ee/v1' 처럼 뭉치면 배관 없는 단계가 켜져 프레임이 조용히 유실된다.
//  POST /api/daemon/e2ee/enroll     {ikX,ikEd,label,platform,kind}
//        → {state:'bootstrap'|'pending'|'trusted', epoch?, enrollmentId?, pendingSince?,
//           grant?:{epoch,sealed,sig,sealedByIkEd?}, userRef?}
//  POST /api/daemon/e2ee/bootstrap  {ikX,ikEd,label,platform,kind,sealed,sig} → {epoch,keyId} (409=이미 초기화)
//  GET  /api/daemon/e2ee/pending    → {pending:[{enrollmentId,label,platform,ikX,requestedAt,requestIp}], userRef?}
//  POST /api/daemon/e2ee/approve    {enrollmentId, ikX, epoch, sealed, sig, approverIkX}
//  POST /api/daemon/e2ee/deny       {enrollmentId}
//  GET  /api/daemon/e2ee/keyring?ikX=  → {epoch,policy,recoverySet,devices:[{keyId,label,platform,ikX,ikEd,state,…}],myGrant}
//  POST /api/daemon/e2ee/rotate     {approverIkX,fromEpoch,toEpoch,revokeKeyIds:[],grants:[{keyId,ikX,sealed,sig}]}
//  PATCH /api/daemon/e2ee/policy    {policy:'off'|'preferred'|'required'}
//  POST /api/daemon/pair/grant      {code,ikX,ikEd,epoch,sealed,sig,approverIkX} (QR 페어링에 열쇠 얹기)
//  ※ 복구 코드는 서버를 쓰지 않는다 — 코드 문자열 자체가 MK 를 담는다(데몬 recoveryCode 와 동일 형식).
//  POST /api/daemon/rpc             {hostDeviceId?,timeoutMs,env}  → {env}
//  POST /api/daemon/pair/approve    응답에 {e2ee:{ikX}} 가 실리면 QR 페어링에 열쇠 전달을 얹는다(§3.2)
//  WS   {type:'device_approval_event', event:{kind:'request'|'resolved',…}}  (기존 알림 소켓 동승)
//  알림  kind='device_approval' (탭 → 승인 시트) · body 봉인 시 subtitle 필수
//  ★ 위 라우트가 없으면(404) state='unsupported' 로 떨어지고 앱은 평문으로 정상 동작한다.
// ─────────────────────────────────────────────────────────────────

export type E2eePolicy = 'off' | 'preferred' | 'required';
/** 암호화 적용 범위 — 단계 적용(A→B→C→D) 을 런타임에서 가르는 스위치. 기본 'rpc'(터미널 평문). */
export type E2eeScope = 'off' | 'rpc' | 'stream';

export type E2eeState =
  | 'unavailable' // 이 기기에서 암호를 쓸 수 없음(CSPRNG/보안 저장소 없음)
  | 'unsupported' // 서버/호스트가 아직 e2ee 를 모름(404·구버전)
  | 'off'         // 사용자가 껐음
  | 'bootstrap'   // 계정 첫 기기 — MK 자가 생성 진행
  | 'pending'     // 기존 신뢰 기기의 승인 대기(확인 숫자 표시)
  | 'trusted'     // 열쇠 보유 → 암호화 동작
  | 'error';

export interface E2eeStatus {
  state: E2eeState;
  epoch: number;
  policy: E2eePolicy;
  scope: E2eeScope;
  /** 새 기기가 화면에 크게 띄우는 확인 숫자(4자리). pending 일 때만. */
  verifyCode: string | null;
  /** 감사 UI용 6자리 지문("418 209"). 키가 있으면 항상. */
  fingerprint: string | null;
  enrollmentId: string | null;
  pendingSince: string | null;
  recoverySet: boolean;
  /** 열쇠 있고 정책이 켜져 있어 실제로 봉인할 수 있는가. */
  ready: boolean;
  /** 사람이 읽는 상태 사유(설정 화면 문구). */
  reason: string | null;
  /** 보안 저장소를 못 써서 키를 만들지 않은 경우(설정에서 안내). */
  storageMissing: boolean;
}

export interface PendingDevice {
  enrollmentId: string;
  label: string;
  platform: string | null;
  ikX: string;
  /** 화면에 크게 띄우는 4자리. 원칙은 ikX 에서 **로컬 계산**(서버 위조 차단) — pickCode 주석 참조. */
  verifyCode: string;
  /** 로컬 계산과 서버 값이 일치했는가(false = 지문 검증 불가 상태로 표시). */
  verified: boolean;
  fingerprint: string;
  requestedAt: string | null;
  requestIp?: string | null;
}

export interface TrustedDeviceKey {
  deviceKeyId: number;
  deviceId: number | null;
  label: string;
  platform: string | null;
  ikX: string;
  ikEd?: string | null;
  fingerprint: string;
  state: string;
  enrolledAt?: string | null;
}

/** device_approval_event 프레임의 event(설계 §3.1-3b). 구 클라이언트는 unknown type 이라 무시 = 안전. */
export type DeviceApprovalEvent =
  | { kind: 'request'; enrollmentId: string; label?: string; platform?: string | null; ikX?: string; fingerprint?: string; requestedAt?: string }
  | { kind: 'resolved'; enrollmentId: string; approved?: boolean; by?: { deviceId?: number | null; deviceName?: string } | null };

// ── 로컬 상태 파일(설계 §2.3 스키마) ────────────────────────────
interface E2eeFile {
  v: 1;
  suite: string;
  userId: string;
  /** 확인 숫자/지문 파생에 쓰는 계정 참조 — **서버가 준 문자열을 그대로** 쓴다(아래 fpRef 주석). */
  userRef?: string;
  ikX: { pub: string; priv: string };
  ikEd: { pub: string; priv: string };
  epoch: number;
  /** epoch → MK(b64u). 과거 epoch 보존 = 옛 스냅샷/알림 복호(설계 §6-19). */
  keys: Record<string, string>;
  policy: E2eePolicy;
  scope: E2eeScope;
  recoverySet: boolean;
  enrollmentId?: string | null;
  pendingSince?: string | null;
  /** 서버가 계산해 준 내 확인 숫자(대조용) — 로컬 계산과 다르면 파생 기준이 어긋난 것이다(fpRef 주석). */
  serverVerifyCode?: string | null;
  updatedAt: string;
}

const KEYCHAIN_SERVICE = 'codingpt.e2ee';
/** 정책/범위만 담는 비밀 아닌 캐시 — 보안 저장소가 없어도 UI 가 사용자 선택을 기억하게. */
const PREF_KEY = 'cpt.e2ee.prefs';

let file: E2eeFile | null = null;
let state: E2eeState = 'off';
let reason: string | null = null;
let userId = '';
let userRef = '';
let storageMissing = false;
let prefs: { policy: E2eePolicy; scope: E2eeScope } = { policy: 'preferred', scope: 'rpc' };
let inited = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch (_) { /* noop */ } } };
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── 보안 저장소(옵셔널 네이티브 모듈) ───────────────────────────
//  정적 import 하지 않는 이유: 모듈이 없는 빌드에서 **번들 로드 자체가 실패**하면 앱이 죽는다.
//  타입도 없으므로 any 로 다룬다(tsc 는 이 파일만으로 통과해야 한다).
let keychain: any | null | undefined;
function getKeychain(): any | null {
  if (keychain !== undefined) return keychain;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keychain = require('react-native-keychain');
    if (keychain && keychain.default) keychain = keychain.default;
  } catch (_) { keychain = null; }
  if (!keychain || typeof keychain.setGenericPassword !== 'function') keychain = null;
  return keychain;
}

async function loadFile(): Promise<E2eeFile | null> {
  const kc = getKeychain();
  if (!kc) { storageMissing = true; return null; }
  try {
    const got = await kc.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!got || !got.password) return null;
    const parsed = JSON.parse(got.password) as E2eeFile;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch (_) { return null; }
}
async function saveFile(f: E2eeFile): Promise<boolean> {
  const kc = getKeychain();
  if (!kc) { storageMissing = true; return false; }
  f.updatedAt = new Date().toISOString();
  try {
    await kc.setGenericPassword('e2ee', JSON.stringify(f), {
      service: KEYCHAIN_SERVICE,
      accessible: kc.ACCESSIBLE?.AFTER_FIRST_UNLOCK ?? undefined,
    });
    file = f;
    return true;
  } catch (_) { return false; }
}
async function wipeFile(): Promise<void> {
  const kc = getKeychain();
  file = null;
  if (!kc) return;
  try { await kc.resetGenericPassword({ service: KEYCHAIN_SERVICE }); } catch (_) { /* noop */ }
}

async function loadPrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && (p.policy === 'off' || p.policy === 'preferred' || p.policy === 'required')) prefs.policy = p.policy;
      if (p && (p.scope === 'off' || p.scope === 'rpc' || p.scope === 'stream')) prefs.scope = p.scope;
    }
  } catch (_) { /* noop */ }
}
async function savePrefs(): Promise<void> {
  try { await AsyncStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) { /* noop */ }
}

// ── 난수 배선 ──────────────────────────────────────────────────
//  Hermes 에는 getRandomValues 가 없다 → react-native-get-random-values 폴리필이 있으면 쓴다.
//  없으면 **키를 만들지 않는다**(약한 난수 폴백 금지) → state='unavailable' → 전부 평문.
let randomReady: boolean | null = null;
function ensureRandom(): boolean {
  if (randomReady !== null) return randomReady;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('react-native-get-random-values');
  } catch (_) { /* 폴리필 없음 — 아래에서 globalThis 확인 */ }
  randomReady = core.hasRandomSource();
  return randomReady;
}

/**
 * 확인 숫자(4자리)·지문(6자리) 파생에 쓰는 계정 참조.
 * ★ 왜 서버가 준 문자열을 쓰는가: 이 숫자는 **두 기기 화면에서 눈으로 대조**하는 값이므로 폰과 PC가
 *   글자 하나까지 같은 입력을 써야 한다. 각 플랫폼이 자기 방식으로 만든 userId(숫자 vs 문자열,
 *   프로필 소스 차이)를 쓰면 정상 기기에서도 숫자가 어긋나 사용자가 거절하게 된다.
 *   서버가 이 값을 위조해도 두 기기에 **같게** 주기 때문에 대조는 여전히 성립한다(보안 손실 없음 —
 *   숫자를 지배하는 입력은 기기 공개키 ikX 다). 서버가 안 주면 양쪽 다 ''(빈 문자열)로 일치한다.
 */
function fpRef(): string { return userRef || userId || ''; }
/**
 * 표시할 확인 숫자 고르기.
 *  · 로컬 계산 == 서버 값  → 로컬(검증됨). 서버가 ikX 를 바꿔치기하면 숫자가 어긋나 사용자가 잡는다.
 *  · 다르면 → **서버 값**을 쓴다. 파생 기준(userRef)이 어긋난 것이므로 로컬을 고집하면 정상 기기끼리도
 *    숫자가 달라 보여 사용자가 정당한 승인을 거절한다(치명적 UX 실패). 대신 verified=false 로 표시해
 *    "지문 검증 불가" 를 UI 가 알릴 수 있게 한다.
 */
function pickCode(local: string, server?: string | null): { code: string; verified: boolean } {
  if (!server) return { code: local, verified: true };
  return server === local ? { code: local, verified: true } : { code: server, verified: false };
}
function captureUserRef(body: any): void {
  const v = body && (body.userRef ?? body.user_ref);
  if (typeof v === 'string' && v && v !== userRef) {
    userRef = v;
    if (file) { file.userRef = v; void saveFile(file); }
  }
}

// ── 상태 조회 ──────────────────────────────────────────────────
function mkFor(epoch: number): Uint8Array | null {
  const b64 = file?.keys?.[String(epoch)];
  if (!b64) return null;
  try { return core.b64uDec(b64); } catch (_) { return null; }
}
function currentMk(): Uint8Array | null { return file ? mkFor(file.epoch) : null; }

export function getStatus(): E2eeStatus {
  const policy = file?.policy ?? prefs.policy;
  const scope = file?.scope ?? prefs.scope;
  const hasKey = !!currentMk();
  return {
    state,
    epoch: file?.epoch ?? 0,
    policy,
    scope,
    verifyCode: state === 'pending' && file ? pickCode(proto.verifyCode4(core.b64uDec(file.ikX.pub), fpRef()), file.serverVerifyCode).code : null,
    fingerprint: file ? proto.fingerprint6(core.b64uDec(file.ikX.pub), fpRef()) : null,
    enrollmentId: file?.enrollmentId ?? null,
    pendingSince: file?.pendingSince ?? null,
    recoverySet: !!file?.recoverySet,
    ready: hasKey && state === 'trusted' && policy !== 'off',
    reason,
    storageMissing,
  };
}
/**
 * 이 기기가 서버에 신고할 caps — **실제로 그 단계를 수행할 수 있을 때만** 신고한다(caps.js 규약).
 *  단계별로 쪼갠 이유: 'e2ee.v1' 처럼 뭉치면 서버/데몬이 아직 배관이 없는 단계(스트림 등)를 켜서
 *  프레임이 조용히 유실된다. 이 클라이언트가 지금 할 수 있는 것 = 열쇠 배포 + 봉투 RPC.
 */
export function clientCaps(): string[] {
  const s = getStatus();
  if (!s.ready) return [];
  const caps = [proto.E2EE_CAP];
  if (s.scope !== 'off') caps.push(proto.CAP_RPC);
  if (s.scope === 'stream') caps.push(proto.CAP_STREAM);
  return caps;
}
/** 정책이 required 인데 암호화가 불가능한 상태 = 조작을 막고 명시 에러를 띄워야 한다. */
export function isBlocked(): boolean {
  const s = getStatus();
  return s.policy === 'required' && !s.ready;
}
/** 승인 대기 등으로 "암호화 필요" 조작을 막아야 하는가 + 사용자 문구(null = 막지 않음). */
export function gateReason(): string | null {
  const s = getStatus();
  return gateFor({ policy: s.policy, ready: s.ready, state: s.state });
}

// ── REST(상태코드 보존) ────────────────────────────────────────
interface Raw<T> { status: number; body: T & { message?: string; detail?: any } }
async function raw<T>(path: string, init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }, retry = true): Promise<Raw<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let tok: string | null = null;
  try { tok = await AsyncStorage.getItem('accessToken'); } catch (_) { tok = null; }
  let res: Response;
  try {
    res = await fetch(`${BACK_URL}${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    return { status: 0, body: { message: String(e?.message || e) } as any };
  }
  clearTimeout(timer);
  if (res.status === 401 && retry) {
    const t = await refreshAccessToken().catch(() => null);
    if (t) return raw<T>(path, init, false);
  }
  let body: any = {};
  try { body = await res.json(); } catch (_) { body = {}; }
  // successResponse 는 data 를 최상위로 펼친다(과거 함정) — data 가 있으면 그걸 쓴다.
  return { status: res.status, body: (body && body.data !== undefined ? body.data : body) as any };
}

// ── 신원키 생성 ────────────────────────────────────────────────
function newIdentity(uid: string): E2eeFile {
  const x = core.x25519Keypair();
  const ed = core.ed25519Keypair();
  return {
    v: 1, suite: core.SUITE, userId: uid,
    ikX: { pub: core.b64uEnc(x.pub), priv: core.b64uEnc(x.priv) },
    ikEd: { pub: core.b64uEnc(ed.pub), priv: core.b64uEnc(core.concat(ed.seed, ed.pub)) },
    epoch: 0, keys: {},
    policy: prefs.policy, scope: prefs.scope,
    recoverySet: false, enrollmentId: null, pendingSince: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 로그인 직후 1회. **무마찰 원칙**: 여기서 실패해도 앱은 전부 그대로 동작해야 한다.
 *  ① 기기 키쌍 확보 → ② enroll → ③ 첫 기기면 bootstrap(자동, 마찰 0) / 아니면 pending(확인 숫자 표시)
 */
export async function init(uid: string | number | null | undefined): Promise<void> {
  const next = String(uid ?? '');
  if (inited && next === userId) { void refresh(); return; }
  inited = true;
  userId = next;
  await loadPrefs();
  if (prefs.policy === 'off') { state = 'off'; reason = '설정에서 꺼져 있어요.'; emit(); return; }
  if (!ensureRandom()) {
    state = 'unavailable';
    reason = '이 빌드에 난수 생성기(react-native-get-random-values)가 없어 암호화를 켤 수 없어요.';
    emit();
    return;
  }
  file = await loadFile();
  if (file && file.userId && file.userId !== userId) {
    // 계정 전환 = 클린 슬레이트(기존 원칙) — 다른 계정 열쇠를 남기지 않는다.
    await wipeFile();
    file = null;
  }
  if (file && file.userRef) userRef = file.userRef;
  if (!file) {
    const f = newIdentity(userId);
    if (!(await saveFile(f))) {
      state = 'unavailable';
      reason = '이 기기에 보안 저장소(Keychain/Keystore)가 없어 암호화를 켤 수 없어요.';
      emit();
      return;
    }
  }
  if (currentMk()) { state = 'trusted'; reason = null; emit(); }
  await enroll();
}

/** 로그아웃/탈퇴 — 열쇠 폐기(다음 로그인은 다시 승인 필요). */
export async function reset(): Promise<void> {
  stopPolling();
  await wipeFile();
  inited = false;
  userId = '';
  userRef = '';
  state = 'off';
  reason = null;
  emit();
}

function applyEnrollResponse(body: any): void {
  if (!file) return;
  // 정책은 **계정 전체 동기화 값**이다(다른 기기에서 바꾼 것을 여기서 받는다).
  const p = body?.policy;
  if (p === 'off' || p === 'preferred' || p === 'required') {
    if (prefs.policy !== p) { prefs.policy = p; void savePrefs(); }
    file.policy = p;
  }
  const next = reduceEnroll(body, !!currentMk());
  if (next.action === 'bootstrap') { void bootstrap(); return; }
  if (next.action === 'adopt') {
    if (adoptGrant(body.grant)) { state = 'trusted'; reason = null; stopPolling(); emit(); return; }
    state = 'error';
    reason = '승인 정보를 열 수 없었어요(열쇠 불일치). 다시 승인해 주세요.';
    emit();
    return;
  }
  if (next.state === 'pending') {
    file.enrollmentId = String(body?.enrollmentId || file.enrollmentId || '');
    file.pendingSince = body?.pendingSince || body?.requestedAt || file.pendingSince || new Date().toISOString();
    if (typeof body?.verifyCode === 'string') file.serverVerifyCode = body.verifyCode;
    void saveFile(file);
    state = 'pending';
    reason = null;
    startPolling();
    emit();
    return;
  }
  state = next.state;
  reason = next.state === 'error' ? '암호화 상태를 확인할 수 없어요.' : null;
  if (next.state === 'trusted') stopPolling();
  emit();
}

async function enroll(): Promise<void> {
  if (!file) return;
  const r = await raw<any>('/api/daemon/e2ee/enroll', {
    method: 'POST',
    body: {
      ikX: file.ikX.pub, ikEd: file.ikEd.pub,
      label: safeDeviceLabel(), platform: Platform.OS, kind: 'controller',
    },
  });
  if (r.status === 404 || r.status === 501) {
    // 서버가 아직 이 기능을 모른다 = 평문으로 계속 동작(무마찰 불변식).
    state = 'unsupported';
    reason = '서버가 아직 종단간 암호화를 지원하지 않아요(업데이트되면 자동으로 켜집니다).';
    emit();
    return;
  }
  if (r.status === 0) { // 네트워크 — 조용히 다음 기회에
    if (!currentMk()) { state = 'off'; reason = null; }
    emit();
    return;
  }
  if (r.status !== 200) {
    // 이미 열쇠가 있으면 서버 일시 오류가 **동작 중인 암호화를 끄지 않는다**(reduceEnroll 과 동일 규율).
    if (currentMk()) { state = 'trusted'; reason = null; }
    else { state = 'error'; reason = r.body?.message || '암호화 등록에 실패했어요.'; }
    emit();
    return;
  }
  captureUserRef(r.body);
  applyEnrollResponse(r.body);
}

/** 계정 최초 기기 — MK 자가 생성(승인 대상이 없다). 마찰 0. */
async function bootstrap(): Promise<void> {
  if (!file) return;
  const mk = core.randomBytes(32);
  const ikXPub = core.b64uDec(file.ikX.pub);
  const sealed = proto.sealGrant(mk, 1, ikXPub);
  const sig = proto.signGrant(core.b64uDec(file.ikEd.priv), 1, ikXPub, sealed);
  // ★ 서버는 normalizeIdentity(body) 로 ikX/ikEd/label/platform/kind 를 모두 요구한다(누락 시 400).
  const r = await raw<any>('/api/daemon/e2ee/bootstrap', {
    method: 'POST',
    body: {
      ikX: file.ikX.pub, ikEd: file.ikEd.pub, label: safeDeviceLabel(), platform: Platform.OS, kind: 'controller',
      sealed: core.b64uEnc(sealed), sig: core.b64uEnc(sig),
    },
  });
  if (r.status === 200) {
    file.epoch = Number(r.body?.epoch || 1) || 1;
    file.keys[String(file.epoch)] = core.b64uEnc(mk);
    file.enrollmentId = null;
    file.pendingSince = null;
    await saveFile(file);
    state = 'trusted';
    reason = null;
    emit();
    return;
  }
  if (r.status === 409) { await enroll(); return; } // 레이스: 다른 기기가 먼저 만들었다 → 승인 대기로
  state = 'error';
  reason = r.body?.message || '열쇠를 만들 수 없었어요.';
  emit();
}

/**
 * MK 채택 — 내 ikX 개인키로만 열린다(서버는 MK 를 모른다).
 *  서명 검증: 서버 grant 는 승인자를 `sealedByKeyId` 로만 알려주므로(공개키 아님), 채택 직후
 *  키링을 당겨 그 keyId 의 ikEd 로 검증한다(verifyAdopted). 검증이 **명확히 실패**하면 그 epoch 키를
 *  버리고 error 로 내린다 — 서버가 자기 MK 를 주입해 다운그레이드하는 경로를 닫는다.
 * @returns 성공 여부
 */
function adoptGrant(grant: any): boolean {
  if (!file || !grant || !grant.sealed) return false;
  const epoch = Number(grant.epoch || 0);
  if (!epoch) return false;
  let mk: Uint8Array | null = null;
  try {
    mk = proto.openGrant(core.b64uDec(grant.sealed), core.b64uDec(file.ikX.priv), core.b64uDec(file.ikX.pub), epoch);
  } catch (_) { mk = null; }
  if (!mk) return false;
  file.epoch = Math.max(file.epoch, epoch);
  file.keys[String(epoch)] = core.b64uEnc(mk);
  file.enrollmentId = null;
  file.pendingSince = null;
  void saveFile(file);
  void verifyAdopted(grant, epoch);
  return true;
}

/** 채택한 grant 의 승인자 서명을 키링의 ikEd 로 사후 검증(비동기). 실패가 확정되면 열쇠를 버린다. */
async function verifyAdopted(grant: any, epoch: number): Promise<void> {
  try {
    const keyId = Number(grant.sealedByKeyId ?? grant.sealedBy ?? 0);
    if (!grant.sig) return;
    const r = await raw<any>('/api/daemon/e2ee/keyring', { method: 'GET' });
    if (r.status !== 200 || !Array.isArray(r.body?.devices)) return;
    const approver = r.body.devices.find((d: any) => Number(d.keyId) === keyId);
    if (!approver || !approver.ikEd || !file) return; // 승인자를 못 찾으면 판단 보류(열쇠는 유지)
    const ok = proto.verifyGrantSig(
      core.b64uDec(approver.ikEd), epoch, core.b64uDec(file.ikX.pub),
      core.b64uDec(grant.sealed), core.b64uDec(grant.sig),
    );
    if (ok) return;
    delete file.keys[String(epoch)];
    await saveFile(file);
    state = 'error';
    reason = '승인 서명 검증에 실패했어요(안전을 위해 열쇠를 폐기했습니다). 다시 승인해 주세요.';
    emit();
  } catch (_) { /* 검증 불가 = 판단 보류 */ }
}

// 승인 대기 폴링 — WS(device_approval_event resolved)가 정본이고 이건 그물망(설계 §3.1-6).
function startPolling(): void {
  if (pollTimer) return;
  const tick = async () => {
    pollTimer = null;
    if (state !== 'pending') return;
    await enroll();
    if (state === 'pending') { pollTimer = setTimeout(tick, 5000); }
  };
  pollTimer = setTimeout(tick, 3000);
}
function stopPolling(): void {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

/** 상태 재확인(앱 복귀·소켓 재접속·설정 진입). */
export async function refresh(): Promise<void> {
  // ⚠ userId 로 게이팅하지 않는다 — 호출부는 init(null) 로 시작하고(확인 숫자 기준은 서버 userRef),
  //   userId 가 '' 인 정상 상태에서 refresh 가 전부 no-op 이 되면 승인 완료가 영원히 반영되지 않는다.
  if (!inited) return;
  if (prefs.policy === 'off') { state = 'off'; emit(); return; }
  if (state === 'unavailable') return;
  if (!file) { file = await loadFile(); }
  if (!file) { await init(userId); return; }
  await enroll();
}

function safeDeviceLabel(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./daemonService').getDeviceLabel() || '모바일';
  } catch (_) { return '모바일'; }
}

// ── 정책/범위 토글(킬스위치) ───────────────────────────────────
export async function setPolicy(p: E2eePolicy): Promise<void> {
  prefs.policy = p;
  await savePrefs();
  if (file) { file.policy = p; await saveFile(file); }
  if (p === 'off') { stopPolling(); state = 'off'; reason = '설정에서 꺼져 있어요.'; emit(); }
  else if (state === 'off') { inited = false; await init(userId); }
  else emit();
  // 계정 전체 동기화(다른 기기도 같은 정책) — 실패해도 로컬 prefs 가 정본이다.
  void raw('/api/daemon/e2ee/policy', { method: 'PATCH', body: { policy: p } });
}
export async function setScope(s: E2eeScope): Promise<void> {
  prefs.scope = s;
  await savePrefs();
  if (file) { file.scope = s; await saveFile(file); }
  emit();
}

// ── 승인자 측(신뢰 기기) ───────────────────────────────────────
export async function listPending(): Promise<PendingDevice[]> {
  const r = await raw<{ pending?: any[] }>('/api/daemon/e2ee/pending', { method: 'GET' });
  captureUserRef(r.body);
  if (r.status !== 200 || !Array.isArray(r.body?.pending)) return [];
  return r.body.pending.map((p: any) => decoratePending(p)).filter((p): p is PendingDevice => !!p);
}
function decoratePending(p: any): PendingDevice | null {
  if (!p || !p.enrollmentId || !p.ikX) return null;
  let code = '';
  let fp = '';
  let verified = true;
  try {
    const ikX = core.b64uDec(p.ikX);
    const picked = pickCode(proto.verifyCode4(ikX, fpRef()), typeof p.verifyCode === 'string' ? p.verifyCode : null);
    code = picked.code;
    verified = picked.verified;
    fp = proto.fingerprint6(ikX, fpRef());
  } catch (_) { return null; }
  return {
    enrollmentId: String(p.enrollmentId),
    label: String(p.label || '새 기기'),
    platform: p.platform ?? null,
    ikX: String(p.ikX),
    verifyCode: code,
    verified,
    fingerprint: fp,
    requestedAt: p.requestedAt ?? null,
    requestIp: p.requestIp ?? null,
  };
}
/** WS 로 온 request 이벤트를 카드용 행으로(확인 숫자는 로컬 계산). */
export function pendingFromEvent(ev: DeviceApprovalEvent): PendingDevice | null {
  if (!ev || ev.kind !== 'request') return null;
  return decoratePending(ev);
}

export class E2eeError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 원탭 승인 — 로컬 MK 를 새 기기 공개키로 봉인해 업로드. 실패는 code 로 분기(문구 의존 금지). */
export async function approveDevice(enrollmentId: string, ikXB64: string): Promise<void> {
  const mk = currentMk();
  if (!file || !mk) throw new E2eeError('이 기기에 열쇠가 없어요.', 0, 'NO_KEY');
  const ikX = core.b64uDec(ikXB64);
  const sealed = proto.sealGrant(mk, file.epoch, ikX);
  const sig = proto.signGrant(core.b64uDec(file.ikEd.priv), file.epoch, ikX, sealed);
  const r = await raw<any>('/api/daemon/e2ee/approve', {
    method: 'POST',
    body: {
      enrollmentId, ikX: ikXB64, epoch: file.epoch,
      sealed: core.b64uEnc(sealed), sig: core.b64uEnc(sig),
      approverIkX: file.ikX.pub, // 서버가 승인자(=신뢰 기기)를 키링에서 찾는 키
    },
  });
  if (r.status === 200) return;
  const code = r.body?.detail?.code || (r.status === 409 ? 'CONFLICT' : r.status === 404 ? 'NOT_FOUND' : 'UNKNOWN');
  throw new E2eeError(r.body?.message || '승인을 전달하지 못했어요.', r.status, code);
}
export async function denyDevice(enrollmentId: string): Promise<void> {
  const r = await raw<any>('/api/daemon/e2ee/deny', { method: 'POST', body: { enrollmentId } });
  if (r.status !== 200 && r.status !== 404) {
    throw new E2eeError(r.body?.message || '거절을 전달하지 못했어요.', r.status, 'UNKNOWN');
  }
}

/** 키링(감사 UI) — 신뢰 기기 목록 + 지문. 실패는 빈 목록(읽기 전용 화면이라 안전). */
export async function loadKeyring(): Promise<{ epoch: number; devices: TrustedDeviceKey[] }> {
  // ikX 를 실으면 서버가 내 봉인문(myGrant)을 함께 준다 — 회전 직후 무중단 승계 경로.
  const q = file ? `?ikX=${encodeURIComponent(file.ikX.pub)}` : '';
  const r = await raw<any>(`/api/daemon/e2ee/keyring${q}`, { method: 'GET' });
  captureUserRef(r.body);
  if (r.status !== 200) return { epoch: file?.epoch ?? 0, devices: [] };
  const devices: TrustedDeviceKey[] = (Array.isArray(r.body?.devices) ? r.body.devices : []).map((d: any) => {
    let fp = '';
    try { fp = proto.fingerprint6(core.b64uDec(d.ikX), fpRef()); } catch (_) { fp = ''; }
    return {
      deviceKeyId: Number(d.keyId ?? d.deviceKeyId ?? 0), // 서버 필드명은 keyId
      deviceId: d.deviceId ?? null,
      label: String(d.label || '기기'),
      platform: d.platform ?? null,
      ikX: String(d.ikX || ''),
      ikEd: d.ikEd ?? null,
      fingerprint: fp,
      state: String(d.state || 'trusted'),
      enrolledAt: d.enrolledAt ?? null,
    };
  });
  // 서버 grant 가 우리 것보다 최신이면 채택(다른 기기가 회전시킨 경우 무중단 승계).
  if (r.body?.myGrant) adoptGrant(r.body.myGrant);
  return { epoch: Number(r.body?.epoch || file?.epoch || 0), devices };
}

/**
 * 신뢰 해제 + epoch 회전(설계 §7-6 권고 ①).
 *  남은 기기 전원에게 새 MK 를 재봉인해 한 번에 올린다 — 해제된 기기는 이후 트래픽을 못 읽는다.
 *  ⚠ objectstore 의 옛 암호문은 옛 키로 그대로 열린다(재암호화 안 함) → UI 가 그렇게 고지한다.
 */
export async function revokeTrustAndRotate(deviceKeyId: number): Promise<void> {
  const mk = currentMk();
  if (!file || !mk) throw new E2eeError('이 기기에 열쇠가 없어요.', 0, 'NO_KEY');
  const { devices } = await loadKeyring();
  const remain = devices.filter((d) => d.deviceKeyId !== deviceKeyId && d.state === 'trusted' && d.ikX);
  const fromEpoch = file.epoch;
  const toEpoch = fromEpoch + 1;
  const newMk = core.randomBytes(32);
  //  ★ 서버는 "남아 있는 신뢰 기기 **전부**"의 새 봉인문을 요구한다(INCOMPLETE_ROTATION).
  //    내 기기 것도 포함해야 한다 — 빠지면 회전 후 내가 못 읽는다.
  const grants = remain.map((d) => {
    const ikX = core.b64uDec(d.ikX);
    const sealed = proto.sealGrant(newMk, toEpoch, ikX);
    return {
      keyId: d.deviceKeyId, ikX: d.ikX,
      sealed: core.b64uEnc(sealed),
      sig: core.b64uEnc(proto.signGrant(core.b64uDec(file!.ikEd.priv), toEpoch, ikX, sealed)),
    };
  });
  const r = await raw<any>('/api/daemon/e2ee/rotate', {
    method: 'POST',
    body: { approverIkX: file.ikX.pub, fromEpoch, toEpoch, revokeKeyIds: [deviceKeyId], grants },
  });
  if (r.status !== 200) throw new E2eeError(r.body?.message || '신뢰 해제에 실패했어요.', r.status, 'ROTATE_FAILED');
  file.epoch = Number(r.body?.epoch || toEpoch);
  file.keys[String(file.epoch)] = core.b64uEnc(newMk); // 옛 epoch 키는 남긴다(옛 스냅샷 복호)
  await saveFile(file);
  emit();
}

// ── 복구 코드(자기완결형) ──────────────────────────────────────
//  ★ 서버에 봉인문을 올리지 않는다 — 코드 문자열 자체가 MK 를 담는다(데몬 recoveryCode 와 동일 형식).
//    그래서 "모든 신뢰 기기 소실" 상황에서 서버 도움 없이 복원된다. 화면에 1회만 노출한다.
/** 새 복구 문구 생성(표시용). 저장/전송하지 않는다 — 사용자가 적어야 한다. */
export async function createRecoveryCode(): Promise<string> {
  const mk = currentMk();
  if (!file || !mk) throw new E2eeError('이 기기에 열쇠가 없어요.', 0, 'NO_KEY');
  const code = proto.recoveryCode(file.epoch, mk);
  file.recoverySet = true;
  await saveFile(file);
  emit();
  return code;
}
/**
 * 모든 신뢰 기기를 잃었을 때 — 문구로 MK 복원. 성공하면 이 기기는 즉시 봉인/복호가 가능하다.
 *  ⚠ 서버 키링에는 이 기기가 여전히 'pending' 일 수 있다(승인해 줄 기기가 없으므로). 그래도
 *    데몬과의 통신은 MK 기반이라 동작한다 — 그래서 로컬 state 를 trusted 로 올린다.
 */
export async function restoreFromRecovery(code: string): Promise<boolean> {
  if (!file) return false;
  const got = proto.parseRecoveryCode(code);
  if (!got) return false;
  file.epoch = Math.max(file.epoch, got.epoch);
  file.keys[String(got.epoch)] = core.b64uEnc(got.mk);
  file.recoverySet = true;
  await saveFile(file);
  state = 'trusted';
  reason = null;
  stopPolling();
  emit();
  void enroll(); // 서버 상태도 최신화(승인 대기 중이면 그대로 남는다 — 동작에는 영향 없음)
  return true;
}

// ── QR 재검증(강한 검증, 설계 §3.2) ────────────────────────────
/** QR 의 `k=` 지문과 서버가 준 ikX 를 대조. 불일치면 "연결이 안전하지 않습니다" 로 차단. */
export function verifyQrPin(ikXB64: string, k: string): boolean {
  try { return proto.qrPin(core.b64uDec(ikXB64)) === String(k || ''); } catch (_) { return false; }
}
/** codingpt://pair?code=…&k=… 에서 핀 추출(없으면 null = 레거시 QR → 4자리 비교 폴백). */
export function pinFromPairLink(url: string | null | undefined): string | null {
  const m = String(url || '').match(/[?&]k=([^&]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
}

/**
 * 새 PC(QR 페어링) 에 열쇠 전달 — 기존 1탭 승인에 **얹기만** 한다(추가 탭 0회, 설계 §3.2).
 *  서버 계약: POST /api/daemon/pair/grant { code, ikX(에코), ikEd, sealed, sig, epoch, approverIkX }
 *   · ikX 는 PC 가 pair/session 에 실어 보낸 값을 서버가 approve 응답으로 알려준 것.
 *   · QR 의 `k=`(지문)와 대조해 **서버가 대상 공개키를 바꿔치기하는 경로를 차단**한다.
 * @returns 'sent' 전달 완료 / 'pin-mismatch' QR 지문 불일치(열쇠 미전달 = 차단) /
 *          'skipped' 서버·PC 미지원 or 이 기기에 열쇠 없음(=평문 페어링으로 끝, 무마찰)
 */
export async function grantToPairedPc(opts: {
  code: string; ikX?: string | null; ikEd?: string | null; pin?: string | null; label?: string;
}): Promise<'sent' | 'pin-mismatch' | 'skipped'> {
  const mk = currentMk();
  if (!file || !mk || !opts.ikX) return 'skipped';
  // ★ fail-closed: QR 핀이 없으면 열쇠를 주지 않는다.
  //  이 경로의 유일한 MITM 방어가 "QR(=눈으로 보는 오프라인 채널)로 받은 지문과 서버가 준 공개키의 일치"다.
  //  핀이 없을 때 대조를 건너뛰고 서버가 준 ikX 로 봉인하면, 악성 서버가 자기 공개키를 끼워넣어
  //  **무경고로 마스터키를 획득**한다(사용자에게 아무 표시도 나지 않는다).
  //  핀 생산(deepLink 의 k=)이 아직 배포되지 않은 구버전 PC 와 페어링하면 여기서 'skipped' 가 되어
  //  그 PC 는 평문으로만 동작한다 — 기능이 안 켜지는 것이 열쇠가 유출되는 것보다 낫다.
  if (!opts.pin) return 'skipped';
  if (!verifyQrPin(opts.ikX, opts.pin)) return 'pin-mismatch';
  const ikX = core.b64uDec(opts.ikX);
  const sealed = proto.sealGrant(mk, file.epoch, ikX);
  const r = await raw<any>('/api/daemon/pair/grant', {
    method: 'POST',
    body: {
      code: String(opts.code || '').trim().toUpperCase(),
      ikX: opts.ikX, ...(opts.ikEd ? { ikEd: opts.ikEd } : {}),
      epoch: file.epoch,
      sealed: core.b64uEnc(sealed),
      sig: core.b64uEnc(proto.signGrant(core.b64uDec(file.ikEd.priv), file.epoch, ikX, sealed)),
      approverIkX: file.ikX.pub,
    },
  });
  return r.status === 200 ? 'sent' : 'skipped';
}

// ── 봉투 RPC(설계 §2.5) ────────────────────────────────────────
// 8바이트 — 계정 전역 키를 쓰는 봉투에서 nonce 충돌을 막는 유일한 여유분(e2eeProto.makeNonce 주석 참조).
const bootRand = (() => { try { return core.randomBytes(8); } catch (_) { return new Uint8Array(8); } })();
let rpcCounter = 0;

// 봉투 RPC 미지원 네거티브 캐시.
//  ★ 이게 없으면 서버/데몬에 봉투 배관이 아직 없는 동안 **fs 호출마다 404 왕복이 한 번 더** 붙는다
//    (IDE 파일 열기·트리 로드가 전부 2배 지연). 한 번 미지원을 확인하면 TTL 동안 곧바로 평문 경로로 간다.
//    데몬/서버가 배포되면 TTL 후 자동으로 다시 시도한다(수동 개입 없음).
const RPC_UNSUPPORTED_TTL_MS = 10 * 60 * 1000;
let rpcUnsupportedUntil = 0;
function noteRpcUnsupported(): void { rpcUnsupportedUntil = Date.now() + RPC_UNSUPPORTED_TTL_MS; }
/** 지금 봉투 RPC 를 시도해 볼 가치가 있는가(미지원 캐시 미적용 + 열쇠/정책 OK). */
export function rpcAvailable(): boolean { return canSeal() && Date.now() >= rpcUnsupportedUntil; }

/** 이 호스트로 봉인 RPC 를 보낼 수 있는가(교집합 게이팅). scope 는 rpc 이상이어야 한다. */
export function canSeal(): boolean {
  const s = getStatus();
  return s.ready && s.scope !== 'off';
}

/**
 * 봉인 RPC — 서버는 hostDeviceId/길이만 본다(메서드명조차 안 보인다).
 * @throws E2eeError code='UNSUPPORTED' — 호출부가 **기존 평문 라우트로 폴백**해야 하는 유일한 신호.
 *   그 외 실패는 그대로 throw(설계 §6-5: 빈 결과 반환 금지 — 리컨실러가 레이아웃을 지운다).
 */
export async function sealedRpc<T = any>(
  method: string, params: Record<string, unknown>,
  opts?: { hostDeviceId?: number | null; timeoutMs?: number },
): Promise<T> {
  const mk = currentMk();
  if (!canSeal() || !file || !mk) throw new E2eeError('암호화를 쓸 수 없어요.', 0, 'UNSUPPORTED');
  const host = opts?.hostDeviceId ?? null;
  rpcCounter += 1;
  const env = proto.sealRpc(mk, file.epoch, host, bootRand, rpcCounter, {
    id: `${core.b64uEnc(core.randomBytes(8))}`,
    m: method, p: params, ts: Date.now(),
  });
  const r = await raw<any>('/api/daemon/rpc', {
    method: 'POST',
    body: { ...(host != null ? { hostDeviceId: host } : {}), timeoutMs: Math.min(opts?.timeoutMs ?? 15000, 60000), env },
  });
  if (r.status === 404 || r.status === 501) {
    noteRpcUnsupported();
    throw new E2eeError('서버가 봉인 RPC 를 모릅니다.', r.status, 'UNSUPPORTED');
  }
  if (r.status === 200 && r.body?.env) {
    const out = proto.openRpcResponse(mk, r.body.env, host);
    if (!out) {
      // 복호 실패 = 열쇠 불일치(회전 직후 등). 상태를 되짚고 폴백을 허용한다.
      void refresh();
      throw new E2eeError('응답을 복호할 수 없었어요.', 200, 'DECRYPT_FAILED');
    }
    // ⚠ 성공했는데 result 가 비어도 null 을 돌려주지 않는다 — 호출부가 "미지원 폴백"으로 오해해
    //   같은 변형(fs.write 등)을 평문으로 한 번 더 실행하는 이중 실행이 된다.
    if (out.ok) return (out.r === null || out.r === undefined ? {} : out.r) as T;
    throw new E2eeError(String(out.e || '요청이 실패했어요.'), 200, String(out.code || 'RPC_ERROR'));
  }
  // 구 데몬은 method:'sealed' 를 모른다 → 데몬이 throw → back 이 4xx/5xx. 평문 폴백 신호로 승격.
  const code = r.body?.detail?.code || '';
  if (r.status >= 400 && r.status < 600 && !r.body?.env) {
    // 구 데몬은 method:'sealed' 를 몰라 throw → back 이 4xx/5xx. 이것도 미지원으로 캐시한다.
    if (!code || code === 'UNSUPPORTED' || r.status >= 500) noteRpcUnsupported();
    throw new E2eeError(r.body?.message || '봉인 RPC 를 처리할 수 없어요.', r.status, code || 'UNSUPPORTED');
  }
  throw new E2eeError(r.body?.message || '봉인 RPC 실패', r.status, code || 'UNKNOWN');
}
/** 평문 폴백해도 되는 실패인가 — policy='required' 면 폴백 금지(다운그레이드 공격 차단). */
export function mayFallback(e: unknown): boolean {
  const err = e as E2eeError | undefined;
  return mayFallbackFor(getStatus().policy, err?.code, err?.status);
}

// ── 알림 body / 이벤트 봉투 개봉 ───────────────────────────────
/** 알림·이벤트 텍스트 복호. 열쇠가 없으면 잠금 문구로 대체(연결/렌더를 깨지 않는다). */
export function openText(body: string | null | undefined): { text: string | null; locked: boolean } {
  if (!proto.isSealedBody(body)) return { text: body == null ? null : String(body), locked: false };
  const out = proto.openNotifBody((e: number) => mkFor(e), body);
  if (out == null) return { text: '🔒 암호화된 내용(이 기기에 열쇠 없음)', locked: true };
  return { text: out, locked: false };
}
/** agent_event/approval/chat 처럼 `env` 가 실린 프레임의 상세를 평문으로 되돌린다. */
export function openEnvelope<T = any>(env: any, hostDeviceId?: number | null): T | null {
  const mk = currentMk();
  if (!mk || !env) return null;
  return proto.openRpcResponse(mk, env, hostDeviceId ?? null) as T | null;
}

// ── device_approval_event 디스패치(새 배관 없음 — 기존 WSS 동승) ─
type DevApprovalListener = (e: DeviceApprovalEvent) => void;
const devListeners = new Set<DevApprovalListener>();
export function addDeviceApprovalListener(fn: DevApprovalListener): () => void {
  devListeners.add(fn);
  return () => { devListeners.delete(fn); };
}
export function dispatchDeviceApprovalEvent(e: DeviceApprovalEvent): void {
  // 내 enrollment 가 해소됐다 = 승인/거절됨 → 즉시 enroll 재확인(폴링 대기 없음).
  if (e && e.kind === 'resolved' && file && file.enrollmentId && e.enrollmentId === file.enrollmentId) {
    void enroll();
  }
  for (const fn of [...devListeners]) { try { fn(e); } catch (_) { /* noop */ } }
}

/** 스트림(PTY/forward) 세션키 — D단계 전용. scope!=='stream' 이면 null(=평문 유지). */
export function streamSession(o: {
  purpose: 'pty' | 'tcp'; hostDeviceId: number | null; clientKey: string;
  routing: Record<string, unknown>; pubHost: string; nonceHost: string; nonceViewer: Uint8Array;
  privViewer: Uint8Array; pubViewer: Uint8Array; epoch: number; confirm?: string;
}): { kV2H: Uint8Array; kH2V: Uint8Array; sid: Uint8Array } | null {
  const mk = mkFor(o.epoch);
  if (!mk || getStatus().scope !== 'stream') return null;
  const s = proto.deriveSession({
    purpose: o.purpose, epoch: o.epoch, hostDeviceId: o.hostDeviceId, clientKey: o.clientKey,
    pubViewer: o.pubViewer, pubHost: core.b64uDec(o.pubHost),
    nonceViewer: o.nonceViewer, nonceHost: core.b64uDec(o.nonceHost),
    routingCanonical: proto.routingCanonical(o.purpose, o.routing),
    privSelf: o.privViewer, pubPeer: core.b64uDec(o.pubHost), mk,
  });
  // 호스트가 MK 를 진짜 갖고 있는지(=서버가 중간에서 만든 세션이 아닌지) 확인.
  if (o.confirm && !core.ctEq(s.confirm, core.b64uDec(o.confirm))) return null;
  return { kV2H: s.kV2H, kH2V: s.kH2V, sid: s.sid };
}

export default {
  init, reset, refresh, getStatus, subscribe, clientCaps, isBlocked, gateReason,
  setPolicy, setScope, listPending, pendingFromEvent, approveDevice, denyDevice,
  loadKeyring, revokeTrustAndRotate, createRecoveryCode, restoreFromRecovery,
  verifyQrPin, pinFromPairLink, grantToPairedPc, canSeal, rpcAvailable, sealedRpc, mayFallback, openText, openEnvelope,
  addDeviceApprovalListener, dispatchDeviceApprovalEvent, streamSession, E2eeError,
};
