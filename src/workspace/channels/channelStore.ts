// channelStore.ts — 알림 채널 사본 + 화면 열림 상태(모듈 스토어). 정본은 back(REST), 실시간은 channel_event 힌트.
//  여는 쪽 = 사이드바 "알림 채널" 행 · 푸시 딥링크 codingpt://channel/<id> · 알림 패널 행.
import { useSyncExternalStore } from 'react';
import * as api from '../../services/channelService';
import type { Channel, ChannelMessage } from '../../services/channelService';

type State = {
  open: boolean;
  selected: number | null;             // 열린 채널(null = 목록)
  channels: Channel[];
  loaded: boolean;
  messages: Record<number, ChannelMessage[]>;
  hasMore: Record<number, boolean>;
  activity: Record<number, { state: string | null; text: string | null }>;
  version: number;
};
const S: State = { open: false, selected: null, channels: [], loaded: false, messages: {}, hasMore: {}, activity: {}, version: 0 };
const listeners = new Set<() => void>();
function emit() { S.version += 1; listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }
export function subscribeChannels(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getChannels(): State { return S; }
export function useChannels(): State { useSyncExternalStore(subscribeChannels, () => S.version); return S; }

// ── 열고 닫기 ──
let backFn: (() => boolean) | null = null;
export function setChannelsBackHandler(fn: (() => boolean) | null): void { backFn = fn; }
export function handleChannelsBack(): boolean { return S.open && backFn ? backFn() : false; }
export function openChannels(channelId?: number | null): void {
  S.open = true;
  if (channelId != null) S.selected = channelId;
  emit();
  void refreshChannels();
  if (channelId != null) void loadMessages(channelId);
}
export function closeChannels(): void { if (S.open) { S.open = false; S.selected = null; emit(); } }
export function selectChannel(id: number | null): void {
  S.selected = id; emit();
  if (id != null) void loadMessages(id);
}

// ── 데이터 ──
function upsertChannel(ch: Channel) {
  const i = S.channels.findIndex((c) => c.id === ch.id);
  //  보고 있는 방에 온 새 글은 읽은 것으로 친다(서버 읽음은 화면이 따로 보낸다)
  const c = S.open && S.selected === ch.id ? { ...ch, unreadCount: 0 } : ch;
  if (i >= 0) S.channels = S.channels.map((x) => (x.id === ch.id ? c : x));
  else S.channels = [c, ...S.channels];
  S.channels = [...S.channels].sort((a, b) => (Date.parse(b.lastMessageAt || b.createdAt) || 0) - (Date.parse(a.lastMessageAt || a.createdAt) || 0));
}
export async function refreshChannels(): Promise<void> {
  try { const r = await api.listChannels(); S.channels = r.channels || []; S.loaded = true; emit(); } catch (_) { S.loaded = true; emit(); }
}
export async function loadMessages(id: number): Promise<void> {
  try {
    const r = await api.listMessages(id, { limit: 60 });
    S.messages = { ...S.messages, [id]: r.messages };
    S.hasMore = { ...S.hasMore, [id]: r.hasMore };
    upsertChannel(r.channel);
    if (r.channel.agentState && !S.activity[id]) S.activity = { ...S.activity, [id]: { state: r.channel.agentState, text: null } };
    emit();
    if (r.channel.unreadCount) void api.markChannelRead(id).catch(() => { /* 표시용 */ });
  } catch (_) { /* 다음 열기에 다시 */ }
}
export async function loadOlder(id: number): Promise<void> {
  const cur = S.messages[id] || [];
  if (!cur.length || !S.hasMore[id]) return;
  try {
    const r = await api.listMessages(id, { before: cur[0].id, limit: 60 });
    S.messages = { ...S.messages, [id]: [...r.messages, ...(S.messages[id] || [])] };
    S.hasMore = { ...S.hasMore, [id]: r.hasMore };
    emit();
  } catch (_) { /* noop */ }
}
export function putMessage(m: ChannelMessage): void {
  const list = S.messages[m.channelId];
  if (!list) return;   // 아직 안 연 방 — 열 때 읽는다
  const i = list.findIndex((x) => x.id === m.id);
  S.messages = { ...S.messages, [m.channelId]: i >= 0 ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m].sort((a, b) => a.id - b.id) };
}
export function putChannel(ch: Channel): void { upsertChannel(ch); emit(); }
export function dropChannel(id: number): void {
  S.channels = S.channels.filter((c) => c.id !== id);
  if (S.selected === id) S.selected = null;
  emit();
}
export function totalUnread(): number { return S.channels.reduce((n, c) => n + (c.muted ? 0 : c.unreadCount || 0), 0); }

/** channel_event(notificationService 가 넘긴다). */
export function onChannelEvent(ev: any): void {
  if (!ev || typeof ev !== 'object') return;
  if (ev.kind === 'message' && ev.message) {
    putMessage(ev.message);
    if (ev.channel) upsertChannel(ev.channel);
    if (S.open && S.selected === ev.channelId && ev.channel?.unreadCount) void api.markChannelRead(ev.channelId).catch(() => { /* noop */ });
    if (ev.message.role === 'agent') S.activity = { ...S.activity, [ev.channelId]: { state: S.activity[ev.channelId]?.state || null, text: null } };
    emit();
  } else if (ev.kind === 'channel' && ev.channel) {
    upsertChannel(ev.channel); emit();
  } else if (ev.kind === 'channel_removed') {
    dropChannel(Number(ev.channelId));
  } else if (ev.kind === 'agent' && ev.channelId != null) {
    S.activity = { ...S.activity, [ev.channelId]: { state: ev.state || null, text: ev.activity || null } };
    S.channels = S.channels.map((c) => (c.id === ev.channelId ? { ...c, agentState: ev.state || null } : c));
    emit();
  }
}
export function resetChannels(): void {
  Object.assign(S, { open: false, selected: null, channels: [], loaded: false, messages: {}, hasMore: {}, activity: {} });
  emit();
}
