// BotPanes — 봇 방의 "할 일" · "자동화" 탭과 봇 연결(서비스 웹훅 서명·PC MCP) 블록. (2026-11-27, Orca Bots 이식)
//  ChannelsHost 가 방 안에서 탭으로 띄운다. 정본 = back botService(할 일·자동화) · 데몬 mcp.js(PC 의 claude MCP).
// 색 규율: 상태 신호(Needs you=주황 점, 실패=빨강)만 색. 나머지는 무채색 명암.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Linking, Clipboard } from 'react-native';
import ReAnimated, { FadeInDown } from 'react-native-reanimated';
import { Play, Trash, ArrowSquareOut, Copy, CaretDown, CaretRight, Check } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { PressableRow, IconButton, Button, Sheet, Seg, PressableScale, Toggle } from '../../components/ui';
import { showAppAlert } from '../../components/AppAlert';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';
import ChatMarkdown from '../chat/ChatMarkdown';
import * as api from '../../services/channelService';
import type { Channel, BotItem, BotAutomation, ItemStatus, ChannelLevel, McpCatalogEntry, McpServer } from '../../services/channelService';
import { useChannels, putItem, putAutomation, dropAutomation, loadItems, loadAutomations, putChannel } from './channelStore';

const t = i18n.t;
const STATUS_TEXT: Record<ItemStatus, string> = { needs_you: '결정 필요', in_progress: '진행 중', waiting: '기다리는 중', planned: '계획', done: '완료', canceled: '취소' };
const OPEN: ItemStatus[] = ['needs_you', 'in_progress', 'waiting', 'planned'];
const DAY_TEXT = ['일', '월', '화', '수', '목', '금', '토'];
const PROVIDERS = [{ v: '', label: '전부' }, { v: 'github', label: 'GitHub' }, { v: 'linear', label: 'Linear' }, { v: 'sentry', label: 'Sentry' }, { v: 'vercel', label: 'Vercel' }];
const MIN_LEVELS: { v: ChannelLevel; label: string }[] = [{ v: 'info', label: '전부' }, { v: 'warning', label: '경고 이상' }, { v: 'error', label: '오류 이상' }, { v: 'critical', label: '긴급만' }];
const ERR: Record<string, string> = {
  DAEMON_OFFLINE: 'PC 가 꺼져 있거나 CodingPT 가 연결되어 있지 않아요', NO_WORKSPACE: '봇이 일할 PC·폴더를 먼저 정하세요',
  AGENT_UNAVAILABLE: '이 PC 에서 claude 를 찾지 못했어요', TIMEOUT: 'PC 응답이 늦어요. 잠시 뒤 다시 해 보세요',
  LOGIN_NOT_FOUND: '로그인이 만료됐어요. 다시 시작하세요', BAD_REQUEST: '입력을 확인해 주세요',
};
const errText = (e: any) => t(ERR[String(e?.code || '')] || (e?.message && /[가-힣]/.test(e.message) ? e.message : '문제가 생겼어요. 다시 시도해 주세요'));

function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? hh : `${d.getMonth() + 1}/${d.getDate()} ${hh}`;
}
export function scheduleText(s: BotAutomation['schedule']): string {
  if (!s) return '';
  const d = [...s.days].sort();
  const days = d.length === 7 ? t('매일') : d.join(',') === '1,2,3,4,5' ? t('평일') : d.join(',') === '0,6' ? t('주말') : d.map((x) => t(DAY_TEXT[x])).join('·');
  return `${days} ${s.time}`;
}
function eventText(f: BotAutomation['filter']): string {
  const lv = MIN_LEVELS.find((x) => x.v === (f?.minLevel || 'error'));
  const pv = PROVIDERS.find((x) => x.v === (f?.provider || ''));
  return [t('알림이 오면'), lv ? t(lv.label) : '', pv && pv.v ? pv.label : ''].filter(Boolean).join(' · ');
}

