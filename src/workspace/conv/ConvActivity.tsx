import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Clipboard } from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { CaretRight, CaretLeft, Copy, Check, Robot, SpeakerHigh, Stop, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { useTheme } from '../../contexts/ThemeContext';
import PressableScale from '../../components/ui/PressableScale';
import Sheet from '../../components/ui/Sheet';
import ChatMarkdown from '../chat/ChatMarkdown';
import { haptic } from '../../animations/haptics';
import { toggleSpeak, ttsAvailable, useSpeaking } from '../../services/tts';
import type { ChatRowModel, ChatMsg } from '../chatModel';
import { fmtDuration } from './convModel';
import * as i18n from '../../i18n/index.ts';

// 채팅 v2 의 "에이전트가 일하는 흐름" — Claude 앱 문법(2026-11-25 사용자 요청: 실제 Claude 앱 수준).
//  · 끝난 도구는 박스 없이 본문 흐름 속 한 줄: "실행됨 cd …›" / 이어진 것은 "명령어 2개 실행됨 ›".
//  · 누르면 바텀시트 목록 → 한 항목을 누르면 상세(명령어·출력 + 복사).
//  · 생각은 "N초 동안 생각함". 작업 중에는 움직이는 표식 + "N초 · 생각 중…".
//  · 다른 세션이 보낸 보고(서브에이전트 hand-back)는 내 말풍선이 아니라 보고 카드.
//  포인트 컬러 없음 — 실패만 error 색으로 말한다.

const mono = () => v2.font.mono as string;

// ── 도구 분류 ───────────────────────────────────────────────────────────────

type ToolKind = 'bash' | 'read' | 'edit' | 'search' | 'web' | 'agent' | 'other';

export function toolKind(m: ChatMsg): ToolKind {
  const n = String(m.tool?.name || '');
  if (n === 'Bash' || n === 'shell' || n === 'BashOutput' || n === 'local_shell') return 'bash';
  if (n === 'Read' || n === 'NotebookRead') return 'read';
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit' || n === 'apply_patch') return 'edit';
  if (n === 'Grep' || n === 'Glob' || n === 'Search' || n === 'ToolSearch') return 'search';
  if (n === 'WebFetch' || n === 'WebSearch') return 'web';
  if (n === 'Task' || n === 'Agent') return 'agent';
  return 'other';
}

/** 도구 한 줄의 대상(명령·경로) — 데몬 title("$ cmd" / "읽기 x.ts")에서 동사를 걷어 낸다. */
export function toolTarget(m: ChatMsg): string {
  const t = String(m.tool?.title || m.tool?.name || m.text || '').trim();
  if (t.startsWith('$ ')) return t.slice(2);
  const path = m.tool?.path;
  if (path) return path;
  return t.replace(/^(읽기|수정|쓰기|검색|편집)\s+/, '');
}

const VERB_DONE: Record<ToolKind, string> = {
  bash: '실행됨', read: '읽음', edit: '수정함', search: '검색함', web: '확인함', agent: '맡김', other: '사용함',
};
const VERB_RUN: Record<ToolKind, string> = {
  bash: '실행 중', read: '읽는 중', edit: '수정 중', search: '검색 중', web: '확인 중', agent: '맡기는 중', other: '사용 중',
};

/** 묶음 요약 — 같은 종류면 그 말로("명령어 2개 실행됨"), 섞이면 "도구 5개 사용함". */
export function groupLabel(rows: ChatRowModel[]): string {
  const tools = rows.filter((r) => r.msg.kind === 'tool_use');
  const kinds = new Set(tools.map((r) => toolKind(r.msg)));
  const n = tools.length;
  if (kinds.size === 1) {
    switch ([...kinds][0]) {
      case 'bash': return i18n.t('명령어 {n}개 실행됨', { n });
      case 'read': return i18n.t('파일 {n}개 읽음', { n });
      case 'edit': return i18n.t('파일 {n}개 수정함', { n });
      case 'search': return i18n.t('{n}번 검색함', { n });
      case 'web': return i18n.t('웹 {n}번 확인함', { n });
      case 'agent': return i18n.t('에이전트 {n}개에 맡김', { n });
      default: break;
    }
  }
  return i18n.t('도구 {n}개 사용함', { n });
}

// ── 한 줄 / 묶음 ─────────────────────────────────────────────────────────────

/** 본문 흐름 속 한 줄 — 왼쪽 동사(옅게) + 대상 + 꺾쇠. 박스 없음. */
function LineShell({ children, onPress, label, failed }: { children: React.ReactNode; onPress?: () => void; label: string; failed?: boolean }) {
  const C = v2.colors;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 3 }}
    >
      {failed ? <WarningCircle size={13} color={C.error} /> : null}
      {children}
      {onPress ? <CaretRight size={12} color={C.textDim} /> : null}
    </PressableScale>
  );
}

