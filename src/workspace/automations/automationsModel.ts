// automationsModel.ts — 자동화 목록의 순수 로직(행·그룹·정렬·주의 판정).
//
// 정본: codingpt_daemon/docs/automation-design.md §8.2. PC 미러 = codingpt_pc/src/js/automations-model.js.
//  **같은 입력에 같은 출력** — 교차 테스트는 docs/fixtures/automation/auto-*.json 한 벌로 양쪽을 돌린다.
//
// 규율:
//  · React·네트워크·시계를 import 하지 않는다. 시간은 `input.now` 로만(결정적 테스트).
//  · 전체 일시정지(input.paused)·PC 오프라인(hostOnline)은 행의 group/dot 을 바꾸지 않는다 — 배너·헤더의 몫.
//  · 트리거 문장은 여기서 만들지 않는다 — 클라가 `tt(triggerKey, triggerVars)` 로 그린다(cron 은 원문 그대로).
//  · 동률 비교는 코드포인트(localeCompare 금지 — 런타임마다 결과가 다르다).

import type { AutomationLite, Trigger } from '../../services/automationService';

export type TriggerKey = 'trigSchedule' | 'trigOnce' | 'trigCommits' | 'trigIssues' | 'trigCi' | 'trigReviews' | 'trigTaskEvent';
export type AutoDot = 'error' | 'spin' | 'none';

export interface AutoInput {
  now: number;
  tz?: string;
  items: AutomationLite[];
  paused: boolean;
  hostOnline: boolean;
}
export interface AutoRow {
  id: string;
  name: string;
  creator: 'agent' | 'dispatch' | 'user';
  creatorAgent: string | null;
  triggerKey: TriggerKey;
  triggerVars: { cron?: string; tz?: string; at?: number; branch?: string; repo?: string | null; labels?: string; event?: string };
  dot: AutoDot;
  attention: boolean;
  group: 'active' | 'paused';
  nextRunAt: number | null;
  lastOk: boolean | null;
  lastAt: number | null;
  lastCode: string | null;
  taskIds: string[];
  runsToday: number;
  maxRunsPerDay: number;
  sortAt: number;
  /** 원본(상세·행동용). */
  item: AutomationLite;
}
export interface AutoOutput {
  rows: AutoRow[];
  groups: { active: AutoRow[]; paused: AutoRow[] };
  counts: { total: number; paused: number; attention: number };
}

const num = (v: unknown, d = 0): number => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const cp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function triggerKeyOf(t: Trigger | null | undefined): TriggerKey {
  switch (t?.type) {
    case 'schedule': return (t as { cron?: string }).cron ? 'trigSchedule' : 'trigOnce';
    case 'git.commits': return 'trigCommits';
    case 'github.issues': return 'trigIssues';
    case 'pr.ci_failed': return 'trigCi';
    case 'pr.review_comments': return 'trigReviews';
    case 'task.event': return 'trigTaskEvent';
    default: return 'trigSchedule';
  }
}

export function triggerVarsOf(t: Trigger | null | undefined): AutoRow['triggerVars'] {
  const x = (t || {}) as any;
  const v: AutoRow['triggerVars'] = {};
  if (typeof x.cron === 'string') v.cron = x.cron;
  if (typeof x.tz === 'string') v.tz = x.tz;
  if (x.at != null) v.at = num(x.at);
  if (typeof x.branch === 'string') v.branch = x.remote ? `${x.remote}/${x.branch}` : x.branch;
  if ('repo' in x) v.repo = x.repo == null ? null : String(x.repo);
  if (Array.isArray(x.labels)) v.labels = x.labels.map(String).join(', ');
  if (typeof x.event === 'string') v.event = x.event;
  return v;
}

/** 주의가 필요한가(§8.2) — 에러/상한으로 멈춤 ‖ 마지막 실행 실패 ‖ 연속 실패가 남아 있음. */
export function isAttention(it: AutomationLite): boolean {
  const s = it.state || ({} as AutomationLite['state']);
  return it.pausedReason === 'error' || it.pausedReason === 'limit'
    || (s.lastResult ? s.lastResult.ok === false : false)
    || num(s.consecutiveFailures) > 0;
}

export function buildAutomationsModel(input: AutoInput): AutoOutput {
  const items = (input && Array.isArray(input.items) ? input.items : []).filter((x) => x && typeof x.id === 'string');
  const rows: AutoRow[] = items.map((it) => {
    const s = it.state || ({} as AutomationLite['state']);
    const att = isAttention(it);
    const group: AutoRow['group'] = it.paused || !it.enabled ? 'paused' : 'active';
    const last = s.lastResult || null;
    const nextRunAt = s.nextRunAt == null ? null : num(s.nextRunAt);
    const kind = it.createdBy?.kind;
    return {
      id: it.id,
      name: String(it.name || ''),
      creator: kind === 'agent' || kind === 'dispatch' ? kind : 'user',
      creatorAgent: it.createdBy?.agent || null,
      triggerKey: triggerKeyOf(it.trigger),
      triggerVars: triggerVarsOf(it.trigger),
      dot: att ? 'error' : num(s.inflight) > 0 ? 'spin' : 'none',
      attention: att,
      group,
      nextRunAt,
      lastOk: last ? last.ok !== false : null,
      lastAt: last && last.at != null ? num(last.at) : null,
      lastCode: last && last.code ? String(last.code) : null,
      taskIds: last && Array.isArray(last.taskIds) ? last.taskIds.map(String) : [],
      runsToday: num(s.runsToday),
      maxRunsPerDay: num(it.guards?.maxRunsPerDay, 10),
      sortAt: group === 'paused' ? num(it.updatedAt) : (nextRunAt ?? 0),
      item: it,
    };
  });
  const active = rows.filter((r) => r.group === 'active').sort((a, b) =>
    (Number(b.attention) - Number(a.attention))
    || (a.nextRunAt == null ? (b.nextRunAt == null ? 0 : 1) : b.nextRunAt == null ? -1 : a.nextRunAt - b.nextRunAt)
    || cp(a.name, b.name) || cp(a.id, b.id));
  const paused = rows.filter((r) => r.group === 'paused').sort((a, b) =>
    (num(b.item.updatedAt) - num(a.item.updatedAt)) || cp(a.name, b.name) || cp(a.id, b.id));
  const all = [...active, ...paused];
  return {
    rows: all,
    groups: { active, paused },
    counts: { total: all.length, paused: paused.length, attention: all.filter((r) => r.attention).length },
  };
}

/** 픽스처 대조용 요약 — PC automations-model.js summarizeAuto() 와 같은 모양(auto-*.json 의 expect). */
export function summarizeAuto(out: AutoOutput): { rows: { id: string; group: string; dot: string; attention: boolean; triggerKey: string }[]; counts: AutoOutput['counts'] } {
  return {
    rows: out.rows.map((r) => ({ id: r.id, group: r.group, dot: r.dot, attention: r.attention, triggerKey: r.triggerKey })),
    counts: { ...out.counts },
  };
}
