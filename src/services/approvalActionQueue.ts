import { AppState, NativeEventEmitter, NativeModules } from 'react-native';
import {
  ApprovalError, addApprovalEventListener, approvalKind, respondApproval,
} from './approvalService';

// ── 알림 액션([허용]/[거절]/선택지)으로 눌린 승인 응답을 서버로 흘려보내는 드레인 ──
//
//  네이티브(iOS CptApproval.swift / Android 동형 모듈)는 알림 액션을 **영속 큐**에 적재만 하고
//  HTTPS 는 여기서 보낸다. 이유(네이티브 직접 전송을 기각한 근거):
//   · accessToken TTL 15분 → 알림이 오는 시점엔 거의 항상 만료 → 갱신 필수.
//   · 갱신은 refreshToken 을 회전(구 토큰 폐기)시킬 수 있어, 네이티브가 갱신하면 회전 토큰을
//     AsyncStorage 에 직접 써야 하고 실패 시 **사용자가 로그아웃**된다.
//   → 기존 `apiRequest`(401 → refresh → 1회 재시도 + 회전 토큰 write-back)를 그대로 재사용한다.
//     네이티브에 토큰 사본을 두지 않으므로 새 보안 표면이 0.
//
//  ⚠ 등록 위치는 `index.js` 최상단(컴포넌트 밖)이다. 알림 액션은 앱이 종료된 상태에서도 앱을
//    **백그라운드로** 띄우는데, 그때 App 트리 마운트를 기다리면 백그라운드 실행 창(~30초, 네이티브가
//    beginBackgroundTask 로 붙들고 있는 구간)을 놓친다. 번들 평가 직후 바로 드레인해야 한다.
//  ⚠ ack 하기 전까지 큐는 디스크에 남는다 → 프로세스가 먼저 죽어도 유실 0(다음 실행에서 재시도).
//    끝까지 못 보내면 승인은 서버 마감으로 defer = PC 터미널 다이얼로그(fail-safe, auto-allow 없음).

type NativeApprovalAction = {
  uid: string;
  approvalId: string;
  decision: 'allow' | 'deny' | 'answer';
  labels?: string[];
  questionIndex?: number;
  notifId?: string;
  at: number;
};

// 오래된 항목 폐기 상한 — **서버 마감(데몬 24h · back TTL 25h)보다 뒤**여야 한다.
//  ⚠ 2026-07-28 마감 폐지 라운드에서 놓쳤던 4번째 상수: 예전 값 10분("서버 마감 570s" 전제)은
//   오프라인에서 누른 [허용]/선택 응답을 10분 뒤 재접속 시 **보내보지도 않고** 버렸다.
//   실제 만료 판정은 서버가 한다(EXPIRED/NOT_FOUND → TERMINAL_CODES 로 자연 정리) — 이 값은
//   큐가 영원히 자라는 것만 막는 안전장치다.
const STALE_MS = 26 * 3600 * 1000;

function mod(): any {
  return (NativeModules as any).CptApproval || null;
}

// 재시도해도 결과가 안 바뀌는 확정 실패 → 큐에서 지운다(다른 기기가 먼저 답함 / 마감 / 없는 승인).
//  ⚠ 문구 정규식이 아니라 서버 에러 **코드**로 판정한다(approvalService.ApprovalError.code).
const TERMINAL_CODES = new Set(['ALREADY_RESOLVED', 'EXPIRED', 'NOT_FOUND']);

async function send(a: NativeApprovalAction): Promise<boolean> {
  try {
    await respondApproval(
      a.approvalId,
      a.decision,
      a.decision === 'answer'
        ? { answer: { questionIndex: a.questionIndex ?? 0, labels: a.labels || [] } }
        : undefined,
    );
    return true;
  } catch (e) {
    if (e instanceof ApprovalError && TERMINAL_CODES.has(e.code)) return true;
    return false;   // HOST_OFFLINE·네트워크 실패 = 재시도 대상(마감 전까지)
  }
}

let draining = false;

/** 네이티브 큐를 비우며 서버로 응답 전송. 성공/확정실패한 것만 ack(삭제)한다. */
export async function drainNativeApprovalActions(): Promise<number> {
  const m = mod();
  if (!m?.pendingActions) return 0;            // 네이티브 미링크(리빌드 전) — 조용히 스킵
  if (draining) return 0;
  draining = true;
  try {
    const items: NativeApprovalAction[] = (await m.pendingActions()) || [];
    if (!items.length) return 0;
    const done: string[] = [];
    for (const a of items) {
      if (!a?.approvalId || !a?.uid) { done.push(a?.uid); continue; }
      if (Date.now() - (a.at || 0) > STALE_MS) { done.push(a.uid); continue; }
      let ok = false;
      try { ok = await send(a); } catch (_) { ok = false; }
      if (ok) done.push(a.uid);
    }
    const acked = done.filter(Boolean);
    if (acked.length) { try { m.ackActions(acked); } catch (_) { /* noop */ } }
    return acked.length;
  } catch (_) {
    return 0;
  } finally {
    draining = false;
  }
}

/** 선택형 승인의 알림 액션 라벨을 미리 등록(옵션 2개까지). 초과/미등록이면 iOS 는 버튼 없이 배너만 띄운다. */
export function registerApprovalChoiceCategory(approvalId: string, labels: string[]): void {
  const m = mod();
  if (!m?.registerChoiceCategory || !approvalId || !labels?.length) return;
  if (labels.length > 2) return;               // 초과 = 앱 열기 폴백(잘못된 라벨을 그리지 않는다)
  try { m.registerChoiceCategory(approvalId, labels.slice(0, 2)); } catch (_) { /* noop */ }
}

/** 해소된 선택형 승인의 카테고리 정리(선택 — 안 불러도 상한으로 자연 폐기). */
export function dropApprovalChoiceCategories(approvalIds: string[]): void {
  const m = mod();
  if (!m?.dropChoiceCategories || !approvalIds?.length) return;
  try { m.dropChoiceCategories(approvalIds); } catch (_) { /* noop */ }
}

let started = false;

/** index.js 에서 1회 호출 — 즉시 드레인 + 네이티브 이벤트/포그라운드 복귀 시 재드레인. */
export function startNativeApprovalActionBridge(): void {
  if (started) return;
  started = true;
  const m = mod();
  if (!m) return;
  drainNativeApprovalActions();
  try {
    // 앱이 살아있는 동안 액션이 눌리면 네이티브가 알린다(body 없음 — 큐를 pull 로 읽는다).
    new NativeEventEmitter(m).addListener('cptApprovalActions', () => { drainNativeApprovalActions(); });
  } catch (_) { /* 이벤트 미지원 플랫폼 — pull 만 */ }
  // 백그라운드에서 전송 실패한 항목을 사용자가 앱을 열 때 만회한다.
  AppState.addEventListener('change', (s) => { if (s === 'active') drainNativeApprovalActions(); });

  // 선택형 승인의 알림 액션 라벨 등록 — pending 프레임을 아는 순간(= 푸시와 거의 동시)에 붙인다.
  //  셸/카드 파일을 건드리지 않고 approvalService 의 리스너에만 얹는다(에이전트 간 충돌 0).
  addApprovalEventListener((e) => {
    if (e.kind === 'resolved') { dropApprovalChoiceCategories([e.id]); return; }
    const a = e.approval;
    if (!a || approvalKind(a) !== 'choice') return;
    const q = a.prompt?.questions?.[0];
    const labels = (q?.options || []).map((o) => o.label).filter(Boolean);
    if (labels.length >= 1 && labels.length <= 2) registerApprovalChoiceCategory(a.id, labels);
  });
}