export const ActivityLine = memo(function ActivityLine({ row, onOpen }: { row: ChatRowModel; onOpen: (rows: ChatRowModel[], idx: number | null) => void }) {
  useTheme();
  const C = v2.colors;
  const m = row.msg;
  const kind = toolKind(m);
  const res = row.result;
  const running = !res;
  const failed = !!res && res.ok === false;
  const target = toolTarget(m);
  const verb = i18n.t(running ? VERB_RUN[kind] : VERB_DONE[kind]);
  return (
    <LineShell onPress={running ? undefined : () => onOpen([row], 0)} label={`${verb} ${target}`} failed={failed}>
      {running ? <Spark size={12} /> : null}
      <Text style={{ color: failed ? C.error : C.text3, fontSize: v2.font.size.small }}>{verb}</Text>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text2, fontSize: v2.font.size.small, fontFamily: kind === 'bash' ? mono() : undefined }}>{target}</Text>
    </LineShell>
  );
});

export const ActivityGroup = memo(function ActivityGroup({ rows, onOpen }: { rows: ChatRowModel[]; onOpen: (rows: ChatRowModel[], idx: number | null) => void }) {
  useTheme();
  const C = v2.colors;
  const tools = rows.filter((r) => r.msg.kind === 'tool_use');
  const bad = tools.filter((r) => r.result && r.result.ok === false).length;
  const label = groupLabel(rows) + (bad ? i18n.t(' · 실패 {n}', { n: bad }) : '');
  return (
    <LineShell onPress={() => onOpen(tools, null)} label={label} failed={bad > 0}>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text3, fontSize: v2.font.size.small }}>{label}</Text>
    </LineShell>
  );
});

