// Agent Tasks(작업 현황판·새 작업·작업 상세) 문구. text/index.ts 의 규율을 따른다.
//  정본 = codingpt_daemon/docs/agent-tasks-design.md §9 — 필드명·원문을 그대로 쓴다.
//  ⚠ PC(codingpt_pc/src/js/text/tasks.js)에 같은 필드명·같은 원문의 사전과 **같은 ERROR_KEY** 가 있다.
//   한쪽만 고치면 같은 에러가 기기마다 다른 말을 한다(i18n-crossimpl 이 원문 존재를 대조한다).
//  값에 문장 조립을 넣지 않는다 — 수·이름이 들어가는 문구는 **함수 값**이다(어순이 언어마다 다르다).
//  "PC"·"base"·머지 방식 이름처럼 한국어가 없는 원문은 번역 대상이 아니다(모든 언어에서 같은 표기).
import type { Dict } from './index';
import * as i18n from '../i18n/index.ts';

export type TasksText = {
  title: string; newTask: string; refresh: string; dashboard: string;
  empty: string; emptyHint: string; noHost: string; connectPc: string; hostOffline: string;
  pcNeedsUpdate: string; serverNeedsUpdate: string;
  groupNeedsInput: string; groupWorking: string; groupReviewReady: string; groupIdle: string; groupDone: string;
  waitingFor: (t: string) => string;
  filesSummary: (n: number) => string;
  commitsAhead: (n: number) => string;
  diffStat: (a: number, d: number) => string;
  noPr: string;
  prNumber: (n: number) => string;
  prClosed: string; prDraft: string; prMergeable: string; prConflicting: string;
  checksNone: string; checksPending: string; checksPassing: string; checksFailing: string;
  checkItemPending: string; checkItemPassing: string; checkItemFailing: string; checkItemSkipped: string;
  answer: string; openTerminal: string; reopenTerminal: string; relaunchAgent: string; review: string;
  reopen: string; resendPrompt: string; trustNeeded: string; trustContinue: string; discard: string;
  deleteRecord: string; detail: string; prompt: string; base: string; repo: string; pc: string;
  agents: string; count: string; advanced: string; copyEnv: string; fetchFirst: string;
  baseDirtyHint: (name: string, n: number) => string;
  promptBytes: (a: number, d: number) => string;
  start: string; cancel: string; confirm: string; notInstalled: string;
  runN: (n: number) => string;
  taskOpen: string; taskMerged: string; taskClosed: string; taskFailed: string;
  stateCreating: string; stateLaunching: string; stateRunning: string; stateReviewReady: string;
  stateMerging: string; stateMerged: string; stateDiscarded: string; stateFailed: string;
  opInProgress: string; checking: string; terminalGone: string; agentGone: string; agentBusy: string;
  promptNotDelivered: string; keptDirty: string; wsNotRegistered: string; wsRemoved: string;
  sendComments: string; commit: string; commitMessage: string; skipHooks: string; retryCommitNoVerify: string;
  push: string; createPr: string; prTitle: string; prBody: string; draftPr: string;
  merge: string; mergePr: string; mergeLocal: string; mergeMethod: string;
  methodMerge: string; methodSquash: string; methodRebase: string; methodFf: string;
  discardOthers: string; winner: string; openPr: string; checkChanges: string;
  discardConfirm: (n: number) => string;
  discardUnmergedConfirm: (n: number) => string;
  discardAllConfirm: string;
  discardTask: string;
  ghMissing: string; ghMissingHint: string; ghNotAuthed: string; ghNotAuthedHint: string; ghError: string;
  gitMissing: string; gitCltMissing: string; checkAgain: string; useLocalMerge: string;
  notGithub: string; noRemote: string;
  errUncommitted: string; errUnmerged: string; errNothingToCommit: string; errNothingToPr: string;
  errIdentity: string; errGitLocked: string; errCommitHook: string; errSign: string;
  errPushRejected: string; errAuth: string; errPrNotFound: string; errNotMergeable: string;
  errChecksFailing: string; errMainDirty: string;
  errBaseMoved: (base: string) => string;
  errConflict: string; conflictHint: string; errBusy: string; errInterrupted: string; errTimeout: string;
  errTaskLimit: string; errTaskClosed: string; errBaseNotFound: string; errNotRepo: string;
  errAgentMissing: string; errLaunch: string; errLaunchBusy: string; errWorktree: string;
  errWorktreeMissing: string; errPromptTooLarge: string; errTasksDisabled: string; errGeneric: string;
  taskBadge: (name: string) => string;
  backToDashboard: string;
  mergedInto: (branch: string, base: string) => string;
  promptPlaceholder: string; dictate: string;
  // 사이드바 저장소 트리(agent-tasks-sidebar.md §8)
  overview: string; local: string; addTask: string;
  terminalsN: (n: number) => string;
  openTasksN: (n: number) => string;
};

