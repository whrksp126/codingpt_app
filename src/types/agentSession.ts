// 워크스페이스 세션(채팅) 공용 타입 — 컨텍스트/서비스/화면 단일 소스.

// 채팅 메시지 — 에이전트 이벤트가 렌더되는 단위(MobileIDE AgentPanel 과 동일 형태).
export type AgentMsg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'thinking'; text: string }
  | { id: string; role: 'tool'; tool: string; relPath?: string; command?: string; ok?: boolean; output?: string };

// 세션 메타(목록용) — 백엔드 meta.json 과 동일
export interface SessionMeta {
  id: string;
  title: string;
  sdkSessionId: string | null;
  preview: string;
  msgCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// 세션 상세 — 메타 + 메시지
export interface SessionDetail {
  meta: SessionMeta;
  messages: AgentMsg[];
}
