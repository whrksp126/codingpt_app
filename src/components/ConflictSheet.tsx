import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Warning, Laptop, Cloud } from 'phosphor-react-native';

import { v2, tint } from '../theme/v2Tokens';
import { Sheet, PressableRow, Button } from './ui';
import type { SyncConflictFile } from '../services/daemonService';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;
const R = v2.radius;

type Side = 'local' | 'cloud';

// 동기화 충돌 택1 시트(M4 · wireflow §5) — 파일 단위 [내 PC / 클라우드] + "전부 한쪽".
//  진 쪽은 rescue 브랜치로 보존(되돌리기 가능)되므로 조용히 버려지지 않는다. 바이너리는 택1만.
//  폰 최적: hunk/풀 머지 에디터 없음(Post-MVP). 충돌 중 에이전트는 데몬에서 정지 상태.
export default function ConflictSheet({
  visible,
  files,
  onResolve,
  onClose,
}: {
  visible: boolean;
  files: SyncConflictFile[];
  onResolve: (choices: { path: string; side: Side }[], bulk?: Side) => void | Promise<void>;
  onClose: () => void;
}) {
  const [picks, setPicks] = useState<Record<string, Side>>({});
  const [busy, setBusy] = useState(false);

  // 열릴 때 기본값: 내 PC(로컬) 우선. 파일 목록 바뀌면 리셋.
  useEffect(() => {
    if (!visible) return;
    const init: Record<string, Side> = {};
    for (const f of files) init[f.path] = 'local';
    setPicks(init);
    setBusy(false);
  }, [visible, files]);

  const allPicked = useMemo(() => files.every((f) => picks[f.path]), [files, picks]);

  const submit = async (bulk?: Side) => {
    if (busy) return;
    setBusy(true);
    try {
      const choices = files.map((f) => ({ path: f.path, side: bulk || picks[f.path] || 'local' }));
      await onResolve(choices, bulk);
    } finally { setBusy(false); }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      maxHeightPct={0.8}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <Warning size={20} color={C.warn} weight="fill" />
          <Text style={{ color: C.text, fontSize: v2.font.size.h1, fontWeight: v2.font.weight.semibold }}>{i18n.t('동기화 충돌')}</Text>
        </View>
      }
    >
      <Text style={{ color: C.text3, fontSize: v2.font.size.small, marginBottom: 10 }}>
        {i18n.t('갈라진 파일이')} {files.length}{i18n.t('개 있어요. 각 파일에서 어느 쪽을 남길지 고르세요.')}{'\n'}{i18n.t('진 버전은 rescue 브랜치에 보존돼요.')}
      </Text>

      {/* 파일 목록 — 파일별 택1 */}
      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 4 }}>
        {files.map((f) => {
          const side = picks[f.path] || 'local';
          return (
            <View key={f.path} style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 12, marginBottom: 8 }}>
              <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.small, fontFamily: v2.font.mono, marginBottom: 8 }}>{f.path}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SideBtn active={side === 'local'} onPress={() => setPicks((p) => ({ ...p, [f.path]: 'local' }))} icon={<Laptop size={15} color={side === 'local' ? tint(C.warn) : C.text3} weight="bold" />} label={i18n.t('내 PC')} />
                <SideBtn active={side === 'cloud'} onPress={() => setPicks((p) => ({ ...p, [f.path]: 'cloud' }))} icon={<Cloud size={15} color={side === 'cloud' ? tint(C.warn) : C.text3} weight="bold" />} label={i18n.t('클라우드')} />
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 액션 — 전부 한쪽 / 선택대로 적용 */}
      <View style={{ paddingTop: 10, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" label={i18n.t('전부 내 PC')} onPress={() => submit('local')} disabled={busy} stretch />
          <Button variant="ghost" size="sm" label={i18n.t('전부 클라우드')} onPress={() => submit('cloud')} disabled={busy} stretch />
        </View>
        <Button
          variant="primary"
          label={busy ? i18n.t('해결하는 중…') : i18n.t('선택대로 해결')}
          onPress={() => submit()}
          disabled={busy || !allPicked}
          busy={busy}
          stretch
        />
      </View>
    </Sheet>
  );
}

function SideBtn({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
  return (
    <PressableRow
      onPress={onPress}
      radius={R.md}
      minHeight={0}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9,
        backgroundColor: active ? C.text : 'transparent', borderWidth: 1, borderColor: active ? C.text : C.borderControl,
      }}
    >
      {icon}
      <Text style={{ color: active ? C.base : C.text3, fontSize: v2.font.size.small, fontWeight: v2.font.weight.semibold }}>{label}</Text>
    </PressableRow>
  );
}
