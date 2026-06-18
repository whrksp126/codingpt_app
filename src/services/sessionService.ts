import { apiRequest } from '../utils/api';
import { AgentMsg, SessionMeta, SessionDetail } from '../types/agentSession';

// 워크스페이스 하위 세션(채팅) — 백엔드 /api/workspaces/:wsId/sessions (objectstore 영속화).
// apiRequest 는 { success, data } 래퍼를 돌려주므로 여기서 data 를 언랩해 반환한다.

async function unwrap<T>(p: Promise<{ success: boolean; data?: T; message?: string }>, fail: string): Promise<T> {
  const r = await p;
  if (!r.success || !r.data) throw new Error(r.message || fail);
  return r.data;
}

const base = (wsId: string) => `/api/workspaces/${wsId}/sessions`;

/** 워크스페이스의 세션 목록(최신 수정순) */
export const listSessions = (workspaceId: string): Promise<SessionMeta[]> =>
  unwrap(apiRequest<{ sessions: SessionMeta[] }>(base(workspaceId), { method: 'GET' }), '세션을 불러올 수 없습니다.').then((d) => d.sessions);

/** 세션 생성 */
export const createSession = (workspaceId: string, title?: string): Promise<SessionMeta> =>
  unwrap(apiRequest<{ session: SessionMeta }>(base(workspaceId), { method: 'POST', body: { title } }), '세션을 만들 수 없습니다.').then((d) => d.session);

/** 세션 상세(메타 + 메시지) */
export const getSession = (workspaceId: string, sessionId: string): Promise<SessionDetail> =>
  unwrap(apiRequest<SessionDetail>(`${base(workspaceId)}/${sessionId}`, { method: 'GET' }), '세션을 찾을 수 없습니다.');

/** 세션 갱신 — title/sdkSessionId/messages 패치 */
export const updateSession = (
  workspaceId: string,
  sessionId: string,
  patch: { title?: string; sdkSessionId?: string; messages?: AgentMsg[] },
): Promise<SessionMeta> =>
  unwrap(apiRequest<{ session: SessionMeta }>(`${base(workspaceId)}/${sessionId}`, { method: 'PATCH', body: patch }), '세션을 수정할 수 없습니다.').then((d) => d.session);

/** 세션 삭제 */
export const deleteSession = (workspaceId: string, sessionId: string) =>
  unwrap(apiRequest<{ id: string; deleted: number }>(`${base(workspaceId)}/${sessionId}`, { method: 'DELETE' }), '세션 삭제에 실패했습니다.');

export default {
  listSessions,
  createSession,
  getSession,
  updateSession,
  deleteSession,
};
