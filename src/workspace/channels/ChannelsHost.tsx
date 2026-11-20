// ChannelsHost — "알림 채널" 장소. 셸(RootNavigator ShellLayout)에 1회 마운트, channelStore.openChannels() 로 연다.
//
// 다른 서비스(서버·배치·CI)가 웹훅으로 보낸 알림이 채널(대화방)에 쌓인다. 개발자는 그 방에서 바로
//  PC 의 에이전트에게 "고쳐 줘" 라고 시킨다 — 에이전트는 채널에 묶인 PC·폴더에서 일하고 답·승인 요청이 같은 방에 올라온다.
//  · 목록: 채널마다 마지막 알림·미읽음. 위에 만들기.
//  · 방: 알림 카드(심각도·본문·필드·링크·반복 횟수) / 내 지시 / AI 답 / 승인 요청 카드(허용·거절). 아래 입력칸 = AI 에게.
//  · 설정 시트: 이름·일할 PC·폴더·모드·worktree·무음. 연동 시트: 웹훅 URL·에이전트용 안내문 복사·테스트 알림.
// 색 규율: 심각도 색은 상태 신호라 쓴다(빨강=오류·주황=경고·초록=해결). 그 밖의 강조는 무채색 명암으로만.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Clipboard, Linking, RefreshControl, Keyboard, AppState } from 'react-native';
import ReAnimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SidebarSimple, Plus, CaretLeft, DotsThree, ArrowUp, X, Copy, ArrowSquareOut, Sparkle, Stop, ChatCircleText,
  Laptop, Folder, BellSlash, Check, Broadcast, Link as LinkIcon,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { PressableRow, IconButton, Button, Sheet, Seg, PressableScale, Toggle } from '../../components/ui';
import { showAppAlert } from '../../components/AppAlert';
import { useDrawer } from '../../contexts/DrawerContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';
import ChatMarkdown from '../chat/ChatMarkdown';
import * as api from '../../services/channelService';
import type { Channel, ChannelMessage, ChannelLevel, AgentMode } from '../../services/channelService';
import {
  useChannels, closeChannels, selectChannel, setChannelsBackHandler, refreshChannels, loadMessages, loadOlder,
  putChannel, putMessage, dropChannel,
} from './channelStore';

const t = i18n.t;
const LEVEL_TEXT: Record<string, string> = { info: '정보', success: '해결', warning: '경고', error: '오류', critical: '긴급' };
const MODE_OPTS: { v: AgentMode; label: string }[] = [
  { v: 'default', label: '매번 승인' }, { v: 'acceptEdits', label: '수정은 자동' }, { v: 'plan', label: '계획만' },
];
const ERR_TEXT: Record<string, string> = {
  DAEMON_OFFLINE: 'PC 가 꺼져 있거나 CodingPT 가 연결되어 있지 않아요', NO_WORKSPACE: 'AI 가 일할 PC·폴더를 먼저 정하세요',
  AGENT_NOT_LOGGED_IN: 'PC 의 에이전트에 로그인돼 있지 않아요', TIMEOUT: 'PC 응답이 늦어요. 잠시 뒤 확인하세요',
  REQ_NOT_PENDING: '이미 처리된 요청이에요', EXTERNAL_DISABLED: '이 PC 는 외부 연동을 꺼 두었어요',
};
const errText = (e: any) => t(ERR_TEXT[String(e?.code || '')] || '문제가 생겼어요. 다시 시도해 주세요');

