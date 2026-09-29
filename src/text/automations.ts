// 자동화·한 줄 지시·PC 깨어 있기 문구. text/index.ts 의 규율을 따른다.
//  정본 = codingpt_daemon/docs/automation-design.md §11 — 필드명·원문을 그대로 쓴다.
//  ⚠ PC(codingpt_pc/src/js/text/automations.js)에 같은 필드명·같은 원문의 사전이 있다.
//  값에 문장 조립을 넣지 않는다 — 수·이름이 들어가는 문구는 **함수 값**이다(어순이 언어마다 다르다).
//  번역은 i18n 카탈로그(master.json → src/i18n/*.ts)가 갖는다. 카탈로그에 아직 없으면 한국어 원문이 나온다.
import type { Dict } from './index';
import * as i18n from '../i18n/index.ts';

export type AutoText = {
  automations: string;
  autoTitle: (name: string) => string;
  autoEmpty: string; autoEmptyHint: string;
  pauseAll: string; autoPausedAll: string;
  groupActive: string; groupPaused: string;
  runNow: string; pause: string; resume: string; deleteAuto: string; deleteAutoConfirm: string; rename: string;
  madeByAgent: (agent: string) => string;
  madeByDispatch: string; madeByUser: string;
  nextRun: (t: string) => string;
  noNextRun: string;
  lastOk: (t: string) => string;
  lastFailed: (t: string) => string;
  lastCreatedTasks: (n: number) => string;
  runsToday: (n: number, d: number) => string;
  trigSchedule: (cron: string, tz: string) => string;
  trigOnce: (t: string) => string;
  trigCommits: (branch: string) => string;
  trigIssues: (labels: string) => string;
  trigCi: string; trigReviews: string;
  trigTaskEvent: (event: string) => string;
  actTaskCreate: string; actPrompt: string; actNotify: string;
  stepN: (n: number) => string;
  guards: string; auditLog: string; autoBadge: string;
  pausedByError: string; pausedByLimit: string; pausedByServer: string;
  errAutoDisabled: string; errAutoNotFound: string; errAutoLimit: string; errAutoLoop: string;
  errAutoDepth: string; errAutoBad: string; errAutoBusy: string;
  dispatch: string; dispatchPlaceholder: string; plan: string;
  planning: (agent: string) => string;
  collecting: (n: number, d: number) => string;
  replan: string; planSummary: string; planTasks: string; planAutomations: string; planQuestions: string;
  simpleMatch: string; fallbackNoAgent: string; fallbackTimeout: string; fallbackFailed: string;
  catalogFailed: (name: string) => string;
  pickRepo: string; include: string; why: string;
  keepAwake: string; keepAwakeWork: string; keepAwakeWorkDesc: string;
  lidClosed: string; lidClosedDesc: string;
  setUp: string; setUpDone: string; removeSetup: string;
  setupPending: string; setupRemoteHint: string; setupCancelled: string; setupFailed: string;
  awakeNow: string;
  awakeStatus: (n: number) => string;
  asleepAllowed: string; onBattery: string; powerCaveat: string; powerUnsupported: string; pcSettings: string;
};