/** 세 자리 쉼표(12,345) — Intl 유무(Hermes 빌드 옵션)에 기대지 않는다. */
function group3(n: number): string {
  return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const TASKS_TEXT: Dict<TasksText> = {
  ko: {
    title: "작업",
    newTask: "새 작업",
    refresh: "새로고침",
    dashboard: "작업 현황판",
    empty: "아직 작업이 없어요",
    emptyHint: "폰이나 PC 에서 프롬프트를 보내면 PC 가 별도 브랜치에서 에이전트를 실행해요",
    noHost: "연결된 PC 가 없어요",
    connectPc: "내 PC 연결",
    hostOffline: "PC 오프라인",
    pcNeedsUpdate: "이 PC 앱을 업데이트해야 작업을 만들 수 있어요",
    serverNeedsUpdate: "서버 업데이트가 필요해요",
    groupNeedsInput: "입력 대기",
    groupWorking: "작업 중",
    groupReviewReady: "리뷰 준비",
    groupIdle: "대기 중",
    groupDone: "완료",
    waitingFor: (t: string) => i18n.t('{t} 기다리는 중', { t }),
    filesSummary: (n: number) => i18n.t('파일 {n}개', { n }),
    commitsAhead: (n: number) => i18n.t('커밋 {n}개', { n }),
    diffStat: (a: number, d: number) => i18n.t('+{a} −{d}', { a, d }),
    noPr: "PR 없음",
    prNumber: (n: number) => i18n.t('PR #{n}', { n }),
    prClosed: "PR 닫힘",
    prDraft: "초안",
    prMergeable: "머지 가능",
    prConflicting: "충돌",
    checksNone: "검사 없음",
    checksPending: "검사 진행 중",
    checksPassing: "검사 통과",
    checksFailing: "검사 실패",
    checkItemPending: "진행 중",
    checkItemPassing: "통과",
    checkItemFailing: "실패",
    checkItemSkipped: "건너뜀",
    answer: "답하기",
    openTerminal: "터미널 열기",
    reopenTerminal: "터미널 다시 열기",
    relaunchAgent: "에이전트 다시 실행",
    review: "리뷰",
    reopen: "다시 열기",
    resendPrompt: "프롬프트 다시 보내기",
    trustNeeded: "폴더 신뢰 확인이 필요해요",
    trustContinue: "신뢰하고 계속",
    discard: "폐기",
    discardTask: "작업 폐기",
    deleteRecord: "기록 삭제",
    detail: "상세",
    prompt: "프롬프트",
    base: "base",
    repo: "저장소",
    pc: "PC",
    agents: "에이전트",
    count: "개수",
    advanced: "고급",
    copyEnv: ".env 파일 복사",
    fetchFirst: "시작 전 fetch",
    baseDirtyHint: (name: string, n: number) => i18n.t('{name} 에 미커밋 변경 {n}개는 포함되지 않아요', { name, n }),
    promptBytes: (a: number, d: number) => i18n.t('{a} / {d} 바이트', { a: group3(a), d: group3(d) }),
    start: "시작",
    cancel: "취소",
    confirm: "확인",
    notInstalled: "설치 안 됨",
    runN: (n: number) => i18n.t('실행 {n}', { n }),
    taskOpen: "진행 중",
    taskMerged: "머지됨",
    taskClosed: "닫힘",
    taskFailed: "실패",
    stateCreating: "준비 중",
    stateLaunching: "에이전트 실행 중",
    stateRunning: "실행 중",
    stateReviewReady: "리뷰 준비",
    stateMerging: "머지 중",
    stateMerged: "머지됨",
    stateDiscarded: "폐기됨",
    stateFailed: "실패",
    opInProgress: "진행 중…",
    checking: "확인 중…",
    terminalGone: "터미널이 닫혔어요",
    agentGone: "에이전트가 실행 중이 아니에요",
    agentBusy: "에이전트가 아직 작업 중이에요",
    promptNotDelivered: "프롬프트가 전달되지 않았어요",
    keptDirty: "미커밋 변경이 있어 남겨뒀어요",
    wsNotRegistered: "PC 가 워크스페이스를 등록하지 못했어요",
    wsRemoved: "작업 워크스페이스가 정리됐어요",
    sendComments: "코멘트 에이전트에게 보내기",
    commit: "커밋",
    commitMessage: "커밋 메시지",
    skipHooks: "훅 건너뛰기(--no-verify)",
    retryCommitNoVerify: "훅 건너뛰고 다시 커밋",
    push: "푸시",
    createPr: "PR 만들기",
    prTitle: "PR 제목",
    prBody: "PR 본문",
    draftPr: "초안(draft)으로 만들기",
    merge: "머지",
    mergePr: "PR 머지",
    mergeLocal: "로컬 머지",
    mergeMethod: "머지 방식",
    methodMerge: "merge",
    methodSquash: "squash",
    methodRebase: "rebase",
    methodFf: "fast-forward",
    discardOthers: "나머지 실행 폐기",
    winner: "선택됨",
    openPr: "PR 열기",
    checkChanges: "변경 확인",
    discardConfirm: (n: number) => i18n.t('미커밋 변경 {n}개 파일은 30일 동안 복구할 수 있게 보관한 뒤 정리해요. 폐기할까요?', { n }),
    discardUnmergedConfirm: (n: number) => i18n.t('머지되지 않은 커밋 {n}개는 30일 동안 복구할 수 있게 보관한 뒤 정리해요. 폐기할까요?', { n }),
    discardAllConfirm: "이 작업의 모든 실행을 폐기할까요?",
    ghMissing: "GitHub CLI(gh) 가 이 PC 에 없어요",
    ghMissingHint: "터미널에서 설치한 뒤 다시 확인하세요: brew install gh",
    ghNotAuthed: "gh 로그인이 필요해요",
    ghNotAuthedHint: "PC 터미널에서 gh auth login 을 실행하거나 GH_TOKEN 환경변수를 설정하세요",
    ghError: "gh 명령이 실패했어요",
    gitMissing: "이 PC 에 git 이 없어요",
    gitCltMissing: "git 을 쓰려면 Xcode 명령줄 도구가 필요해요: xcode-select --install",
    checkAgain: "다시 확인",
    useLocalMerge: "로컬 머지로 진행",
    notGithub: "GitHub 원격이 아니라 PR 대신 로컬 머지만 할 수 있어요",
    noRemote: "원격 저장소가 없어요",
    errUncommitted: "먼저 커밋해야 해요",
    errUnmerged: "머지되지 않은 커밋이 있어요",
    errNothingToCommit: "커밋할 변경이 없어요",
    errNothingToPr: "base 에 없는 커밋이 없어요",
    errIdentity: "git 사용자 이름과 이메일을 먼저 설정하세요",
    errGitLocked: "저장소가 잠겨 있어요. 잠시 뒤 다시 시도하세요",
    errCommitHook: "커밋 훅이 실패했어요",
    errSign: "커밋 서명에 실패했어요. PC 터미널에서 한 번 커밋하거나 서명 설정을 확인하세요",
    errPushRejected: "푸시가 거부됐어요",
    errAuth: "인증에 실패했어요. PC 터미널에서 한 번 push 하거나 gh auth setup-git 을 실행하세요",
    errPrNotFound: "PR 을 찾을 수 없어요",
    errNotMergeable: "지금은 머지할 수 없어요",
    errChecksFailing: "검사가 실패한 상태예요",
    errMainDirty: "저장소에 커밋되지 않은 변경이 있어 로컬 머지를 할 수 없어요",
    errBaseMoved: (base: string) => i18n.t('머지하는 사이 {base} 가 바뀌었어요. 다시 시도하세요', { base }),
    errConflict: "충돌이 났어요",
    conflictHint: "터미널에서 해결하거나 에이전트에게 rebase 를 지시하세요",
    errBusy: "다른 작업이 진행 중이에요",
    errInterrupted: "PC 가 재시작되어 작업이 중단됐어요",
    errTimeout: "응답이 늦어요. 잠시 뒤 상태를 다시 확인하세요",
    errTaskLimit: "동시에 실행할 수 있는 작업 수를 넘었어요",
    errTaskClosed: "이미 종료된 작업이에요",
    errBaseNotFound: "base 브랜치를 찾을 수 없어요",
    errNotRepo: "git 저장소가 아니에요",
    errAgentMissing: "선택한 에이전트가 이 PC 에 없어요",
    errLaunch: "에이전트를 실행하지 못했어요",
    errLaunchBusy: "터미널에서 다른 명령이 실행 중이에요",
    errWorktree: "작업 폴더를 만들거나 지우지 못했어요",
    errWorktreeMissing: "작업 폴더가 사라졌어요",
    errPromptTooLarge: "프롬프트가 너무 길어요(30,000 바이트까지)",
    errTasksDisabled: "이 PC 에서는 작업 기능을 쓸 수 없어요",
    errGeneric: "실패했어요",
    taskBadge: (name: string) => i18n.t('작업: {name}', { name }),
    backToDashboard: "현황판",
    mergedInto: (branch: string, base: string) => i18n.t('{branch} → {base}', { branch, base }),
    promptPlaceholder: "무엇을 만들까요?",
    dictate: "받아쓰기",
    overview: "진행 현황",
    local: "로컬",
    addTask: "작업 추가",
    terminalsN: (n: number) => i18n.t('터미널 {n}개', { n }),
    openTasksN: (n: number) => i18n.t('열린 작업 {n}개', { n }),
  },
};

/**
 * 에러 code → 문구 필드명. **PC `text/tasks.js` 의 ERROR_KEY 와 같은 객체**다(설계 §9).
 *  표에 없는 code 는 `errGeneric`. 클라 전용 전송 코드(DAEMON_OFFLINE 등)는 여기 넣지 않는다 —
 *  아래 `LOCAL_ERROR_KEY` 가 받는다(두 플랫폼 공유 표를 한쪽만 늘리면 대조가 깨진다).
 */
export const ERROR_KEY: Record<string, keyof TasksText> = {
  BAD_PARAMS: 'errGeneric', PROMPT_TOO_LARGE: 'errPromptTooLarge', TASK_NOT_FOUND: 'errGeneric', RUN_NOT_FOUND: 'errGeneric',
  TASK_CLOSED: 'errTaskClosed', TASKS_DISABLED: 'errTasksDisabled', NOT_A_REPO: 'errNotRepo', BASE_NOT_FOUND: 'errBaseNotFound',
  BASE_MOVED: 'errBaseMoved', TASK_LIMIT: 'errTaskLimit', AGENT_NOT_INSTALLED: 'errAgentMissing', GIT_MISSING: 'gitMissing',
  GIT_CLT_MISSING: 'gitCltMissing', GH_MISSING: 'ghMissing', GH_NOT_AUTHED: 'ghNotAuthed', GH_ERROR: 'ghError',
  NOT_GITHUB: 'notGithub', NO_REMOTE: 'noRemote', WORKTREE_ADD_FAILED: 'errWorktree', WORKTREE_REMOVE_FAILED: 'errWorktree',
  WORKTREE_MISSING: 'errWorktreeMissing', AGENT_LAUNCH_FAILED: 'errLaunch', LAUNCH_BUSY: 'errLaunchBusy',
  PROMPT_NOT_DELIVERED: 'promptNotDelivered', TERMINAL_GONE: 'terminalGone', UNCOMMITTED_CHANGES: 'errUncommitted',
  UNMERGED_COMMITS: 'errUnmerged', NOTHING_TO_COMMIT: 'errNothingToCommit', NOTHING_TO_PR: 'errNothingToPr',
  GIT_IDENTITY_MISSING: 'errIdentity', GIT_LOCKED: 'errGitLocked', COMMIT_HOOK_FAILED: 'errCommitHook', GIT_SIGN_FAILED: 'errSign',
  PUSH_REJECTED: 'errPushRejected', AUTH_FAILED: 'errAuth', PR_NOT_FOUND: 'errPrNotFound', PR_NOT_MERGEABLE: 'errNotMergeable',
  CHECKS_FAILING: 'errChecksFailing', MAIN_DIRTY: 'errMainDirty', AGENT_BUSY: 'agentBusy', MERGE_CONFLICT: 'errConflict',
  RUN_BUSY: 'errBusy', OP_INTERRUPTED: 'errInterrupted', TIMEOUT: 'errTimeout',
};

/** 앱 전송 계층이 만드는 코드(데몬 코드가 아니다) — `services/taskService.ts` 의 TaskRpcError. */
const LOCAL_ERROR_KEY: Record<string, keyof TasksText> = {
  DAEMON_OFFLINE: 'hostOffline',
  SERVER_NEEDS_UPDATE: 'serverNeedsUpdate',
  PC_NEEDS_UPDATE: 'pcNeedsUpdate',
};

/**
 * code → 지금 언어의 문구. 함수 값(errBaseMoved 등)은 vars 로 채운다(모르면 빈 값 대신 원문 자리표시).
 *  ⚠ 데몬 message(한국어 원문)를 화면에 쓰지 않는다 — 언어가 바뀌지 않는다. 문구는 언제나 code 에서.
 */
export function taskErrorText(TX: TasksText, code: string | null | undefined, vars?: { base?: string }): string {
  const c = String(code || '');
  const key = ERROR_KEY[c] || LOCAL_ERROR_KEY[c] || 'errGeneric';
  const v = TX[key] as unknown;
  if (typeof v === 'function') {
    if (key === 'errBaseMoved') return (v as (b: string) => string)(vars?.base || 'base');
    return TX.errGeneric;
  }
  return String(v);
}
