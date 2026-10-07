// issueService.ts — 이슈(Tasks) RPC(orch.issue*). 정본 = codingpt_daemon/packages/runner-core/issues.js.
//  이슈는 그 PC 에 산다(자체 이슈는 PC 의 issues.json, 외부 이슈는 그 PC 의 gh 가 읽는다) → 고른 PC 에 묻는다.
//  전송은 오케스트레이션과 같은 통로(/api/daemon/orch — 봉인 우선).
import { orchRpc } from './orchService';

export type IssueStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type IssuePriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type IssueMode = 'task' | 'terminal' | 'orch';
export interface IssueAttachment { id: string; name: string; ext?: string; mime?: string; size?: number; path?: string; image?: boolean }
export interface Issue {
  id: string; number: number; key: string; title: string; body: string; status: IssueStatus; priority: IssuePriority;
  labels: string[]; cwd: string; source: { provider: string; url: string | null; repo: string | null };
  link: { mode: IssueMode; cwd: string; agent: string; taskId?: string | null; tid?: number | null; startedAt?: number } | null;
  attachments: IssueAttachment[]; createdAt: number; updatedAt: number;
}
export interface IssueSource { provider: string; cwd: string | null; ok: boolean; error?: string | null }
export interface IssueList { issues: Issue[]; sources: IssueSource[]; at?: number }
export type IssueFields = { title: string; body: string; status: IssueStatus; priority: IssuePriority; cwd: string; labels?: string };

const T = 45000;
export const listIssues = (host: number, cwds: string[], fresh = false) => orchRpc<IssueList>('orch.issueList', { cwds, fresh }, host, T);
/** draft = 자동 저장 초안(제목 없이도 자체 이슈를 만든다 — 그 밖에는 제목이 있어야 한다). */
export const createIssue = (host: number, f: IssueFields & { provider: string; draft?: boolean }) => orchRpc<{ issue: Issue }>('orch.issueCreate', f, host, T);
export const updateIssue = (host: number, id: string, f: Partial<IssueFields>) => orchRpc<{ issue: Issue }>('orch.issueUpdate', { id, ...f }, host, T);
export const deleteIssue = (host: number, id: string) => orchRpc('orch.issueDelete', { id }, host, T);
export const startIssue = (host: number, id: string, mode: IssueMode, agent: string, cwd: string) =>
  orchRpc<{ issue: Issue; started: { mode: IssueMode; taskId: string | null; tid: number | null; cwd: string } }>('orch.issueStart', { id, mode, agent, cwd }, host, 90000);
export const attachIssue = (host: number, id: string, path: string, attId: string, name?: string) =>
  orchRpc<{ issue: Issue }>('orch.issueAttach', { id, path, attId, ...(name ? { name } : {}) }, host, T);
export const detachIssue = (host: number, id: string, attId: string) => orchRpc<{ issue: Issue }>('orch.issueDetach', { id, attId }, host, T);
