// TaskList — 현황판 목록(그룹 섹션 + 카드). 그룹 순서 고정: 입력 대기 → 작업 중 → 리뷰 준비 → 대기 중(접힘) →
//  완료(접힘) (설계 §5.3). 빈 상태·PC 없음·업데이트 필요·오프라인 PC 줄을 여기서 그린다(§6.7 A).
//
// 모션(§6.8): 카드의 그룹이 **바뀔 때만** LayoutAnimation 1회. tasks.changed 재렌더마다 걸면 목록이 출렁인다.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, LayoutAnimation } from 'react-native';
import { CaretDown, CaretRight, Laptop } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { EmptyState, SectionHeader } from '../../components/ui';
import { tx } from '../../text';
import { TASKS_TEXT } from '../../text/tasks';
import TaskCard, { type CardAction } from './TaskCard';
import { GROUP_ORDER, type ModelOutput, type TaskGroup, type TaskRow } from './tasksModel';

const TX = tx(TASKS_TEXT);

const GROUP_LABEL: Record<TaskGroup, () => string> = {
  needs_input: () => TX.groupNeedsInput,
  working: () => TX.groupWorking,
  review_ready: () => TX.groupReviewReady,
  idle: () => TX.groupIdle,
  done: () => TX.groupDone,
};

export interface ListBanner { kind: 'pcNeedsUpdate' | 'serverNeedsUpdate' | 'noHost'; }

export default function TaskList({
  model, now, refreshing, onRefresh, onOpenRow, onAction, busy, selectedKey, seenIds, banners, onNewTask, onConnectPc,
}: {
  model: ModelOutput;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenRow: (row: TaskRow) => void;
  onAction: (row: TaskRow, a: CardAction) => void;
  busy: { k: string; a: CardAction } | null;
  selectedKey: string | null;
  seenIds: Set<string>;
  banners: ListBanner[];
  onNewTask: () => void;
  onConnectPc: () => void;
}) {
  const C = v2.colors;
  const [collapsed, setCollapsed] = useState<Record<TaskGroup, boolean>>({ needs_input: false, working: false, review_ready: false, idle: true, done: true });

  // 그룹 이동 감지 — 직전 렌더의 k→group 과 비교해 하나라도 바뀌었으면 다음 레이아웃에 1회 애니메이션.
  const prevGroups = useRef<Map<string, TaskGroup>>(new Map());
  const cur = new Map(model.rows.map((r) => [r.k, r.group] as [string, TaskGroup]));
  let moved = false;
  for (const [k, g] of cur) { const p = prevGroups.current.get(k); if (p && p !== g) { moved = true; break; } }
  if (moved) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  useEffect(() => { prevGroups.current = cur; });

  // 이번 렌더에 처음 보는 카드만 등장 모션 — 렌더가 끝나면 seen 에 넣는다(재렌더에 재생 금지).
  const fresh = new Set(model.rows.filter((r) => !seenIds.has(r.k)).map((r) => r.k));
  useEffect(() => { fresh.forEach((k) => seenIds.add(k)); });

  const total = model.rows.length;
  const noHost = banners.some((b) => b.kind === 'noHost');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text3} colors={[C.text3]} progressBackgroundColor={C.surface} />}
    >
      {banners.filter((b) => b.kind !== 'noHost').map((b) => (
        <View key={b.kind} style={{ marginTop: 8, padding: 10, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated }}>
          <Text style={{ color: C.text2, fontSize: 12.5 }}>{b.kind === 'pcNeedsUpdate' ? TX.pcNeedsUpdate : TX.serverNeedsUpdate}</Text>
        </View>
      ))}

      {model.offlineHosts.map((h) => (
        <View key={`off-${h.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: v2.radius.md, backgroundColor: C.elevated, opacity: 0.7 }}>
          <Laptop size={13} color={C.textDim} weight="fill" />
          <Text numberOfLines={1} style={{ flex: 1, color: C.text3, fontSize: 12.5 }}>{h.name || TX.pc}</Text>
          <Text style={{ color: C.textDim, fontSize: 11.5 }}>{TX.hostOffline}</Text>
        </View>
      ))}

      {total === 0 ? (
        <EmptyState
          centered
          title={noHost ? TX.noHost : TX.empty}
          sub={noHost ? undefined : TX.emptyHint}
          action={{ label: noHost ? TX.connectPc : TX.newTask, onPress: noHost ? onConnectPc : onNewTask, variant: 'primary' }}
        />
      ) : GROUP_ORDER.map((g) => {
        const list = model.groups[g];
        if (!list.length) return null;
        const folded = collapsed[g];
        return (
          <View key={g}>
            <PressableScale scaleTo={0.99} onPress={() => setCollapsed((c) => ({ ...c, [g]: !c[g] }))}
              style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View>
                {folded ? <CaretRight size={11} color={C.textDim} weight="bold" /> : <CaretDown size={11} color={C.textDim} weight="bold" />}
              </View>
              <View style={{ flex: 1 }}>
                <SectionHeader title={`${GROUP_LABEL[g]()} (${list.length})`} />
              </View>
            </PressableScale>
            {folded ? null : list.map((row, i) => (
              <TaskCard
                key={row.k}
                row={row}
                now={now}
                index={i}
                animate={fresh.has(row.k)}
                selected={selectedKey === row.k}
                onPress={() => onOpenRow(row)}
                onAction={(a) => onAction(row, a)}
                busyAction={busy && busy.k === row.k ? busy.a : null}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