/** 봇 얼굴 — 이름 첫 글자 무채색 원(이모지·포인트 색 금지). */
export function BotAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const C = v2.colors;
  const ch = (String(name || '').trim()[0] || 'B').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ color: C.text, fontSize: Math.round(size * 0.45), fontWeight: '700' }}>{ch}</Text>
    </View>
  );
}

// ── 할 일 ────────────────────────────────────────────────────────────────────
export function ItemsPane({ ch, say }: { ch: Channel; say: (m: string) => void }) {
  const C = v2.colors;
  const st = useChannels();
  const items = st.items[ch.id];
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => { void loadItems(ch.id); }, [ch.id]);
  const groups = useMemo(() => {
    const list = items || [];
    return {
      open: OPEN.flatMap((s) => list.filter((x) => x.status === s).sort((a, b) => b.number - a.number)),
      closed: list.filter((x) => !OPEN.includes(x.status)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    };
  }, [items]);
  if (!items) return <Text style={{ color: C.textDim, textAlign: 'center', marginTop: 40 }}>{t('불러오는 중…')}</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
      {!groups.open.length ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ color: C.text2, fontSize: v2.font.size.body, fontWeight: '600' }}>{t('열린 할 일이 없어요')}</Text>
          <Text style={{ marginTop: 6, color: C.textDim, fontSize: v2.font.size.small, textAlign: 'center', lineHeight: 19, maxWidth: 320 }}>
            {t('봇이 맡은 일과 주인의 결정이 필요한 일이 여기에 쌓여요. 알림 자동 착수를 켜 두면 알림마다 할 일이 생겨요.')}
          </Text>
        </View>
      ) : groups.open.map((it, i) => (
        <ReAnimated.View key={it.id} entering={FadeInDown.duration(160).delay(Math.min(i, 6) * 20)}>
          <ItemCard ch={ch} it={it} say={say} />
        </ReAnimated.View>
      ))}
      {groups.closed.length ? (
        <>
          <PressableRow onPress={() => setShowClosed((v) => !v)} radius={v2.radius.md} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
            {showClosed ? <CaretDown size={13} color={C.text3} /> : <CaretRight size={13} color={C.text3} />}
            <Text style={{ color: C.text3, fontSize: v2.font.size.small }}>{t('끝난 일 {n}개', { n: groups.closed.length })}</Text>
          </PressableRow>
          {showClosed ? groups.closed.map((it) => <ItemCard key={it.id} ch={ch} it={it} say={say} />) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function ItemCard({ ch, it, say }: { ch: Channel; it: BotItem; say: (m: string) => void }) {
  const C = v2.colors;
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const needs = it.status === 'needs_you';
  const closed = it.status === 'done' || it.status === 'canceled';
  const send = async (body: { text?: string; status?: ItemStatus }) => {
    if (busy) return;
    haptic.select();
    setBusy(true);
    try { const r = await api.answerItem(ch.id, it.number, body); putItem(r.item); setReply(''); if (body.text) say(t('봇에게 전했어요')); }
    catch (e: any) { say(errText(e)); void loadItems(ch.id); } finally { setBusy(false); }
  };
  const notes = it.notes || [];
  const shown = openNotes ? notes : notes.slice(-2);
  const who = (a: string) => (a === 'owner' ? t('나') : a === 'bot' ? ch.name : t('시스템'));
  return (
    <View style={{ borderRadius: v2.radius.lg, borderWidth: 1, borderColor: needs ? C.borderStrong : C.border, backgroundColor: C.elevated, padding: 12, opacity: closed ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {needs ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.warn }} /> : null}
        <Text style={{ color: needs ? C.text : C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>#{it.number} · {t(STATUS_TEXT[it.status])}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{ago(it.updatedAt)}</Text>
      </View>
      <Text selectable style={{ marginTop: 5, color: C.text, fontSize: v2.font.size.body, fontWeight: '600', lineHeight: 21 }}>{it.title}</Text>
      {it.doneMeans ? <Text style={{ marginTop: 3, color: C.text3, fontSize: v2.font.size.caption }}>{t('완료 조건')} · {it.doneMeans}</Text> : null}
      {it.ask && needs ? (
        <View style={{ marginTop: 10, padding: 10, borderRadius: v2.radius.md, backgroundColor: C.base }}>
          <Text selectable style={{ color: C.text, fontSize: v2.font.size.small, lineHeight: 19 }}>{it.ask.question}</Text>
          {it.ask.options.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {it.ask.options.map((o, i) => (
                <Button key={o} size="sm" variant={it.ask?.recommended === i + 1 ? 'primary' : 'secondary'} label={it.ask?.recommended === i + 1 ? `${o} · ${t('추천')}` : o}
                  disabled={busy} onPress={() => send({ text: o })} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {shown.length ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {notes.length > 2 ? (
            <PressableRow onPress={() => setOpenNotes((v) => !v)} minHeight={0} radius={v2.radius.sm}>
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{openNotes ? t('접기') : t('기록 {n}개 모두 보기', { n: notes.length })}</Text>
            </PressableRow>
          ) : null}
          {shown.map((n, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
              <Text style={{ color: n.actor === 'owner' ? C.text2 : C.text3, fontSize: v2.font.size.caption, fontWeight: '600', minWidth: 28 }}>{who(n.actor)}</Text>
              <View style={{ flex: 1 }}><ChatMarkdown text={n.text} /></View>
            </View>
          ))}
        </View>
      ) : null}
      {!closed ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, paddingLeft: 10, paddingRight: 4, paddingVertical: 4 }}>
            <TextInput value={reply} onChangeText={setReply} multiline placeholder={needs ? t('직접 답하기') : t('봇에게 의견 남기기')} placeholderTextColor={C.textDim}
              style={{ flex: 1, maxHeight: 100, minHeight: 30, paddingVertical: 6, color: C.text, fontSize: v2.font.size.small }} />
            <Button size="sm" variant={reply.trim() ? 'primary' : 'secondary'} label={t('보내기')} disabled={!reply.trim() || busy} onPress={() => send({ text: reply.trim() })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {it.url ? <Button size="sm" variant="ghost" label={t('링크')} onPress={() => Linking.openURL(it.url as string).catch(() => {})} /> : null}
            <View style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" label={t('취소')} disabled={busy} onPress={() => send({ status: 'canceled' })} />
            <Button size="sm" variant="secondary" label={t('완료로')} disabled={busy} onPress={() => send({ status: 'done' })} />
          </View>
        </>
      ) : null}
    </View>
  );
}

// ── 자동화 ───────────────────────────────────────────────────────────────────
export function AutomationsPane({ ch, say }: { ch: Channel; say: (m: string) => void }) {
  const C = v2.colors;
  const st = useChannels();
  const list = st.automations[ch.id];
  const [edit, setEdit] = useState<BotAutomation | 'new' | null>(null);
  useEffect(() => { void loadAutomations(ch.id); }, [ch.id]);
  const toggle = async (a: BotAutomation, enabled: boolean) => {
    putAutomation({ ...a, enabled });
    try { const r = await api.updateAutomation(ch.id, a.id, { enabled }); putAutomation(r.automation); } catch (e: any) { putAutomation(a); say(errText(e)); }
  };
  const run = async (a: BotAutomation) => {
    haptic.select();
    try { await api.runAutomation(ch.id, a.id); say(t('봇에게 맡겼어요')); } catch (e: any) { say(errText(e)); }
  };
  const remove = (a: BotAutomation) => {
    showAppAlert({ title: t('이 자동화를 지울까요?'), message: a.name, buttons: [
      { text: t('지우기'), style: 'destructive', onPress: () => { api.deleteAutomation(ch.id, a.id).then(() => dropAutomation(ch.id, a.id)).catch((e) => say(errText(e))); } },
      { text: t('취소'), style: 'cancel' }] });
  };
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
          {t('알림이 오면 할 일을 만들고 바로 착수하거나, 정해진 요일·시각에 일을 시켜요. 실행은 봇의 PC 에서, 결과는 이 방과 폰 알림으로 와요.')}
        </Text>
        {!ch.deviceId || !ch.cwd ? <Text style={{ color: C.warn, fontSize: v2.font.size.small }}>{t('봇이 일할 PC·폴더를 정해야 자동화가 돌아가요')}</Text> : null}
        {(list || []).map((a) => (
          <View key={a.id} style={{ borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PressableRow onPress={() => setEdit(a)} minHeight={0} radius={v2.radius.sm} style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '600' }}>{a.name}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, color: C.text3, fontSize: v2.font.size.caption }}>
                  {a.kind === 'schedule' ? scheduleText(a.schedule) : eventText(a.filter)}
                  {a.kind === 'schedule' && a.enabled && a.nextRunAt ? ` · ${t('다음')} ${ago(a.nextRunAt)}` : ''}
                  {a.lastRunAt ? ` · ${t('최근')} ${ago(a.lastRunAt)}` : ''}
                </Text>
              </PressableRow>
              <Toggle value={a.enabled} onValueChange={(v: boolean) => toggle(a, v)} accessibilityLabel={t('켜기')} />
            </View>
            {a.prompt ? <Text numberOfLines={3} style={{ marginTop: 8, color: C.text2, fontSize: v2.font.size.small, lineHeight: 19 }}>{a.prompt}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
              <IconButton onPress={() => remove(a)} accessibilityLabel={t('지우기')} size={32}><Trash size={16} color={C.text3} /></IconButton>
              <IconButton onPress={() => run(a)} accessibilityLabel={t('지금 실행')} size={32}><Play size={16} color={C.text2} weight="fill" /></IconButton>
            </View>
          </View>
        ))}
        <Button label={t('자동화 추가')} variant="secondary" onPress={() => setEdit('new')} style={{ marginTop: 4 }} />
      </ScrollView>
      {edit ? <AutomationSheet ch={ch} a={edit === 'new' ? null : edit} onClose={() => setEdit(null)} say={say} /> : null}
    </>
  );
}

function AutomationSheet({ ch, a, onClose, say }: { ch: Channel; a: BotAutomation | null; onClose: () => void; say: (m: string) => void }) {
  const C = v2.colors;
  const [visible, setVisible] = useState(true);
  const [kind, setKind] = useState<'event' | 'schedule'>(a?.kind || 'event');
  const [name, setName] = useState(a?.name || '');
  const [prompt, setPrompt] = useState(a?.prompt || '');
  const [minLevel, setMinLevel] = useState<ChannelLevel>((a?.filter?.minLevel as ChannelLevel) || 'error');
  const [provider, setProvider] = useState<string>(a?.filter?.provider || '');
  const [days, setDays] = useState<number[]>(a?.schedule?.days || [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(a?.schedule?.time || '09:00');
  const [busy, setBusy] = useState(false);
  const close = () => { setVisible(false); setTimeout(onClose, 220); };
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch (_) { return 'Asia/Seoul'; } })();
  const timeOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(time);
  const save = async () => {
    if (busy || (kind === 'schedule' && (!timeOk || !days.length))) return;
    setBusy(true);
    const body: any = { name: name.trim() || (kind === 'schedule' ? t('예약 실행') : t('알림이 오면 착수')), prompt: prompt.trim(), kind };
    if (kind === 'schedule') body.schedule = { days, time, tz: a?.schedule?.tz || tz };
    else body.filter = { minLevel, ...(provider ? { provider } : {}) };
    try {
      const r = a ? await api.updateAutomation(ch.id, a.id, body) : await api.createAutomation(ch.id, body);
      putAutomation(r.automation); say(t('저장했어요')); close();
    } catch (e: any) { say(errText(e)); } finally { setBusy(false); }
  };
  const label = (s: string) => <Text style={{ marginTop: 16, marginBottom: 6, color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{s}</Text>;
  const input = { borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, color: C.text, fontSize: v2.font.size.body, backgroundColor: C.base, paddingHorizontal: 12 } as const;
  return (
    <Sheet visible={visible} onClose={close} title={a ? t('자동화 고치기') : t('자동화 추가')} maxHeightPct={0.92}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {!a ? <Seg<'event' | 'schedule'> value={kind} onChange={setKind} options={[{ v: 'event', label: t('알림이 오면') }, { v: 'schedule', label: t('정해진 시각에') }]} /> : null}
        {label(t('이름'))}
        <TextInput value={name} onChangeText={setName} maxLength={80} placeholder={kind === 'schedule' ? t('예: 평일 아침 브리핑') : t('예: 오류가 오면 원인 조사')} placeholderTextColor={C.textDim} style={[input, { height: 44 }]} />
        {kind === 'event' ? (
          <>
            {label(t('어떤 알림에'))}
            <Seg<ChannelLevel> value={minLevel} onChange={setMinLevel} options={MIN_LEVELS.map((o) => ({ v: o.v, label: t(o.label) }))} />
            {label(t('보낸 곳'))}
            <Seg<string> value={provider} onChange={setProvider} options={PROVIDERS.map((o) => ({ v: o.v, label: o.v ? o.label : t(o.label) }))} />
            <Text style={{ marginTop: 6, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
              {t('같은 문제(dedupeKey)가 반복되면 열린 할 일에 기록만 하고, 더 심각해졌을 때만 다시 깨워요. 10분에 6번까지만 자동 착수해요.')}
            </Text>
          </>
        ) : (
          <>
            {label(t('요일'))}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {DAY_TEXT.map((d, i) => {
                const on = days.includes(i);
                return (
                  <PressableScale key={i} onPress={() => setDays((x) => (on ? x.filter((y) => y !== i) : [...x, i].sort()))} scaleTo={0.92} accessibilityRole="button"
                    style={{ flex: 1, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.text : C.elevated2 }}>
                    <Text style={{ color: on ? C.base : C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{t(d)}</Text>
                  </PressableScale>
                );
              })}
            </View>
            {label(t('시각(24시간)'))}
            <TextInput value={time} onChangeText={setTime} maxLength={5} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numbers-and-punctuation"
              style={[input, { height: 44, width: 120, borderColor: timeOk ? C.borderControl : C.error }]} />
            <Text style={{ marginTop: 6, color: C.textDim, fontSize: v2.font.size.caption }}>{t('시간대')} · {a?.schedule?.tz || tz}</Text>
          </>
        )}
        {label(t('봇에게 시킬 일'))}
        <TextInput value={prompt} onChangeText={setPrompt} multiline maxLength={4000} placeholderTextColor={C.textDim}
          placeholder={kind === 'schedule' ? t('예: 밤사이 온 알림과 열린 할 일을 다섯 줄로 정리해 줘. 문제가 없으면 조용히 끝내.') : t('예: 원인을 찾아 보고해. 코드는 내가 동의하기 전에는 고치지 마.')}
          style={[input, { minHeight: 110, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' }]} />
        <Button label={t('저장')} variant="primary" busy={busy} disabled={kind === 'schedule' && (!timeOk || !days.length)} onPress={save} style={{ marginTop: 18, alignSelf: 'stretch' }} />
      </ScrollView>
    </Sheet>
  );
}

// ── 연결: 서비스 웹훅 서명 + PC 의 MCP ────────────────────────────────────────
export function SignedWebhooksBlock({ ch, say }: { ch: Channel; say: (m: string) => void }) {
  const C = v2.colors;
  const [busy, setBusy] = useState(false);
  const setSecret = async (v: boolean) => {
    setBusy(true);
    try { const r = await api.updateBot(ch.id, { webhookSecret: v ? true : null }); putChannel(r.channel); } catch (e: any) { say(errText(e)); } finally { setBusy(false); }
  };
  const copy = (s: string) => { Clipboard.setString(s); haptic.select(); say(t('복사했어요')); };
  const rows: [string, string][] = [
    ['GitHub', t('저장소 Settings → Webhooks → Payload URL 에 웹훅 URL, Content type 은 application/json, Secret 에 아래 값. 이벤트는 Workflow runs·Issues·Pull requests 등.')],
    ['Linear', t('Settings → API → Webhooks → 새 웹훅 URL 에 웹훅 URL. 서명 비밀값은 Linear 가 만든 값을 아래 칸에 넣으세요.')],
    ['Sentry', t('Settings → Developer Settings → Internal Integration → Webhook URL 에 웹훅 URL, Alert Rule Action 을 켜세요. Client Secret 을 아래 칸에 넣으세요.')],
    ['Vercel', t('Team Settings → Webhooks → 웹훅 URL, 이벤트는 Deployment. 만든 뒤 나오는 Secret 을 아래 칸에 넣으세요.')],
  ];
  const [own, setOwn] = useState('');
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{t('서비스에서 바로 받기')}</Text>
      <Text style={{ marginTop: 2, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
        {t('같은 웹훅 URL 을 GitHub·Linear·Sentry·Vercel 에 그대로 넣으면 각 서비스의 원래 모양을 알아서 읽어요(CI 실패·이슈·오류·배포).')}
      </Text>
      {rows.map(([n, d]) => (
        <View key={n} style={{ marginTop: 8 }}>
          <Text style={{ color: C.text2, fontSize: v2.font.size.caption, fontWeight: '600' }}>{n}</Text>
          <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>{d}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{t('서명 검증')}</Text>
          <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{t('켜면 서명이 맞는 요청만 받아요(URL 이 새도 안전)')}</Text>
        </View>
        <Toggle value={!!ch.webhookSecret} disabled={busy} onValueChange={setSecret} accessibilityLabel={t('서명 검증')} />
      </View>
      {ch.webhookSecret ? (
        <>
          <PressableRow onPress={() => copy(ch.webhookSecret as string)} radius={v2.radius.md} minHeight={0}
            style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base }}>
            <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.caption, fontFamily: v2.font.mono }}>{ch.webhookSecret}</Text>
            <Copy size={15} color={C.text2} />
          </PressableRow>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <TextInput value={own} onChangeText={setOwn} placeholder={t('서비스가 정한 비밀값 넣기')} placeholderTextColor={C.textDim} autoCapitalize="none" autoCorrect={false}
              style={{ flex: 1, height: 38, paddingHorizontal: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, color: C.text, fontSize: v2.font.size.small, backgroundColor: C.base }} />
            <Button size="sm" variant="secondary" label={t('바꾸기')} disabled={!own.trim() || busy} onPress={async () => {
              setBusy(true);
              try { const r = await api.updateBot(ch.id, { webhookSecret: own.trim() }); putChannel(r.channel); setOwn(''); say(t('저장했어요')); } catch (e: any) { say(errText(e)); } finally { setBusy(false); }
            }} />
          </View>
        </>
      ) : null}
    </View>
  );
}

export function McpBlock({ ch, say }: { ch: Channel; say: (m: string) => void }) {
  const C = v2.colors;
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [login, setLogin] = useState<{ name: string; loginId: string; url: string } | null>(null);
  const [redirect, setRedirect] = useState('');
  const host = ch.deviceId;
  const refresh = useCallback(async () => {
    if (!host) return;
    setLoading(true);
    try { const r = await api.mcpRpc<{ servers: McpServer[] }>(host, 'mcp.list'); setServers(r.servers || []); } catch (e: any) { say(errText(e)); } finally { setLoading(false); }
  }, [host, say]);
  useEffect(() => { api.botTemplates().then((r) => setCatalog(r.mcp || [])).catch(() => {}); }, []);
  if (!host) return null;
  const find = (c: McpCatalogEntry) => (servers || []).find((s) => s.name === c.id || (s.url && s.url.replace(/\/+$/, '') === c.url.replace(/\/+$/, '')));
  const add = async (c: McpCatalogEntry) => {
    setBusy(c.id);
    try { await api.mcpRpc(host, 'mcp.add', { name: c.id, url: c.url, transport: c.transport || 'http' }, 60000); say(t('PC 에 추가했어요. 로그인이 필요하면 로그인하세요')); await refresh(); }
    catch (e: any) { say(errText(e)); } finally { setBusy(null); }
  };
  const remove = async (name: string) => {
    setBusy(name);
    try { await api.mcpRpc(host, 'mcp.remove', { name }, 60000); await refresh(); } catch (e: any) { say(errText(e)); } finally { setBusy(null); }
  };
  const startLogin = async (name: string, browser: boolean) => {
    setBusy(name);
    try {
      const r = await api.mcpRpc<{ loginId?: string; url?: string | null; done?: boolean }>(host, 'mcp.loginStart', { name, browser }, 30000);
      if (browser || r.done) { say(browser ? t('PC 의 브라우저에서 로그인을 마치세요') : t('로그인했어요')); if (r.done) await refresh(); }
      else if (r.url && r.loginId) { setLogin({ name, loginId: r.loginId, url: r.url }); setRedirect(''); Linking.openURL(r.url).catch(() => {}); }
    } catch (e: any) { say(errText(e)); } finally { setBusy(null); }
  };
  const finishLogin = async () => {
    if (!login) return;
    setBusy(login.name);
    try { await api.mcpRpc(host, 'mcp.loginFinish', { loginId: login.loginId, redirect: redirect.trim() }, 45000); setLogin(null); say(t('로그인했어요')); await refresh(); }
    catch (e: any) { say(errText(e)); } finally { setBusy(null); }
  };
  const statusText = (s?: McpServer) => (!s ? '' : s.status === 'connected' ? t('연결됨') : s.status === 'needs_auth' ? t('로그인 필요') : s.status === 'failed' ? t('연결 실패') : t('확인 필요'));
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{t('봇이 쓸 도구(공식 MCP)')}</Text>
        <Button size="sm" variant="ghost" label={servers ? t('다시 확인') : t('PC 에서 확인')} busy={loading} onPress={refresh} />
      </View>
      <Text style={{ marginTop: 2, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
        {t('각 서비스가 직접 운영하는 MCP 서버를 봇의 PC 에 있는 claude 에 붙여요. 로그인 정보는 그 PC 에만 남아요. 붙이면 봇이 이슈를 만들고, 배포 로그를 읽고, Slack 에 쓸 수 있어요.')}
      </Text>
      {login ? (
        <View style={{ marginTop: 10, padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.base }}>
          <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{t('{name} 로그인', { name: login.name })}</Text>
          <Text style={{ marginTop: 4, color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 17 }}>
            {t('열린 브라우저에서 허용한 뒤, 마지막에 열리지 않는 페이지(localhost)의 주소창 주소 전체를 복사해 붙여 넣으세요.')}
          </Text>
          <TextInput value={redirect} onChangeText={setRedirect} placeholder="http://localhost:…/callback?code=…" placeholderTextColor={C.textDim} autoCapitalize="none" autoCorrect={false}
            style={{ marginTop: 8, height: 38, paddingHorizontal: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, color: C.text, fontSize: v2.font.size.caption, fontFamily: v2.font.mono }} />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <Button size="sm" variant="ghost" label={t('브라우저 다시 열기')} onPress={() => Linking.openURL(login.url).catch(() => {})} />
            <View style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" label={t('취소')} onPress={() => { api.mcpRpc(host, 'mcp.loginCancel', { loginId: login.loginId }).catch(() => {}); setLogin(null); }} />
            <Button size="sm" variant="primary" label={t('마치기')} disabled={!redirect.trim()} busy={busy === login.name} onPress={finishLogin} />
          </View>
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {catalog.map((c) => {
          const s = servers ? find(c) : undefined;
          return (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{c.name}</Text>
                  {s ? (
                    <>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.status === 'connected' ? C.success : s.status === 'failed' ? C.error : C.warn }} />
                      <Text style={{ color: C.text3, fontSize: v2.font.size.caption }}>{statusText(s)}</Text>
                    </>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{t(c.what)}</Text>
              </View>
              {servers == null ? null : !s ? (
                <Button size="sm" variant="secondary" label={t('추가')} busy={busy === c.id} onPress={() => add(c)} />
              ) : s.status === 'needs_auth' || s.status === 'failed' ? (
                <>
                  <Button size="sm" variant="ghost" label={t('PC 에서')} disabled={!!busy} onPress={() => startLogin(s.name, true)} />
                  <Button size="sm" variant="secondary" label={t('폰에서 로그인')} busy={busy === s.name} onPress={() => startLogin(s.name, false)} />
                </>
              ) : (
                <IconButton onPress={() => remove(s.name)} accessibilityLabel={t('지우기')} size={30}><Trash size={15} color={C.text3} /></IconButton>
              )}
            </View>
          );
        })}
      </View>
      {servers ? (servers.filter((s) => !catalog.some((c) => find(c) === s)).length ? (
        <Text style={{ marginTop: 8, color: C.textDim, fontSize: v2.font.size.caption }}>
          {t('그 밖에 PC 에 붙은 MCP')} · {servers.filter((s) => !catalog.some((c) => find(c) === s)).map((s) => s.name).join(', ')}
        </Text>
      ) : null) : null}
    </View>
  );
}

// ── 성격·기억(설정 시트 안) ───────────────────────────────────────────────────
export function SoulMemoryBlock({ soul, memory, onSoul, onMemory }: { soul: string; memory: string; onSoul: (v: string) => void; onMemory: (v: string) => void }) {
  const C = v2.colors;
  const box = { minHeight: 110, padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, color: C.text, fontSize: v2.font.size.small, backgroundColor: C.base, textAlignVertical: 'top' as const };
  return (
    <>
      <Text style={{ marginTop: 16, marginBottom: 6, color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{t('성격·일하는 방식(SOUL)')}</Text>
      <TextInput value={soul} onChangeText={onSoul} multiline maxLength={8000} placeholder={t('비워 두면 봇이 첫 일을 마친 뒤 스스로 적어요')} placeholderTextColor={C.textDim} style={box} />
      <Text style={{ marginTop: 16, marginBottom: 6, color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{t('기억(MEMORY)')}</Text>
      <TextInput value={memory} onChangeText={onMemory} multiline placeholder={t('봇이 대화에서 배운 규칙·선호가 줄 단위로 쌓여요. 직접 고쳐도 돼요')} placeholderTextColor={C.textDim} style={[box, { fontFamily: v2.font.mono, fontSize: v2.font.size.caption }]} />
    </>
  );
}

export function TemplatePicker({ value, onChange }: { value: string | null; onChange: (id: string | null, name?: string, line?: string) => void }) {
  const C = v2.colors;
  const [list, setList] = useState<api.BotTemplate[]>([]);
  useEffect(() => { api.botTemplates().then((r) => setList(r.templates || [])).catch(() => {}); }, []);
  const row = (id: string | null, name: string, line: string, extra?: string) => (
    <PressableRow key={id || 'none'} onPress={() => { haptic.select(); onChange(id, name, line); }} selected={value === id} radius={v2.radius.md}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: value === id ? C.text : C.text2, fontSize: v2.font.size.body, fontWeight: '500' }}>{name}</Text>
        <Text numberOfLines={2} style={{ color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 16 }}>{line}{extra ? ` · ${extra}` : ''}</Text>
      </View>
      {value === id ? <Check size={15} color={C.text} weight="bold" /> : null}
    </PressableRow>
  );
  return (
    <>
      <Text style={{ marginTop: 16, marginBottom: 6, color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{t('무슨 일을 맡길까요')}</Text>
      {row(null, t('빈 봇'), t('알림을 받고, 시키는 일을 해요. 자동화는 나중에 추가'))}
      {list.map((tp) => row(tp.id, t(tp.name), t(tp.line), [...tp.events.map((x) => t(x)), ...tp.schedules.map((x) => t(x))].join(' · ') || undefined))}
    </>
  );
}

export function NeedsYouStrip({ count, onPress }: { count: number; onPress: () => void }) {
  const C = v2.colors;
  if (!count) return null;
  return (
    <PressableRow onPress={onPress} radius={v2.radius.md} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 6, backgroundColor: C.elevated }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.warn }} />
      <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.small }}>{t('결정이 필요한 일 {n}개', { n: count })}</Text>
      <ArrowSquareOut size={14} color={C.text3} />
    </PressableRow>
  );
}

