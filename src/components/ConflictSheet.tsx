import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Warning, Laptop, Cloud } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import type { SyncConflictFile } from '../services/daemonService';

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
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, paddingBottom: insets.bottom + 12, maxHeight: '80%' }}>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }}>
            <Warning size={20} color="#F59E0B" weight="fill" />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>동기화 충돌</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 13, paddingHorizontal: 18, marginBottom: 6 }}>
            갈라진 파일이 {files.length}개 있어요. 각 파일에서 어느 쪽을 남길지 고르세요.{'\n'}진 버전은 rescue 브랜치에 보존돼요.
          </Text>

          {/* 파일 목록 — 파일별 택1 */}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}>
            {files.map((f) => {
              const side = picks[f.path] || 'local';
              return (
                <View key={f.path} style={{ backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 12, marginBottom: 8 }}>
                  <Text numberOfLines={1} style={{ color: C.text2, fontSize: 13, fontFamily: 'monospace', marginBottom: 8 }}>{f.path}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <SideBtn active={side === 'local'} onPress={() => setPicks((p) => ({ ...p, [f.path]: 'local' }))} icon={<Laptop size={15} color={side === 'local' ? '#052e16' : C.text3} weight="bold" />} label="내 PC" />
                    <SideBtn active={side === 'cloud'} onPress={() => setPicks((p) => ({ ...p, [f.path]: 'cloud' }))} icon={<Cloud size={15} color={side === 'cloud' ? '#052e16' : C.text3} weight="bold" />} label="클라우드" />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* 액션 — 전부 한쪽 / 선택대로 적용 */}
          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Btn variant="ghost" sm full onPress={() => submit('local')} disabled={busy}>전부 내 PC</Btn></View>
              <View style={{ flex: 1 }}><Btn variant="ghost" sm full onPress={() => submit('cloud')} disabled={busy}>전부 클라우드</Btn></View>
            </View>
            <Btn variant="primary" full onPress={() => submit()} disabled={busy || !allPicked}>
              {busy ? '해결하는 중…' : '선택대로 해결'}
            </Btn>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SideBtn({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: R.md,
        backgroundColor: active ? C.accent : 'transparent', borderWidth: 1, borderColor: active ? C.accent : C.borderControl }}
    >
      {icon}
      <Text style={{ color: active ? '#052e16' : C.text3, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