/** 생각 줄 — "N초 동안 생각함". 본문(대개 비어 온다)이 있으면 눌러 펼친다. */
export const ThinkingLine = memo(function ThinkingLine({ text, dur }: { text: string; dur?: number }) {
  useTheme();
  const C = v2.colors;
  const [open, setOpen] = useState(false);
  const has = !!String(text || '').trim();
  const label = dur && dur >= 1000 ? i18n.t('{t} 동안 생각함', { t: fmtDuration(dur) }) : i18n.t('생각함');
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <LineShell onPress={has ? () => setOpen((v) => !v) : undefined} label={label}>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{label}</Text>
      </LineShell>
      {open ? (
        <Animated.View entering={FadeIn.duration(150)} style={{ marginLeft: 2, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: C.border, marginTop: 2 }}>
          <Text selectable style={{ color: C.text3, fontSize: v2.font.size.small, lineHeight: 19 }}>{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
});

// ── 도구 상세 시트 ──────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const C = v2.colors;
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return undefined; const t = setTimeout(() => setDone(false), 1200); return () => clearTimeout(t); }, [done]);
  return (
    <PressableScale
      onPress={() => { try { Clipboard.setString(text); haptic.light(); setDone(true); } catch (_) { /* noop */ } }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={i18n.t('복사')}
      style={{ padding: 4 }}
    >
      {done ? <Check size={16} color={C.text2} /> : <Copy size={16} color={C.text3} />}
    </PressableScale>
  );
}

function CodeSection({ title, text }: { title: string; text: string }) {
  const C = v2.colors;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, color: C.text3, fontSize: v2.font.size.small, fontWeight: '500' }}>{title}</Text>
        <CopyBtn text={text} />
      </View>
      <View style={{ backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={{ color: C.text2, fontSize: v2.font.size.caption, lineHeight: 18, fontFamily: mono() }}>{text}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

function toolInputText(m: ChatMsg): string {
  const k = toolKind(m);
  if (k === 'bash') return toolTarget(m);
  const parts = [m.tool?.path, m.tool?.argsPreview].filter(Boolean) as string[];
  return parts.length ? parts.join('\n') : toolTarget(m);
}

function ToolDetail({ row }: { row: ChatRowModel }) {
  const C = v2.colors;
  const m = row.msg;
  const res = row.result;
  const out = String(res?.preview || '').replace(/\n+$/, '');
  return (
    <View>
      <CodeSection title={toolKind(m) === 'bash' ? i18n.t('명령어') : i18n.t('입력')} text={toolInputText(m)} />
      {out ? <CodeSection title={i18n.t('출력')} text={out} /> : (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{res ? i18n.t('출력 없음') : i18n.t('아직 실행 중이에요')}</Text>
      )}
      {res?.truncated ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('출력이 길어 앞부분만 보여요')}</Text> : null}
    </View>
  );
}

function stateText(row: ChatRowModel): string {
  if (!row.result) return i18n.t('실행 중');
  return row.result.ok === false ? i18n.t('실패') : i18n.t('완료');
}

export function ToolSheet({ rows, idx, onClose }: { rows: ChatRowModel[] | null; idx: number | null; onClose: () => void }) {
  useTheme();
  const C = v2.colors;
  const [sel, setSel] = useState<number | null>(idx);
  useEffect(() => { setSel(rows && rows.length === 1 ? 0 : idx); }, [rows, idx]);
  const list = rows || [];
  const cur = sel != null ? list[sel] : null;
  const single = list.length === 1;
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 }}>
      {cur && !single ? (
        <PressableScale onPress={() => setSel(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={i18n.t('뒤로')} style={{ padding: 4 }}>
          <CaretLeft size={20} color={C.text2} />
        </PressableScale>
      ) : <View style={{ width: 28 }} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>
          {cur ? String(cur.msg.tool?.name || i18n.t('도구')) : groupLabel(list)}
        </Text>
        {cur ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 1 }}>{stateText(cur)}</Text> : null}
      </View>
      <View style={{ width: 28 }} />
    </View>
  );
  return (
    <Sheet visible={!!rows} onClose={onClose} header={header} maxHeightPct={0.82} paddingHorizontal={cur ? 16 : 6}>
      {cur ? (
        <Animated.View key={'d' + sel} entering={FadeIn.duration(140)}>
          <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            <ToolDetail row={cur} />
          </ScrollView>
        </Animated.View>
      ) : (
        <Animated.View key="list" entering={FadeIn.duration(140)}>
          <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            {list.map((r, i) => {
              const k = toolKind(r.msg);
              const failed = !!r.result && r.result.ok === false;
              return (
                <PressableScale key={r.key} onPress={() => { haptic.select(); setSel(i); }} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, minHeight: 46, borderRadius: v2.radius.md }}>
                  <Text style={{ color: failed ? C.error : C.text3, fontSize: v2.font.size.small, width: 46 }}>{i18n.t(r.result ? VERB_DONE[k] : VERB_RUN[k])}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small, fontFamily: k === 'bash' ? mono() : undefined }}>{toolTarget(r.msg)}</Text>
                  <CaretRight size={14} color={C.textDim} />
                </PressableScale>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}
    </Sheet>
  );
}

// ── 다른 세션의 보고 카드 ───────────────────────────────────────────────────

