// issueSave.ts — 이슈 자동 저장의 배관(RPC·초안 보관·닫힌 뒤 마무리). 규칙 자체는 issuesAutosave.ts(순수)가 쥔다.
//  PC 의 같은 자리 = codingpt_pc/src/js/issues-view.js 의 saverRpc · resumeDraft · finalize.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createIssue, updateIssue, deleteIssue, detachIssue, type Issue, type IssueAttachment } from '../../services/issueService';
import { patchIssue } from './useIssues';
import { createAutosaver, displayTitle, isBlank, type Autosaver, type SaveFields } from './issuesAutosave';

/** 닫힌 뒤에도 저장이 덜 끝난 것(오프라인 등) — id | 'new' → { saver, host }. 다시 열면 그 글을 이어받는다. */
export const lingering = new Map<string, { saver: Autosaver; host: number }>();
export function dropLingering(saver: Autosaver): void { for (const [k, v] of lingering) if (v.saver === saver) lingering.delete(k); }

// ── 아직 이슈가 못 된 새 초안(만들기가 실패한 채 앱이 꺼져도 남는다) ──
const DRAFT_KEY = 'cpt.issues.draft';
export function writeDraft(host: number, f: SaveFields | null): void {
  const job = f && !isBlank(f) ? AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ h: host, fields: f, at: Date.now() })) : AsyncStorage.removeItem(DRAFT_KEY);
  job.catch(() => { /* 저장 못 해도 화면은 돈다 */ });
}
async function readDraft(host: number): Promise<SaveFields | null> {
  try {
    const j = JSON.parse((await AsyncStorage.getItem(DRAFT_KEY)) || 'null');
    return j && Number(j.h) === Number(host) && j.fields && !isBlank(j.fields) ? (j.fields as SaveFields) : null;
  } catch (_) { return null; }
}

/** 자동 저장이 부르는 RPC 두 개. 제목 없는 초안을 모르는 옛 PC 앱(BAD_PARAMS)에는 보이는 제목을 대신 적어 보낸다. */
export function saverRpc(host: number, ext: boolean, untitled: string, onIssue?: (x: Issue) => void) {
  const safe = async (f: Partial<SaveFields>, call: (g: Partial<SaveFields>) => Promise<{ issue: Issue }>) => {
    try { return await call(f); } catch (e: any) {
      if (!(e && e.code === 'BAD_PARAMS') || f.title !== '' || ext) throw e;
      return call({ ...f, title: displayTitle(f, untitled) });
    }
  };
  const done = (r: { issue: Issue } | null | undefined) => {
    if (!r || !r.issue) throw new Error('NO_ISSUE');
    patchIssue(host, r.issue);
    if (onIssue) onIssue(r.issue);
    return { id: r.issue.id, rev: r.issue.updatedAt || 0 };
  };
  return {
    create: async (f: SaveFields) => done(await safe(f, (g) => createIssue(host, { ...(f as any), ...g, provider: 'codingpt', draft: true }))),
    update: async (id: string, patch: Partial<SaveFields>) => done(await safe(patch, (g) => updateIssue(host, id, g as any))),
  };
}

/** 앱을 다시 켰을 때 — 이슈가 못 된 초안이 남아 있으면 조용히 이슈로 만든다(열면 목록에 있다). */
export async function resumeDraft(host: number, untitled: string): Promise<void> {
  if (!host || lingering.has('new')) return;
  const f = await readDraft(host);
  if (!f || lingering.has('new')) return;
  const rpc = saverRpc(host, false, untitled);
  const saver: Autosaver = createAutosaver({ fields: f, create: rpc.create, update: rpc.update,
    onStatus: (s) => { if (s === 'saved') { saver.dispose(); dropLingering(saver); } }, onCreated: () => writeDraft(host, null) });
  lingering.set('new', { saver, host });
  saver.set(f);
  void saver.flush();
}

/**
 * 화면이 닫혔다 — 남은 저장을 끝낸다(화면은 이미 사라졌다).
 *  · 이 화면에서 만들었는데 끝내 아무것도 안 남겼으면 빈 이슈를 지운다.
 *  · 본문에서 지운 그림은 첨부에서도 뺀다(이 화면에서 본 그림만 — 처음부터 자리가 없던 첨부는 건드리지 않는다).
 *  · 저장이 안 됐으면 입력을 쥔 채 뒤에서 계속 다시 보낸다(→ false).
 */
export async function finalizeSave(o: { host: number; saver: Autosaver; createdHere: boolean; atts: IssueAttachment[]; seenImgs: Set<string> }): Promise<boolean> {
  const { host, saver } = o;
  const r = await saver.flush();
  if (!r.ok) { lingering.set(r.id || 'new', { saver, host }); return false; }
  if (r.id) {
    const f = saver.fields();
    if (o.createdHere && isBlank(f) && !o.atts.length) { try { await deleteIssue(host, r.id); patchIssue(host, null, r.id); } catch (_) { /* 남으면 목록에서 지울 수 있다 */ } }
    else for (const a of o.atts.filter((y) => y.image && o.seenImgs.has(y.id) && !f.body.includes(`(att:${y.id})`))) {
      try { const rr = await detachIssue(host, r.id, a.id); if (rr?.issue) patchIssue(host, rr.issue); } catch (_) { /* 첨부로 남는다 */ }
    }
  } else writeDraft(host, null);
  saver.dispose();
  return true;
}