export const AUTO_TEXT: Dict<AutoText> = {
  ko: {
    automations: "자동화",
    autoTitle: (name: string) => i18n.t('자동화 · {name}', { name }),
    autoEmpty: "아직 자동화가 없어요",
    autoEmptyHint: "한 줄 지시에서 '매일 …' 처럼 말하거나, 에이전트에게 부탁하면 만들어져요",
    pauseAll: "전체 일시정지",
    autoPausedAll: "모든 자동화가 일시정지돼 있어요",
    groupActive: "활성",
    groupPaused: "일시정지됨",
    runNow: "지금 실행",
    pause: "일시정지",
    resume: "재개",
    deleteAuto: "삭제",
    deleteAutoConfirm: "이 자동화를 삭제할까요? 만든 작업은 남아요",
    rename: "이름 변경",
    madeByAgent: (agent: string) => i18n.t('{agent} 가 만듦', { agent }),
    madeByDispatch: "한 줄 지시로 만듦",
    madeByUser: "직접 만듦",
    nextRun: (t: string) => i18n.t('다음 실행 {t}', { t }),
    noNextRun: "예정 없음",
    lastOk: (t: string) => i18n.t('마지막: 성공 · {t}', { t }),
    lastFailed: (t: string) => i18n.t('마지막: 실패 · {t}', { t }),
    lastCreatedTasks: (n: number) => i18n.t('작업 {n}개 생성', { n }),
    runsToday: (n: number, d: number) => i18n.t('오늘 {n}/{d}회', { n, d }),
    trigSchedule: (cron: string, tz: string) => i18n.t('{cron} ({tz})', { cron, tz }),
    trigOnce: (t: string) => i18n.t('{t} 한 번', { t }),
    trigCommits: (branch: string) => i18n.t('새 커밋 · {branch}', { branch }),
    trigIssues: (labels: string) => i18n.t('새 이슈 · {labels}', { labels }),
    trigCi: "검사 실패",
    trigReviews: "리뷰 코멘트",
    trigTaskEvent: (event: string) => i18n.t('작업 이벤트 · {event}', { event }),
    actTaskCreate: "작업 만들기",
    actPrompt: "에이전트에게 지시",
    actNotify: "알림 보내기",
    stepN: (n: number) => i18n.t('{n}단계', { n }),
    guards: "제한",
    auditLog: "실행 기록",
    autoBadge: "자동",
    pausedByError: "연속 실패로 일시정지됨",
    pausedByLimit: "하루 실행 상한에 도달했어요",
    pausedByServer: "서버에서 자동화가 꺼져 있어요",
    errAutoDisabled: "이 PC 에서는 자동화를 쓸 수 없어요",
    errAutoNotFound: "자동화를 찾을 수 없어요",
    errAutoLimit: "자동화 개수 상한을 넘었어요",
    errAutoLoop: "자동화가 만든 작업에서는 자동화를 만들 수 없어요",
    errAutoDepth: "자동화 연쇄가 너무 깊어요",
    errAutoBad: "자동화 정의가 올바르지 않아요",
    errAutoBusy: "실행 중이라 바꿀 수 없어요",
    dispatch: "한 줄 지시",
    dispatchPlaceholder: "무엇을 어디에 시킬까요?",
    plan: "계획",
    planning: (agent: string) => i18n.t('계획 중 · {agent}', { agent }),
    collecting: (n: number, d: number) => i18n.t('PC 정보 수집 중 ({n}/{d})', { n, d }),
    replan: "다시 계획",
    planSummary: "요약",
    planTasks: "작업",
    planAutomations: "자동화",
    planQuestions: "확인이 필요해요",
    simpleMatch: "간단 매칭",
    fallbackNoAgent: "로그인된 에이전트 CLI 가 없어 이름으로 골랐어요",
    fallbackTimeout: "계획이 늦어져 이름으로 골랐어요",
    fallbackFailed: "계획에 실패해 이름으로 골랐어요",
    catalogFailed: (name: string) => i18n.t('{name} 정보를 가져오지 못했어요', { name }),
    pickRepo: "저장소를 골라 주세요",
    include: "포함",
    why: "이유",
    keepAwake: "PC 깨어 있기",
    keepAwakeWork: "작업 중에는 잠자기 방지",
    keepAwakeWorkDesc: "에이전트가 작업하는 동안 PC 가 잠들지 않아요",
    lidClosed: "덮개를 닫아도 계속 작업",
    lidClosedDesc: "관리자 암호로 1회 설정이 필요해요",
    setUp: "설정하기",
    setUpDone: "설정됨",
    removeSetup: "해제",
    setupPending: "PC 화면의 암호 창을 확인하세요",
    setupRemoteHint: "암호 입력 창은 그 PC 화면에 떠요. PC 앞에서 진행하세요",
    setupCancelled: "설정이 취소됐어요",
    setupFailed: "설정에 실패했어요",
    awakeNow: "깨어 있음",
    awakeStatus: (n: number) => i18n.t('지금: 깨어 있음 · 작업 {n}개', { n }),
    asleepAllowed: "지금: 잠자기 허용",
    onBattery: "배터리 전원에서는 덮개 닫힘 유지가 꺼져요",
    powerCaveat: "덮개를 닫은 채 계속 실행하면 발열이 늘고 배터리가 빨리 닳아요. 전원 어댑터를 연결하고 통풍이 되는 곳에 두세요",
    powerUnsupported: "이 PC 에서는 지원되지 않아요",
    pcSettings: "PC 설정",
  },
};