function levelColor(l: ChannelLevel | null | undefined): string | null {
  const C = v2.colors;
  if (l === 'critical' || l === 'error') return C.error;
  if (l === 'warning') return C.warn;
  if (l === 'success') return C.success;
  return null;
}
function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hh;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}`;
}
function docsUrlOf(webhookUrl: string): string {
  const m = /^(https?:\/\/[^/]+)/.exec(webhookUrl || '');
  return `${m ? m[1] : 'https://codingpt-back.ghmate.com'}/api/v1/docs/channels`;
}
/** 다른 프로젝트의 에이전트에게 붙여 넣을 안내문 — 문서를 읽고 알아서 붙이게 한다. */
export function agentGuideText(ch: Pick<Channel, 'webhookUrl' | 'name'>): string {
  return [
    `이 프로젝트에 문제가 생기면(서버 오류·크래시·배치 실패·헬스체크 실패 등) 내 CodingPT 앱의 「${ch.name}」 채널로 알림이 오게 해 줘.`,
    `- 방법 문서(먼저 읽어): ${docsUrlOf(ch.webhookUrl)}`,
    `- 웹훅 URL: ${ch.webhookUrl}`,
    '  이 URL 은 비밀값이야. 서버 환경변수 CODINGPT_WEBHOOK_URL 에만 넣고 코드·커밋·로그에 남기지 마.',
    '문서의 규칙(실패는 무시·타임아웃 3초·dedupeKey 로 반복 묶기·비밀값/개인정보 제외)대로 붙이고, 테스트 알림 한 건을 보내 확인한 뒤 어떤 상황에 무엇을 보내게 했는지 표로 알려 줘.',
  ].join('\n');
}

export default function ChannelsHost() {
  const C = v2.colors;
  const st = useChannels();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const [edit, setEdit] = useState<{ id: number | null } | null>(null);   // 설정 시트(id null = 새 채널)
  const [connect, setConnect] = useState<number | null>(null);              // 연동 시트
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((c) => (c === m ? null : c)), 2400); }, []);

  //  사이드바 미읽음 배지 — 화면을 열기 전에도 목록을 읽어 둔다(시작 시 + 앱이 앞으로 올 때). 실시간은 channel_event.
  useEffect(() => {
    void refreshChannels();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refreshChannels(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!st.open) return undefined;
    setChannelsBackHandler(() => {
      if (edit) { setEdit(null); return true; }
      if (connect != null) { setConnect(null); return true; }
      if (st.selected != null) { selectChannel(null); return true; }
      closeChannels(); return true;
    });
    return () => setChannelsBackHandler(null);
  }, [st.open, st.selected, edit, connect]);

  if (!st.open) return null;
  const sel = st.selected != null ? st.channels.find((c) => c.id === st.selected) || null : null;
  const menuBtn = !isWide || !dockedOpen ? (
    <IconButton onPress={isWide ? toggleDocked : openDrawer} accessibilityLabel={t('메뉴')} size={38}><SidebarSimple size={20} color={C.text2} /></IconButton>
  ) : <View style={{ width: 6 }} />;

  const header = sel ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 6, gap: 2, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      <IconButton onPress={() => selectChannel(null)} accessibilityLabel={t('목록으로')} size={38}><CaretLeft size={20} color={C.text2} /></IconButton>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '600' }}>{sel.name}</Text>
          {sel.muted ? <BellSlash size={13} color={C.textDim} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption }}>
          {sel.cwd ? `${t('AI 작업 폴더')} · ${sel.cwd.split('/').pop()}` : t('AI 작업 폴더 없음')}
        </Text>
      </View>
      <IconButton onPress={() => setConnect(sel.id)} accessibilityLabel={t('연동')} size={38}><LinkIcon size={19} color={C.text2} /></IconButton>
      <IconButton onPress={() => setEdit({ id: sel.id })} accessibilityLabel={t('채널 설정')} size={38}><DotsThree size={22} color={C.text2} weight="bold" /></IconButton>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      {menuBtn}
      <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>{t('알림 채널')}</Text>
      <IconButton onPress={() => setEdit({ id: null })} accessibilityLabel={t('새 채널')} size={38}><Plus size={20} color={C.text2} /></IconButton>
    </View>
  );

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      paddingTop: insets.top, paddingRight: insets.right, paddingLeft: isWide && dockedOpen ? 0 : insets.left, backgroundColor: C.surface }}>
      {header}
      <View style={{ flex: 1, backgroundColor: C.base, paddingBottom: sel ? 0 : insets.bottom }}>
        {sel ? <ChannelRoom key={sel.id} ch={sel} say={say} onSetup={() => setEdit({ id: sel.id })} bottomInset={insets.bottom} />
          : <ChannelList onCreate={() => setEdit({ id: null })} />}
      </View>
      {edit ? (
        <ChannelSettings
          ch={edit.id != null ? st.channels.find((c) => c.id === edit.id) || null : null}
          onClose={() => setEdit(null)} say={say}
          onCreated={(ch) => { setEdit(null); selectChannel(ch.id); setTimeout(() => setConnect(ch.id), 350); }}
        />
      ) : null}
      {connect != null ? (
        <ConnectSheet ch={st.channels.find((c) => c.id === connect) || null} onClose={() => setConnect(null)} say={say} />
      ) : null}
      {toast ? (
        <ReAnimated.View entering={FadeIn.duration(150)} pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 90, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: v2.radius.lg, backgroundColor: C.elevated2 }}>
            <Text style={{ color: C.text, fontSize: v2.font.size.small }}>{toast}</Text>
          </View>
        </ReAnimated.View>
      ) : null}
    </View>
  );
}

// ── 목록 ─────────────────────────────────────────────────────────────────────
function ChannelList({ onCreate }: { onCreate: () => void }) {
  const C = v2.colors;
  const st = useChannels();
  const [refreshing, setRefreshing] = useState(false);
  if (st.loaded && !st.channels.length) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <ReAnimated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'center' }}>
          <Broadcast size={34} color={C.text3} />
          <Text style={{ marginTop: 14, color: C.text, fontSize: v2.font.size.h2, fontWeight: '600', textAlign: 'center' }}>{t('서비스 알림을 여기로 받으세요')}</Text>
          <Text style={{ marginTop: 8, color: C.text2, fontSize: v2.font.size.small, lineHeight: 20, textAlign: 'center', maxWidth: 340 }}>
            {t('채널을 만들면 웹훅 URL 이 생겨요. 서버 오류·배포 실패 같은 알림을 그 URL 로 보내면 폰으로 오고, 같은 방에서 바로 AI 에게 고치라고 시킬 수 있어요.')}
          </Text>
          <Button label={t('채널 만들기')} variant="primary" onPress={onCreate} style={{ marginTop: 20, minWidth: 180 }} />
        </ReAnimated.View>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 6 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.text3} onRefresh={async () => { setRefreshing(true); await refreshChannels(); setRefreshing(false); }} />}>
      {st.channels.map((c, i) => {
        const dot = levelColor(c.lastLevel);
        const a = st.activity[c.id];
        const ast = a ? a.state : c.agentState;
        const working = ast === 'working' || ast === 'waiting';
        return (
          <ReAnimated.View key={c.id} entering={FadeInDown.duration(180).delay(Math.min(i, 8) * 25)}>
            <PressableRow onPress={() => { haptic.select(); selectChannel(c.id); }} radius={v2.radius.md}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}>
                <Broadcast size={17} color={C.text2} />
                {dot && c.unreadCount ? <View style={{ position: 'absolute', top: 1, right: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: dot, borderWidth: 1.5, borderColor: C.base }} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: c.unreadCount ? '600' : '500' }}>{c.name}</Text>
                  {c.muted ? <BellSlash size={12} color={C.textDim} /> : null}
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{clock(c.lastMessageAt || c.createdAt)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: working ? C.text2 : C.text3, fontSize: v2.font.size.small }}>
                    {working ? t('AI 가 작업 중이에요') : (c.lastPreview || t('아직 알림이 없어요'))}
                  </Text>
                  {c.unreadCount ? (
                    <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.muted ? C.elevated2 : C.text }}>
                      <Text style={{ color: c.muted ? C.text2 : C.base, fontSize: 11, fontWeight: '700' }}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </PressableRow>
          </ReAnimated.View>
        );
      })}
    </ScrollView>
  );
}

// ── 방 ───────────────────────────────────────────────────────────────────────
function ChannelRoom({ ch, say, onSetup, bottomInset }: { ch: Channel; say: (m: string) => void; onSetup: () => void; bottomInset: number }) {
  const C = v2.colors;
  const st = useChannels();
  const S = useWorkspaceShell();
  const msgs = st.messages[ch.id];
  const act = st.activity[ch.id];
  const [text, setText] = useState('');
  const [refs, setRefs] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [kb, setKb] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const atBottom = useRef(true);
  //  AI 상태는 agent 이벤트(act)가 정본 — 채널 사본의 agentState 는 읽음 처리 응답 등에 실려 늦게 도착할 수 있다.
  const ast = act ? act.state : ch.agentState;
  const working = ast === 'working';
  const waiting = ast === 'waiting';

  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  //  새 글이 오면 바닥에 있을 때만 따라 내려간다(위를 읽는 중이면 그대로)
  useEffect(() => { if (atBottom.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); }, [msgs?.length, act?.text]);

  const refMsgs = useMemo(() => (msgs || []).filter((m) => refs.includes(m.id)), [msgs, refs]);
  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!ch.deviceId || !ch.cwd) { onSetup(); return; }
    haptic.select();
    setSending(true);
    const keep = { text, refs };
    setText(''); setRefs([]);
    atBottom.current = true;
    try {
      const r = await api.sendToAgent(ch.id, body, keep.refs.length ? keep.refs : undefined);
      putMessage(r.message); putChannel(r.channel);
    } catch (e: any) {
      setText(keep.text); setRefs(keep.refs);
      say(errText(e));
      void loadMessages(ch.id);
    } finally { setSending(false); }
  }, [text, refs, sending, ch, onSetup, say]);

  const askAi = useCallback((m: ChannelMessage) => {
    haptic.select();
    setRefs((r) => (r.includes(m.id) ? r : [...r, m.id].slice(-5)));
    if (!text.trim()) setText(t('이 알림 원인을 찾아서 고쳐 줘'));
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [text]);

  const openThread = useCallback(() => {
    if (!ch.threadId) return;
    const w = S.workspaces.find((x: any) => String(x.hostDeviceId) === String(ch.deviceId) && x.localPath === ch.cwd)
      || S.workspaces.find((x: any) => x.localPath === ch.cwd);
    if (!w) { say(t('이 폴더가 워크스페이스에 없어요. PC 에서 대화 탭을 열어 보세요')); return; }
    closeChannels();
    if (S.activeWsId !== w.id) S.setActive(w.id);
    S.openChatThread(w.id, ch.threadId, ch.name);
  }, [S, ch, say]);

  const respond = useCallback(async (m: ChannelMessage, decision: 'allow' | 'deny', answers?: Record<string, string>) => {
    const req = m.meta?.request;
    if (!req) return;
    haptic.select();
    try {
      await api.respondRequest(ch.id, req.id, answers ? { decision: 'answer', answers } : { decision });
      putMessage({ ...m, meta: { ...m.meta, request: { ...req, status: answers ? 'answered' : (decision === 'allow' ? 'allowed' : 'denied') } } });
    } catch (e: any) { say(errText(e)); }
  }, [ch.id, say]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
          if (contentOffset.y < 40 && st.hasMore[ch.id]) void loadOlder(ch.id);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => { if (atBottom.current) scrollRef.current?.scrollToEnd({ animated: false }); }}>
        {!msgs ? <Text style={{ color: C.textDim, textAlign: 'center', marginTop: 40 }}>{t('불러오는 중…')}</Text> : null}
        {(msgs || []).map((m) => (
          <ReAnimated.View key={m.id} entering={FadeInDown.duration(180)}>
            {m.role === 'event' ? <EventCard m={m} picked={refs.includes(m.id)} onAsk={() => askAi(m)} />
              : m.role === 'user' ? <UserBubble m={m} />
              : m.role === 'agent' ? <AgentBubble m={m} onOpenThread={ch.threadId === m.threadId ? openThread : undefined} />
              : m.meta?.event === 'request' ? <RequestCard m={m} onRespond={respond} onOpenThread={openThread} />
              : <SystemLine m={m} />}
          </ReAnimated.View>
        ))}
      </ScrollView>

      {working || waiting ? (
        <ReAnimated.View entering={FadeIn.duration(150)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface }}>
          <PulseDot />
          <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>
            {waiting ? t('AI 가 답을 기다려요') : (act?.text ? `${t('AI 작업 중')} · ${act.text}` : t('AI 작업 중'))}
          </Text>
          {ch.threadId ? <IconButton onPress={openThread} accessibilityLabel={t('대화 열기')} size={32}><ChatCircleText size={17} color={C.text2} /></IconButton> : null}
          {working ? <IconButton onPress={() => { haptic.select(); api.interruptAgent(ch.id).catch((e) => say(errText(e))); }} accessibilityLabel={t('중단')} size={32}><Stop size={16} color={C.text2} weight="fill" /></IconButton> : null}
        </ReAnimated.View>
      ) : null}

      <View style={{ borderTopWidth: working || waiting ? 0 : 1, borderTopColor: C.border, backgroundColor: C.surface, paddingHorizontal: 10, paddingTop: 8, paddingBottom: kb ? 8 : Math.max(bottomInset, 8) }}>
        {!ch.deviceId || !ch.cwd ? (
          <PressableRow onPress={onSetup} radius={v2.radius.md} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 6, backgroundColor: C.elevated }}>
            <Laptop size={16} color={C.text2} />
            <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>{t('AI 에게 맡기려면 일할 PC·폴더를 정하세요')}</Text>
            <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{t('정하기')}</Text>
          </PressableRow>
        ) : null}
        {refMsgs.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
            {refMsgs.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingLeft: 9, paddingRight: 3, borderRadius: v2.radius.sm, backgroundColor: C.elevated2, maxWidth: 240 }}>
                {levelColor(m.level) ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: levelColor(m.level) as string }} /> : null}
                <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text2, fontSize: v2.font.size.caption }}>{m.title || m.body || t('알림')}</Text>
                <IconButton onPress={() => setRefs((r) => r.filter((x) => x !== m.id))} accessibilityLabel={t('빼기')} size={24}><X size={11} color={C.textDim} /></IconButton>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, borderRadius: v2.radius.composer, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
          <TextInput ref={inputRef} value={text} onChangeText={setText} multiline
            placeholder={ch.cwd ? t('AI 에게 지시하기') : t('먼저 일할 PC·폴더를 정하세요')} placeholderTextColor={C.textDim}
            style={{ flex: 1, maxHeight: 120, minHeight: 34, paddingTop: 8, paddingBottom: 8, color: C.text, fontSize: v2.font.size.body }} />
          <PressableScale onPress={send} disabled={!text.trim() || sending} scaleTo={0.92} accessibilityRole="button" accessibilityLabel={t('보내기')}
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() && !sending ? C.text : C.elevated2 }}>
            <ArrowUp size={17} color={text.trim() && !sending ? C.base : C.textDim} weight="bold" />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function PulseDot() {
  const C = v2.colors;
  const [on, setOn] = useState(true);
  useEffect(() => { const i = setInterval(() => setOn((v) => !v), 700); return () => clearInterval(i); }, []);
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.text2, opacity: on ? 1 : 0.3 }} />;
}

function EventCard({ m, picked, onAsk }: { m: ChannelMessage; picked: boolean; onAsk: () => void }) {
  const C = v2.colors;
  const col = levelColor(m.level);
  const [open, setOpen] = useState(false);
  const long = (m.body || '').length > 280 || (m.body || '').split('\n').length > 6;
  return (
    <View style={{ borderRadius: v2.radius.lg, borderWidth: 1, borderColor: picked ? C.borderStrong : C.border, backgroundColor: C.elevated, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 3, backgroundColor: col || C.borderControl }} />
        <View style={{ flex: 1, padding: 12, paddingLeft: 11 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: col || C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{t(LEVEL_TEXT[m.level || 'info'] || '정보')}</Text>
            {m.source ? <Text numberOfLines={1} style={{ flexShrink: 1, color: C.textDim, fontSize: v2.font.size.caption }}>· {m.source}</Text> : null}
            <View style={{ flex: 1 }} />
            {m.repeatCount > 1 ? (
              <View style={{ paddingHorizontal: 6, height: 18, borderRadius: 9, justifyContent: 'center', backgroundColor: C.elevated2 }}>
                <Text style={{ color: C.text2, fontSize: 11, fontWeight: '600' }}>×{m.repeatCount}</Text>
              </View>
            ) : null}
            <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{clock(m.updatedAt || m.createdAt)}</Text>
          </View>
          {m.title ? <Text selectable style={{ marginTop: 5, color: C.text, fontSize: v2.font.size.body, fontWeight: '600', lineHeight: 21 }}>{m.title}</Text> : null}
          {m.body ? (
            <PressableRow onPress={long ? () => setOpen((v) => !v) : undefined} disabled={!long} minHeight={0} radius={v2.radius.sm} style={{ marginTop: 5 }}>
              <Text selectable numberOfLines={open || !long ? undefined : 6}
                style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 19, fontFamily: /\n\s+at |Error|Exception|Traceback/.test(m.body) ? v2.font.mono : v2.font.sans }}>{m.body}</Text>
              {long ? <Text style={{ marginTop: 3, color: C.textDim, fontSize: v2.font.size.caption }}>{open ? t('접기') : t('더 보기')}</Text> : null}
            </PressableRow>
          ) : null}
          {m.fields?.length ? (
            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {m.fields.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', maxWidth: '100%', borderRadius: v2.radius.sm, backgroundColor: C.elevated2, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: v2.font.size.caption }}>
                    <Text style={{ color: C.textDim }}>{f.label} </Text><Text style={{ color: C.text2 }}>{f.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <PressableScale onPress={onAsk} scaleTo={0.96} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: v2.radius.sm, backgroundColor: picked ? C.selected : C.elevated2 }}>
              {picked ? <Check size={13} color={C.text} weight="bold" /> : <Sparkle size={13} color={C.text} />}
              <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '500' }}>{picked ? t('지시에 붙임') : t('AI 에게 맡기기')}</Text>
            </PressableScale>
            {m.url ? (
              <PressableScale onPress={() => Linking.openURL(m.url as string).catch(() => {})} scaleTo={0.96} accessibilityRole="link"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}>
                <ArrowSquareOut size={13} color={C.text2} />
                <Text style={{ color: C.text2, fontSize: v2.font.size.small }}>{t('링크')}</Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function UserBubble({ m }: { m: ChannelMessage }) {
  const C = v2.colors;
  const n = m.meta?.refs?.length || 0;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{ maxWidth: '86%', borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: C.elevated2 }}>
        <Text selectable style={{ color: C.text, fontSize: v2.font.size.body, lineHeight: 21 }}>{m.body}</Text>
      </View>
      <Text style={{ marginTop: 3, marginRight: 4, color: C.textDim, fontSize: v2.font.size.caption }}>
        {n ? `${t('알림 {n}개와 함께', { n })} · ` : ''}{clock(m.createdAt)}
      </Text>
    </View>
  );
}

function AgentBubble({ m, onOpenThread }: { m: ChannelMessage; onOpenThread?: () => void }) {
  const C = v2.colors;
  const tools = m.meta?.tools || 0;
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginLeft: 2 }}>
        <Sparkle size={13} color={m.level === 'error' ? C.error : C.text2} weight="fill" />
        <Text style={{ color: C.text2, fontSize: v2.font.size.caption, fontWeight: '600' }}>{m.meta?.agent === 'codex' ? 'Codex' : 'Claude'}</Text>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{tools ? `${t('도구 {n}번', { n: tools })} · ` : ''}{clock(m.createdAt)}</Text>
      </View>
      <View style={{ maxWidth: '100%', alignSelf: 'stretch', paddingHorizontal: 2 }}>
        <ChatMarkdown text={m.body || ''} />
      </View>
      {onOpenThread ? (
        <PressableScale onPress={onOpenThread} scaleTo={0.96} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, height: 28, paddingHorizontal: 9, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}>
          <ChatCircleText size={13} color={C.text2} />
          <Text style={{ color: C.text2, fontSize: v2.font.size.caption }}>{t('전체 대화 보기')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function RequestCard({ m, onRespond, onOpenThread }: {
  m: ChannelMessage; onRespond: (m: ChannelMessage, d: 'allow' | 'deny', answers?: Record<string, string>) => void; onOpenThread: () => void;
}) {
  const C = v2.colors;
  const req = m.meta?.request;
  if (!req) return <SystemLine m={m} />;
  const pending = req.status === 'pending';
  const q = req.kind === 'question' && req.questions && req.questions.length === 1 ? req.questions[0] : null;
  const doneText = { allowed: '허용함', denied: '거절함', answered: '답함', expired: '만료됨' }[req.status as string] || '처리됨';
  return (
    <View style={{ borderRadius: v2.radius.lg, borderWidth: 1, borderColor: pending ? C.borderStrong : C.border, backgroundColor: C.elevated, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pending ? C.warn : C.textDim }} />
        <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{t(m.title || 'AI 가 승인을 기다려요')}</Text>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{pending ? clock(m.createdAt) : t(doneText)}</Text>
      </View>
      {req.tool ? <Text style={{ marginTop: 6, color: C.text3, fontSize: v2.font.size.caption }}>{req.tool}</Text> : null}
      {req.summary ? <Text selectable style={{ marginTop: 3, color: C.text2, fontSize: v2.font.size.small, lineHeight: 19, fontFamily: req.kind === 'permission' ? v2.font.mono : v2.font.sans }} numberOfLines={8}>{req.summary}</Text> : null}
      {q ? <Text style={{ marginTop: 4, color: C.text, fontSize: v2.font.size.small }}>{q.question}</Text> : null}
      {pending ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {q && q.options && q.options.length ? q.options.slice(0, 4).map((o) => (
            <Button key={o.label} label={o.label} size="sm" variant="secondary" onPress={() => onRespond(m, 'allow', { [q.question]: o.label })} />
          )) : req.kind === 'question' ? (
            <Button label={t('대화에서 답하기')} size="sm" variant="secondary" onPress={onOpenThread} />
          ) : (
            <>
              <Button label={t('허용')} size="sm" variant="primary" onPress={() => onRespond(m, 'allow')} />
              <Button label={t('거절')} size="sm" variant="secondary" onPress={() => onRespond(m, 'deny')} />
              <Button label={t('자세히')} size="sm" variant="ghost" onPress={onOpenThread} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function SystemLine({ m }: { m: ChannelMessage }) {
  const C = v2.colors;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 2 }}>
      <Text style={{ color: m.level === 'error' ? C.error : C.textDim, fontSize: v2.font.size.caption, textAlign: 'center' }}>
        {m.body ? t(m.body) : ''} · {clock(m.createdAt)}
      </Text>
    </View>
  );
}

// ── 설정(만들기·고치기) ────────────────────────────────────────────────────────
function ChannelSettings({ ch, onClose, onCreated, say }: { ch: Channel | null; onClose: () => void; onCreated: (c: Channel) => void; say: (m: string) => void }) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const pcs = S.pcDevices().filter((d) => d.runnerKind !== 'cloud');
  const [visible, setVisible] = useState(true);
  const [name, setName] = useState(ch?.name || '');
  const [deviceId, setDeviceId] = useState<number | null>(ch ? ch.deviceId : (pcs.length ? Number(S.resolvedDeviceId() || pcs[0].id) : null));
  const [cwd, setCwd] = useState<string | null>(ch ? ch.cwd : null);
  const [mode, setMode] = useState<AgentMode>(ch?.agentMode || 'default');
  const [worktree, setWorktree] = useState(!!ch?.useWorktree);
  const [muted, setMuted] = useState(!!ch?.muted);
  const [busy, setBusy] = useState(false);
  const close = () => { setVisible(false); setTimeout(onClose, 220); };
  const folders = useMemo(() => (deviceId ? S.workspacesForDevice(String(deviceId)) : [])
    .filter((w: any) => w.localPath && !/\/\.codingpt\//.test(w.localPath))
    .map((w: any) => ({ cwd: String(w.localPath), name: S.wsDisplayName(w) }))
    .filter((x, i, a) => a.findIndex((y) => y.cwd === x.cwd) === i), [S, deviceId]);
  useEffect(() => { if (!ch && !cwd && folders.length) setCwd(folders[0].cwd); }, [folders]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const input = { name: name.trim(), deviceId, cwd: deviceId ? cwd : null, agentMode: mode, useWorktree: worktree, muted };
    try {
      if (ch) { const r = await api.updateChannel(ch.id, input); putChannel(r.channel); say(t('저장했어요')); close(); }
      else { const r = await api.createChannel(input); putChannel(r.channel); setVisible(false); setTimeout(() => onCreated(r.channel), 220); }
    } catch (e: any) { say(errText(e)); } finally { setBusy(false); }
  };
  const remove = () => {
    if (!ch) return;
    showAppAlert({ title: t('이 채널을 지울까요?'), message: t('웹훅 URL 도 더 이상 받지 않아요. 지난 알림도 함께 지워져요.'), buttons: [
      { text: t('지우기'), style: 'destructive', onPress: () => { api.deleteChannel(ch.id).then(() => { dropChannel(ch.id); close(); }).catch((e) => say(errText(e))); } },
      { text: t('취소'), style: 'cancel' }] });
  };
  const label = (s: string) => <Text style={{ marginTop: 16, marginBottom: 6, color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{s}</Text>;
  const option = (key: string, on: boolean, text: string, sub: string | null, icon: React.ReactNode, onPress: () => void) => (
    <PressableRow key={key} onPress={onPress} selected={on} radius={v2.radius.md} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: on ? C.text : C.text2, fontSize: v2.font.size.body }}>{text}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{sub}</Text> : null}
      </View>
      {on ? <Check size={15} color={C.text} weight="bold" /> : null}
    </PressableRow>
  );
  return (
    <Sheet visible={visible} onClose={close} title={ch ? t('채널 설정') : t('새 알림 채널')} maxHeightPct={0.92}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {label(t('이름'))}
        <TextInput value={name} onChangeText={setName} placeholder={t('예: 쇼핑몰 서버')} placeholderTextColor={C.textDim} maxLength={60}
          style={{ height: 44, paddingHorizontal: 12, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, color: C.text, fontSize: v2.font.size.body, backgroundColor: C.base }} />
        {label(t('AI 가 일할 PC'))}
        {pcs.length ? pcs.map((d) => option('d' + d.id, Number(d.id) === deviceId, d.name, d.online ? t('연결됨') : t('꺼져 있음'),
          <Laptop size={17} color={C.text2} />, () => { setDeviceId(Number(d.id)); setCwd(null); }))
          : <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{t('연결된 PC 가 없어요. 알림만 받을 수 있어요')}</Text>}
        {pcs.length ? option('none', deviceId == null, t('정하지 않음'), t('알림만 받기'), <BellSlash size={17} color={C.textDim} />, () => { setDeviceId(null); setCwd(null); }) : null}
        {deviceId ? (
          <>
            {label(t('프로젝트 폴더'))}
            {folders.length ? folders.map((f) => option('f' + f.cwd, f.cwd === cwd, f.name, f.cwd, <Folder size={17} color={C.text2} />, () => setCwd(f.cwd)))
              : <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{t('이 PC 에 워크스페이스가 없어요. 사이드바에서 먼저 추가하세요')}</Text>}
            {label(t('AI 권한'))}
            <Seg<AgentMode> value={mode} onChange={setMode} options={MODE_OPTS.map((o) => ({ v: o.v, label: t(o.label) }))} />
            <Text style={{ marginTop: 6, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
              {mode === 'default' ? t('파일 수정·명령 실행마다 이 방에서 승인해요') : mode === 'acceptEdits' ? t('파일 수정은 바로 하고, 명령 실행은 승인해요') : t('고치기 전에 계획을 먼저 보여 줘요')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{t('새 브랜치에서 작업')}</Text>
                <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{t('지금 작업 중인 폴더를 건드리지 않아요(git 저장소만)')}</Text>
              </View>
              <Toggle value={worktree} onValueChange={setWorktree} accessibilityLabel={t('새 브랜치에서 작업')} />
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{t('푸시 끄기')}</Text>
            <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{t('알림은 쌓이고 폰은 울리지 않아요')}</Text>
          </View>
          <Toggle value={muted} onValueChange={setMuted} accessibilityLabel={t('푸시 끄기')} />
        </View>
        <Button label={ch ? t('저장') : t('만들기')} variant="primary" busy={busy} disabled={!name.trim()} onPress={save} style={{ marginTop: 20, alignSelf: 'stretch' }} />
        {ch ? <Button label={t('채널 지우기')} variant="ghost" onPress={remove} style={{ marginTop: 6 }} /> : null}
      </ScrollView>
    </Sheet>
  );
}

// ── 연동 ─────────────────────────────────────────────────────────────────────
function ConnectSheet({ ch, onClose, say }: { ch: Channel | null; onClose: () => void; say: (m: string) => void }) {
  const C = v2.colors;
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const close = () => { setVisible(false); setTimeout(onClose, 220); };
  if (!ch) return null;
  const copy = (s: string, msg: string) => { Clipboard.setString(s); haptic.select(); say(msg); };
  const curl = `curl -X POST "${ch.webhookUrl}" -H 'Content-Type: application/json' -d '{"title":"테스트","text":"CodingPT 알림 연결 확인","level":"info"}'`;
  const rotate = () => {
    showAppAlert({ title: t('웹훅 URL 을 새로 만들까요?'), message: t('지금 URL 을 쓰는 서비스는 더 이상 보낼 수 없어요. 새 URL 로 바꿔 넣어야 해요.'), buttons: [
      { text: t('새로 만들기'), style: 'destructive', onPress: () => { api.rotateToken(ch.id).then((r) => { putChannel(r.channel); say(t('새 URL 을 만들었어요')); }).catch((e) => say(errText(e))); } },
      { text: t('취소'), style: 'cancel' }] });
  };
  const block = (title: string, sub: string, value: string, mono: boolean, onCopy: () => void) => (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{title}</Text>
      <Text style={{ marginTop: 2, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>{sub}</Text>
      <PressableRow onPress={onCopy} radius={v2.radius.md} minHeight={0}
        style={{ marginTop: 7, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base }}>
        <Text numberOfLines={mono ? 3 : 6} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.caption, lineHeight: 17, fontFamily: mono ? v2.font.mono : v2.font.sans }}>{value}</Text>
        <Copy size={15} color={C.text2} />
      </PressableRow>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={close} title={t('서비스 연동')} maxHeightPct={0.92}>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        <Text style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 20 }}>
          {t('이 URL 로 POST 하면 이 채널에 알림이 와요. 무엇을 언제 보낼지는 서비스 쪽에서 정해요.')}
        </Text>
        {block(t('에이전트에게 맡기기(추천)'), t('그 프로젝트를 작업하는 AI 에게 이 안내를 붙여 넣으면 문서를 읽고 알아서 연결해요'),
          agentGuideText(ch), false, () => copy(agentGuideText(ch), t('안내문을 복사했어요')))}
        {block(t('웹훅 URL'), t('비밀값이에요. 서버 환경변수(CODINGPT_WEBHOOK_URL)에만 넣으세요'), ch.webhookUrl, true, () => copy(ch.webhookUrl, t('URL 을 복사했어요')))}
        {block(t('바로 보내 보기(curl)'), t('터미널에 붙여 넣으면 테스트 알림이 와요'), curl, true, () => copy(curl, t('명령을 복사했어요')))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Button label={t('테스트 알림 보내기')} variant="secondary" busy={busy} stretch onPress={async () => {
            setBusy(true);
            try { await api.sendTest(ch.id); say(t('테스트 알림을 보냈어요')); } catch (e: any) { say(errText(e)); } finally { setBusy(false); }
          }} />
          <Button label={t('문서')} variant="ghost" onPress={() => Linking.openURL(docsUrlOf(ch.webhookUrl)).catch(() => {})} />
        </View>
        <Button label={t('URL 새로 만들기')} variant="ghost" onPress={rotate} style={{ marginTop: 4 }} />
      </ScrollView>
    </Sheet>
  );
}
