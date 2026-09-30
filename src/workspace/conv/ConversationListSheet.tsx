import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ChatCircle, TerminalWindow, Plus, X, Trash } from 'phosphor-react-native';

import { v2, tint } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import PressableRow from '../../components/ui/PressableRow';
import IconButton from '../../components/ui/IconButton';
import Button, { buttonLabelColor } from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Sheet from '../../components/ui/Sheet';
import { haptic } from '../../animations/haptics';
import convService, { toConvError } from '../../services/convService';
import convCache from '../../services/convCache';
import { errorText, fmtAgo, type Thread } from './convModel';
import * as i18n from '../../i18n/index.ts';

// 대화 목록 — 이 워크스페이스의 대화(chat-v2-design.md §10.6).
//
//  · 탭을 닫아도 대화는 남는다. 여기서 다시 연다. 지우는 길은 conv.remove 하나뿐이다(§10.7).
//  · 터미널에서 만든 대화도 같은 목록에 있다. 표시는 달리한다 — 그 대화가 **지금 터미널에서 쓰이는 중**이면
//    그대로 열 수 없다(같은 세션을 두 프로세스가 열면 기록이 섞인다, §0.1). 그때는 "채팅으로 가져오기"를 권한다.
//  · 삭제 확인은 **행 안에서** 한다. 시트(Modal) 위에 알럿(Modal)을 또 띄우면 iOS 가 뒤의 것을 거부한다.
//  · 삭제 입구는 둘 — 왼쪽으로 밀기(메일·메신저 관례)와 길게 누르기. 어느 쪽이든 같은 행 안 확인을 거친다.
//    밀어서 바로 지우지 않는다: conv.remove 는 되돌릴 수 없다.
//
// 색: 상태 점만 색을 쓴다(부름 표시 = 상태 신호). 나머지는 명암.

