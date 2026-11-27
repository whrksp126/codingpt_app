// channelService.ts — 알림 채널 REST(/api/channels). 정본 = codingpt_back/services/channelService.js.
//  다른 서비스가 웹훅으로 보낸 알림이 채널(대화방)에 쌓이고, 그 방에서 PC 의 에이전트에게 바로 일을 시킨다.
import { apiRequest } from '../utils/api';

export type ChannelLevel = 'info' | 'success' | 'warning' | 'error' | 'critical';
export type AgentMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk';
export interface Channel {
  id: number; name: string; description: string | null; webhookUrl: string;
  deviceId: number | null; cwd: string | null; agent: string; agentMode: AgentMode; useWorktree: boolean;
  muted: boolean; createdVia: 'app' | 'api'; threadId: string | null; agentState: string | null;
  unreadCount: number; lastMessageAt: string | null; lastPreview: string | null; lastLevel: ChannelLevel | null; createdAt: string;
  soul?: string | null; memory?: string | null; template?: string | null; webhookSecret?: string | null; firstRun?: boolean;
}
export interface ChannelRequest {
  id: string; kind: 'permission' | 'question' | 'plan'; tool: string | null; summary: string; detail: string;
  questions: { question: string; options?: { label: string }[] }[] | null; plan: string | null; alwaysLabel: string | null; status: string;
}
export interface ChannelMessage {
  id: number; channelId: number; role: 'event' | 'user' | 'agent' | 'system'; level: ChannelLevel | null;
  title: string | null; body: string | null; url: string | null; fields: { label: string; value: string }[] | null;
  source: string | null; dedupeKey: string | null; repeatCount: number; threadId: string | null;
  meta: ({ request?: ChannelRequest; requestId?: string; event?: string; refs?: number[]; tools?: number; code?: string } & Record<string, any>) | null;
  createdAt: string; updatedAt: string;
}
export type ChannelInput = Partial<Pick<Channel, 'name' | 'description' | 'deviceId' | 'cwd' | 'agent' | 'agentMode' | 'useWorktree' | 'muted'>>;

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: any, timeoutMs = 20000): Promise<T> {
  const r = await apiRequest<T>(`/api/channels${path}`, { method, body, timeoutMs, silent: true } as any);
  if (!r.success) throw Object.assign(new Error(r.error || 'request failed'), { code: (r as any).code });
  return r.data as T;
}

export const listChannels = () => call<{ channels: Channel[] }>('GET', '');
export const createChannel = (input: ChannelInput) => call<{ channel: Channel }>('POST', '', input);
export const updateChannel = (id: number, input: ChannelInput) => call<{ channel: Channel }>('PATCH', `/${id}`, input);
export const deleteChannel = (id: number) => call<{ ok: boolean }>('DELETE', `/${id}`);
export const rotateToken = (id: number) => call<{ channel: Channel }>('POST', `/${id}/token`);
export const markChannelRead = (id: number) => call<{ channel: Channel }>('POST', `/${id}/read`);
export const sendTest = (id: number) => call<{ messageId: number }>('POST', `/${id}/test`);
export const listMessages = (id: number, q: { before?: number; after?: number; limit?: number } = {}) => {
  const qs = Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join('&');
  return call<{ channel: Channel; messages: ChannelMessage[]; hasMore: boolean }>('GET', `/${id}/messages${qs ? '?' + qs : ''}`);
};
/** AI 에게 지시. refs = 함께 넘길 알림 id(없으면 지난 지시 뒤에 온 알림을 서버가 붙인다). */
export const sendToAgent = (id: number, text: string, refs?: number[], clientId?: string) =>
  call<{ message: ChannelMessage; channel: Channel }>('POST', `/${id}/messages`, { text, refs, clientId }, 70000);
