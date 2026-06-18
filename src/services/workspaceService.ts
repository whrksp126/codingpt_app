import { apiRequest } from '../utils/api';

// 바이브코딩 사용자 워크스페이스 — 백엔드 /api/workspaces (objectstore 기반).
// 저장 위치(내부): codingpt/execute/workspace/<userId>/projects/<workspaceId>/project.json
//   ※ objectstore 내부 세그먼트는 호환을 위해 projects/project.json 유지 — 표현만 "워크스페이스".
// apiRequest 는 { success, data } 래퍼를 돌려주므로 여기서 data 를 언랩해 반환한다.

export type WorkspaceThumb = 'list' | 'page' | 'chart';
export type WorkspaceKind = 'chat' | 'project';

export interface WorkspaceMeta {
  id: string;
  name: string;
  description: string;
  stack: string[];
  thumb: WorkspaceThumb;
  kind: WorkspaceKind;          // 'chat'=일반 채팅 전용, 'project'=바이브코딩
  unread: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateWorkspaceInput {
  name?: string;
  description?: string;
  stack?: string[];
  thumb?: WorkspaceThumb;
  kind?: WorkspaceKind;
}

async function unwrap<T>(p: Promise<{ success: boolean; data?: T; message?: string }>, fail: string): Promise<T> {
  const r = await p;
  if (!r.success || !r.data) throw new Error(r.message || fail);
  return r.data;
}

/** 내 워크스페이스 목록(최신 수정순) */
export const listWorkspaces = () =>
  unwrap(apiRequest<{ workspaces: WorkspaceMeta[] }>('/api/workspaces', { method: 'GET' }), '워크스페이스를 불러올 수 없습니다.');

/** 워크스페이스 생성 — 폴더(메타) 생성 */
export const createWorkspace = (input: CreateWorkspaceInput = {}) =>
  unwrap(apiRequest<{ workspace: WorkspaceMeta }>('/api/workspaces', { method: 'POST', body: input }), '워크스페이스를 만들 수 없습니다.');

/** 단일 워크스페이스 메타 */
export const getWorkspace = (workspaceId: string) =>
  unwrap(apiRequest<{ workspace: WorkspaceMeta }>(`/api/workspaces/${workspaceId}`, { method: 'GET' }), '워크스페이스를 찾을 수 없습니다.');

/** 이름 변경 등 메타 패치 */
export const updateWorkspace = (workspaceId: string, patch: Partial<CreateWorkspaceInput> & { unread?: number }) =>
  unwrap(apiRequest<{ workspace: WorkspaceMeta }>(`/api/workspaces/${workspaceId}`, { method: 'PATCH', body: patch }), '워크스페이스를 수정할 수 없습니다.');

/** 워크스페이스 복제 */
export const duplicateWorkspace = (workspaceId: string) =>
  unwrap(apiRequest<{ workspace: WorkspaceMeta }>(`/api/workspaces/${workspaceId}/duplicate`, { method: 'POST' }), '복제에 실패했습니다.');

/** 워크스페이스 삭제 */
export const deleteWorkspace = (workspaceId: string) =>
  unwrap(apiRequest<{ id: string; deleted: number }>(`/api/workspaces/${workspaceId}`, { method: 'DELETE' }), '삭제에 실패했습니다.');

/** 설명 → 워크스페이스 이름 후보 추천(신규 생성 플로우) */
export const suggestWorkspaceNames = (description: string): Promise<string[]> =>
  unwrap(apiRequest<{ names: string[] }>('/api/workspaces/suggest-name', { method: 'POST', body: { description } }), '이름 추천에 실패했습니다.').then((d) => d.names);

export default {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  duplicateWorkspace,
  deleteWorkspace,
  suggestWorkspaceNames,
};