export default function ConversationListSheet({
  visible, onClose, host, cwd, account, currentId, onOpen, onNew,
}: {
  visible: boolean;
  onClose: () => void;
  host: number | null;
  cwd: string;
  account: string | number | null;
  /** 지금 이 탭이 보고 있는 대화 — 목록에서 밝게 표시한다. */
  currentId: string | null;
  onOpen: (t: Thread) => void;
  onNew: () => void;
}) {
  const C = v2.colors;
  const [rows, setRows] = useState<Thread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ id: string; code: string } | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await convService.list(host, { cwd, includeExternal: true, limit: 100 });
      if (aliveRef.current) setRows(Array.isArray(r.threads) ? r.threads : []);
    } catch (e) {
      if (aliveRef.current) { setErr(toConvError(e).code); setRows((cur) => cur || []); }
    }
  }, [host, cwd]);

  useEffect(() => {
    if (!visible) { setConfirmId(null); setRowErr(null); return; }
    void load();
    // 목록 갱신 힌트(§3 thread 프레임) — 열어 둔 동안 상태 점·제목·preview 가 살아 움직인다.
    const off = convService.addConvEventListener((f) => {
      if (host != null && f.hostDeviceId != null && Number(f.hostDeviceId) !== Number(host)) return;
      if (f.control && f.control.kind === 'deleted' && f.control.threadId) {
        const gone = f.control.threadId;
        setRows((cur) => (cur ? cur.filter((t) => t.id !== gone) : cur));
        return;
      }
      const th = f.thread;
      if (!th || !th.id) return;
      if (th.cwd != null && th.cwd !== cwd) return;
      setRows((cur) => {
        if (!cur) return cur;
        const i = cur.findIndex((t) => t.id === th.id);
        const next = i >= 0 ? cur.map((t, k) => (k === i ? { ...t, ...th } : t)) : [{ ...th }, ...cur];
        return next.slice().sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      });
    });
    return off;
  }, [visible, load, host, cwd]);

  const pick = useCallback((t: Thread) => {
    if (busyId) return;
    haptic.keyPress();
    onOpen(t);
    onClose();
  }, [busyId, onOpen, onClose]);

  const adopt = useCallback(async (t: Thread) => {
    if (busyId || t.ownerTid == null) return;
    setBusyId(t.id); setRowErr(null);
    try {
      const r = await convService.adopt(host, t.cwd || cwd, Number(t.ownerTid));
      if (!aliveRef.current) return;
      onOpen(r.thread || t);
      onClose();
    } catch (e) {
      if (aliveRef.current) setRowErr({ id: t.id, code: toConvError(e).code });
    } finally { if (aliveRef.current) setBusyId(null); }
  }, [busyId, host, cwd, onOpen, onClose]);

  const remove = useCallback(async (t: Thread) => {
    if (busyId) return;
    setBusyId(t.id); setRowErr(null);
    try {
      await convService.remove(host, t.id);
      void convCache.removeConv(account, host, t.id);
      if (aliveRef.current) { setRows((cur) => (cur ? cur.filter((x) => x.id !== t.id) : cur)); setConfirmId(null); }
    } catch (e) {
      if (aliveRef.current) setRowErr({ id: t.id, code: toConvError(e).code });
    } finally { if (aliveRef.current) setBusyId(null); }
  }, [busyId, host, account]);

  const now = Date.now();
  const renderRow = ({ item: t }: { item: Thread }) => {
    const inTerminal = t.owner === 'terminal';
    const fromTerminal = !!t.external || inTerminal;
    const needs = (t.pending || 0) > 0 || t.state === 'waiting';
    const working = t.state === 'working';
    const current = !!currentId && t.id === currentId;
    const confirming = confirmId === t.id;
    const busy = busyId === t.id;
    const failed = rowErr && rowErr.id === t.id ? rowErr.code : null;
    const canDelete = !t.external;
    const askDelete = () => { haptic.keyPress(); setConfirmId(t.id); setRowErr(null); };
    return (
      <View style={{ borderRadius: v2.radius.md, backgroundColor: current ? C.selected : 'transparent', marginBottom: 2, overflow: 'hidden' }}>
        <Swipeable
          enabled={canDelete && !confirming}
          friction={2}
          rightThreshold={40}
          overshootRight={false}
          containerStyle={{ backgroundColor: 'transparent' }}
          // 밀 때 뒤의 [삭제] 가 비치지 않게 시트 면(elevated)으로 불투명하게 — 선택 워시는 행이 덧칠한다.
          childrenContainerStyle={{ backgroundColor: C.elevated }}
          // 지울 수 없는 행(터미널에서 만든 대화)에는 동작 자체를 그리지 않는다(스크린리더에도 안 보이게).
          renderRightActions={!canDelete ? undefined : (_p, _t, m: SwipeableMethods) => (
            <PressableScale
              onPress={() => { m.close(); askDelete(); }}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('삭제')}
              style={{ width: 84, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: tint(C.error) }}
            >
              <Trash size={18} color={C.error} />
              <Text style={{ color: C.error, fontSize: v2.font.size.caption, fontWeight: '500' }}>{i18n.t('삭제')}</Text>
            </PressableScale>
          )}
        >
        <PressableRow
          onPress={() => { if (confirming) return; if (inTerminal) return; pick(t); }}
          onLongPress={() => { if (!canDelete) return; askDelete(); }}
          delayLongPress={380}
          selected={current}
          minHeight={56}
          accessibilityLabel={t.title || i18n.t('제목 없는 대화')}
          accessibilityHint={canDelete ? i18n.t('길게 누르거나 왼쪽으로 밀어 삭제') : undefined}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <View style={{ width: 18, alignItems: 'center', marginTop: 2 }}>
            {fromTerminal ? <TerminalWindow size={16} color={C.text3} /> : <ChatCircle size={16} color={current ? C.text : C.text3} weight={current ? 'fill' : 'regular'} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }}>
                {t.title || i18n.t('제목 없는 대화')}
              </Text>
              {/* 상태 점 — 조치 필요는 색(부름), 작업 중은 무채색. 둘 다 아니면 없다. */}
              {needs ? <View accessibilityLabel={i18n.t('조치 필요')} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} />
                : working ? <View accessibilityLabel={i18n.t('작업 중')} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.text3 }} /> : null}
              <View style={{ flex: 1 }} />
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{fmtAgo(t.lastAt, now)}</Text>
            </View>
            {t.preview ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.small, lineHeight: 18, marginTop: 2 }}>{t.preview}</Text> : null}
            {fromTerminal ? (
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 3 }}>
                {inTerminal ? i18n.t('터미널에서 사용 중') : i18n.t('터미널에서 만든 대화')}
              </Text>
            ) : null}
            {inTerminal ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <PressableScale
                  onPress={() => { void adopt(t); }}
                  disabled={busy || t.ownerTid == null}
                  baseOpacity={busy || t.ownerTid == null ? 0.5 : 1}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t('채팅으로 가져오기')}
                  style={{ height: 32, paddingHorizontal: 12, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.hover, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  {busy ? <ActivityIndicator size="small" color={C.text2} /> : null}
                  <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '500' }}>{i18n.t('채팅으로 가져오기')}</Text>
                </PressableScale>
              </View>
            ) : null}
            {failed ? <Text style={{ color: C.error, fontSize: v2.font.size.caption, marginTop: 4 }}>{errorText(failed)}</Text> : null}
          </View>
        </PressableRow>
        </Swipeable>
        {confirming ? (
          <Animated.View entering={FadeIn.duration(140)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, paddingLeft: 40 }}>
            <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>{i18n.t('이 대화를 지울까요? 되돌릴 수 없어요.')}</Text>
            <PressableScale
              onPress={() => setConfirmId(null)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('취소')}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.hover, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '500' }}>{i18n.t('취소')}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => { void remove(t); }}
              disabled={busy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('삭제')}
              // Button danger 규격 — 글씨 error + 14% 틴트(눌림 대신 확인 단계라 상시 틴트로 무게를 준다).
              style={{ height: 32, paddingHorizontal: 12, borderRadius: v2.radius.md, backgroundColor: tint(C.error), flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              {busy ? <ActivityIndicator size="small" color={C.error} /> : <Trash size={14} color={C.error} />}
              <Text style={{ color: C.error, fontSize: v2.font.size.small, fontWeight: '500' }}>{i18n.t('삭제')}</Text>
            </PressableScale>
          </Animated.View>
        ) : null}
      </View>
    );
  };

  return (
    // Sheet 가 GestureHandlerRootView 를 품고 있다 — Modal 안에서도 밀어서 삭제(Swipeable)가 동작한다.
    <Sheet
      visible={visible}
      onClose={onClose}
      maxHeightPct={0.78}
      paddingHorizontal={0}
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 8, gap: 8 }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: v2.font.size.h2, fontWeight: '600', color: C.text, fontFamily: v2.font.sans }}>{i18n.t('대화')}</Text>
          <Button
            label={i18n.t('새 대화')}
            size="sm"
            icon={<Plus size={14} color={buttonLabelColor('secondary')} weight="bold" />}
            onPress={() => { haptic.keyPress(); onNew(); onClose(); }}
          />
          <IconButton icon={X} onPress={onClose} accessibilityLabel={i18n.t('닫기')} />
        </View>
      )}
    >
      {err ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={{ flex: 1, color: C.error, fontSize: v2.font.size.small }}>{errorText(err)}</Text>
          <Button label={i18n.t('다시 시도')} size="sm" variant="ghost" onPress={() => { void load(); }} />
        </View>
      ) : null}
      {rows === null ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 6 }}
          ListEmptyComponent={err ? null : (
            <EmptyState centered style={{ flex: 0, paddingVertical: 32 }} title={i18n.t('아직 대화가 없어요')} />
          )}
        />
      )}
    </Sheet>
  );
}