export const newConversation = (id: number) => call<{ channel: Channel }>('POST', `/${id}/conversation`);
export const respondRequest = (id: number, requestId: string, body: { decision: 'allow' | 'deny' | 'answer'; message?: string; answers?: Record<string, string>; always?: boolean }) =>
  call<any>('POST', `/${id}/requests/${encodeURIComponent(requestId)}`, body);
export const interruptAgent = (id: number) => call<any>('POST', `/${id}/interrupt`);

// ── 봇(2026-11-27) — 할 일 · 자동화 · 템플릿 · MCP(PC 의 claude) ─────────────────────
export type ItemStatus = 'needs_you' | 'in_progress' | 'waiting' | 'planned' | 'done' | 'canceled';
export interface BotItem {
  id: number; channelId: number; number: number; title: string; status: ItemStatus;
  doneMeans: string | null; description: string | null;
  ask: { question: string; options: string[]; recommended: number | null } | null;
  notes: { at: string; actor: 'bot' | 'owner' | 'system'; text: string }[];
  dedupeKey: string | null; url: string | null; sourceMessageId: number | null;
  createdAt: string; updatedAt: string; closedAt: string | null;
}
export interface BotAutomation {
  id: number; channelId: number; name: string; kind: 'event' | 'schedule';
  schedule: { days: number[]; time: string; tz: string } | null;
  filter: { minLevel: ChannelLevel; provider?: string; source?: string } | null;
  prompt: string; enabled: boolean; lastRunAt: string | null; nextRunAt: string | null; runCount: number;
}
export interface BotTemplate { id: string; name: string; line: string; events: string[]; schedules: string[]; mcp: string[] }
export interface McpCatalogEntry { id: string; name: string; url: string; what: string; transport?: 'http' | 'sse' }
export interface McpServer { name: string; url: string | null; command: string | null; transport: string; status: 'connected' | 'needs_auth' | 'failed' | 'pending' | 'unknown' }
export type BotInput = ChannelInput & { template?: string; tz?: string; soul?: string | null; memory?: string | null; webhookSecret?: string | boolean | null };

export const createBot = (input: BotInput) => call<{ channel: Channel }>('POST', '', input);
export const updateBot = (id: number, input: BotInput) => call<{ channel: Channel }>('PATCH', `/${id}`, input);
export const botTemplates = () => call<{ templates: BotTemplate[]; mcp: McpCatalogEntry[] }>('GET', '/templates');
export const listItems = (id: number, all = false) => call<{ items: BotItem[] }>('GET', `/${id}/items${all ? '?all=1' : ''}`);
export const answerItem = (id: number, n: number, body: { text?: string; status?: ItemStatus }) =>
  call<{ item: BotItem }>('POST', `/${id}/items/${n}/answer`, body, 30000);
export const listAutomations = (id: number) => call<{ automations: BotAutomation[] }>('GET', `/${id}/automations`);
export const createAutomation = (id: number, body: Partial<BotAutomation>) => call<{ automation: BotAutomation }>('POST', `/${id}/automations`, body);
export const updateAutomation = (id: number, aid: number, body: Partial<BotAutomation>) => call<{ automation: BotAutomation }>('PATCH', `/${id}/automations/${aid}`, body);
export const deleteAutomation = (id: number, aid: number) => call<{ ok: boolean }>('DELETE', `/${id}/automations/${aid}`);
export const runAutomation = (id: number, aid: number) => call<any>('POST', `/${id}/automations/${aid}/run`, undefined, 60000);

/** PC 의 claude 에 붙은 MCP(데몬 mcp.*) — /api/daemon/mcp. hostDeviceId = 그 PC. */
export async function mcpRpc<T = any>(hostDeviceId: number, method: string, params: Record<string, unknown> = {}, timeoutMs = 100000): Promise<T> {
  const r = await apiRequest<T>('/api/daemon/mcp', { method: 'POST', body: { method, params, hostDeviceId }, timeoutMs, silent: true } as any);
  if (!r.success) throw Object.assign(new Error(r.error || 'request failed'), { code: (r as any).code || (r as any).detail?.code });
  return r.data as T;
}