export const AgentReportCard = memo(function AgentReportCard({ msg, onOpenFile, onMenu }: {
  msg: ChatMsg; onOpenFile?: (p: string) => void; onMenu?: (a: { text: string; ts: number }) => void;
}) {
  useTheme();
  const C = v2.colors;
  const [open, setOpen] = useState(false);
  const meta = (msg.meta || {}) as { name?: string | null; from?: string | null; subagent?: boolean };
  const who = meta.name || (meta.subagent ? i18n.t('서브에이전트') : i18n.t('다른 에이전트'));
  const title = meta.subagent ? i18n.t('{who}의 작업 보고', { who }) : i18n.t('{who}의 메시지', { who });
  const text = String(msg.text || '');
  const preview = useMemo(() => text.replace(/[#*`>|]/g, '').replace(/\s+/g, ' ').trim(), [text]);
  return (
    <PressableScale
      onPress={() => { haptic.select(); setOpen((v) => !v); }}
      onLongPress={onMenu ? () => onMenu({ text, ts: Date.parse(String(msg.ts || '')) || 0 }) : undefined}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      style={{ alignSelf: 'stretch', borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, paddingHorizontal: 12, paddingVertical: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Robot size={15} color={C.text3} />
        <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small, fontWeight: '500' }}>{title}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><CaretRight size={13} color={C.textDim} /></View>
      </View>
      {open ? (
        <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 8 }}>
          <ChatMarkdown text={text} onOpenFile={onOpenFile} />
        </Animated.View>
      ) : preview ? (
        <Text numberOfLines={2} style={{ color: C.text3, fontSize: v2.font.size.small, lineHeight: 19, marginTop: 6 }}>{preview}</Text>
      ) : null}
    </PressableScale>
  );
});

// ── 턴 끝 줄: [복사] [읽어 주기] · 걸린 시간 ─────────────────────────────────

export const TurnActions = memo(function TurnActions({ id, text, summary }: { id: string; text?: string; summary: string }) {
  useTheme();
  const C = v2.colors;
  const speaking = useSpeaking(id);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return undefined; const t = setTimeout(() => setCopied(false), 1400); return () => clearTimeout(t); }, [copied]);
  const copy = useCallback(() => {
    if (!text) return;
    try { Clipboard.setString(text); haptic.light(); setCopied(true); } catch (_) { /* noop */ }
  }, [text]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6 }}>
      {text ? (
        <>
          <PressableScale onPress={copy} hitSlop={6} accessibilityRole="button" accessibilityLabel={i18n.t('복사')} style={{ padding: 6 }}>
            {copied ? <Check size={16} color={C.text2} /> : <Copy size={16} color={C.text3} />}
          </PressableScale>
          {ttsAvailable() ? (
            <PressableScale onPress={() => { haptic.select(); toggleSpeak(id, text); }} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={speaking ? i18n.t('읽기 멈춤') : i18n.t('읽어 주기')} style={{ padding: 6 }}>
              {speaking ? <Stop size={16} color={C.text2} weight="fill" /> : <SpeakerHigh size={16} color={C.text3} />}
            </PressableScale>
          ) : null}
        </>
      ) : null}
      {summary ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginLeft: text ? 6 : 6 }}>{summary}</Text> : null}
    </View>
  );
});

// ── 작업 중 표식 ────────────────────────────────────────────────────────────

/** 네 갈래 별 — 천천히 돌며 숨 쉰다(무채색). Claude 앱의 "생각하는 표식" 자리. */
export function Spark({ size = 14, color }: { size?: number; color?: string }) {
  const C = v2.colors;
  const rot = useSharedValue(0);
  const sc = useSharedValue(1);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false);
    sc.value = withRepeat(withSequence(withTiming(0.72, { duration: 600, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => { cancelAnimation(rot); cancelAnimation(sc); };
  }, [rot, sc]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }, { scale: sc.value }] }));
  const c = color || C.text2;
  return (
    <Animated.View style={[{ width: size, height: size }, st]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 1.5 C12.9 7.6 16.4 11.1 22.5 12 C16.4 12.9 12.9 16.4 12 22.5 C11.1 16.4 7.6 12.9 1.5 12 C7.6 11.1 11.1 7.6 12 1.5 Z" fill={c} />
      </Svg>
    </Animated.View>
  );
}

/** 글자가 은은하게 숨 쉬는 라벨(쉬머 대용 — 무채색 불투명도). */
export function Breathing({ children, style }: { children: React.ReactNode; style?: object }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(0.45, { duration: 900 }), withTiming(1, { duration: 900 })), -1, false);
    return () => cancelAnimation(o);
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.Text style={[style, st]}>{children}</Animated.Text>;
}
