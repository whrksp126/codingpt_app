// 오케스트레이션(묶음·워커·질문·결정) 문구. text/index.ts 의 규율을 따른다.
//  ⚠ PC(codingpt_pc/src/js/text/orch.js)에 **같은 필드명·같은 원문**의 사전이 있다 — 한쪽만 고치면 기기마다 다른 말을 한다.
//  값에 문장 조립을 넣지 않는다 — 수·이름이 들어가는 문구는 함수 값이다.
import type { Dict } from './index';
import * as i18n from '../i18n/index.ts';

export type OrchText = {
  orchestration: string; coordinator: string; worker: string;
  workersN: (n: number) => string; liveN: (n: number) => string; attentionN: (n: number) => string; okN: (n: number) => string; failedN: (n: number) => string;
  wStarting: string; wWorking: string; wAsking: string; wBlocked: string; wNeedsInput: string; wIdleNoReport: string; wExited: string;
  wSucceeded: string; wFailed: string; wStopped: string; wAbandoned: string; wUnknown: string;
  placeCurrent: string; placeWorktree: string;
  openTerminal: string; openCoordinator: string; stop: string; release: string; releaseMerge: string;
  closeRun: string; closeRunForce: string; closeRunConfirm: (n: number) => string;
  reply: string; replyPlaceholder: string; question: string; decision: string; result: string; tasks: string;
  tPending: string; tReady: string; tDispatched: string; tCompleted: string; tFailed: string; tBlocked: string;
  noWorkers: string; sent: string; released: string; stopped: string; closed: string;
  errGeneric: string; errMerge: string; errActive: string; errOffline: string;
  stTodo: string; stInProgress: string; stInReview: string; stCompleted: string;
};

export const ORCH_TEXT: Dict<OrchText> = {
  ko: {
    orchestration: '오케스트레이션',
    coordinator: '코디네이터',
    worker: '워커',
    workersN: (n) => i18n.t('워커 {n}개', { n }),
    liveN: (n) => i18n.t('진행 {n}', { n }),
    attentionN: (n) => i18n.t('확인 필요 {n}', { n }),
    okN: (n) => i18n.t('완료 {n}', { n }),
    failedN: (n) => i18n.t('실패 {n}', { n }),
    wStarting: '시작하는 중',
    wWorking: '작업 중',
    wAsking: '질문 중',
    wBlocked: '막힘',
    wNeedsInput: '입력 대기',
    wIdleNoReport: '보고 없이 멈춤',
    wExited: '종료됨(보고 없음)',
    wSucceeded: '완료',
    wFailed: '실패',
    wStopped: '멈춤',
    wAbandoned: '포기함',
    wUnknown: '알 수 없음',
    placeCurrent: '같은 폴더',
    placeWorktree: '전용 작업 폴더',
    openTerminal: '터미널 열기',
    openCoordinator: '코디네이터 터미널 열기',
    stop: '멈추기',
    release: '정리',
    releaseMerge: '머지하고 정리',
    closeRun: '묶음 닫기',
    closeRunForce: '워커를 멈추고 닫기',
    closeRunConfirm: (n) => i18n.t('아직 일하는 워커가 {n}개 있어요. 멈추고 닫을까요?', { n }),
    reply: '답하기',
    replyPlaceholder: '워커에게 보낼 답',
    question: '질문',
    decision: '결정이 필요해요',
    result: '결과',
    tasks: '일',
    tPending: '대기',
    tReady: '시작 가능',
    tDispatched: '진행 중',
    tCompleted: '완료',
    tFailed: '실패',
    tBlocked: '막힘',
    noWorkers: '아직 워커가 없어요',
    sent: '보냈어요',
    released: '정리했어요',
    stopped: '멈췄어요',
    closed: '묶음을 닫았어요',
    errGeneric: '문제가 생겼어요. 다시 시도해 주세요',
    errMerge: '머지하지 못했어요. 충돌이 있는지 확인해 주세요',
    errActive: '아직 일하는 워커예요',
    errOffline: 'PC 가 연결되어 있지 않아요',
    stTodo: '할 일',
    stInProgress: '진행 중',
    stInReview: '리뷰 중',
    stCompleted: '완료',
  },
};

const ERR: Record<string, keyof OrchText> = { MERGE_FAILED: 'errMerge', DISPATCH_ACTIVE: 'errActive', DAEMON_OFFLINE: 'errOffline' };
export function orchErrKey(code: string | null | undefined): keyof OrchText { return ERR[String(code || '')] || 'errGeneric'; }
const WS_STATUS: Record<string, keyof OrchText> = { todo: 'stTodo', 'in-progress': 'stInProgress', 'in-review': 'stInReview', completed: 'stCompleted' };
export function wsStatusKey(status: string | null | undefined): keyof OrchText | null { return WS_STATUS[String(status || '')] || null; }
