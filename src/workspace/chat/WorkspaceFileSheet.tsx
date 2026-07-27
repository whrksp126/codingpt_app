import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import daemonService from '../../services/daemonService';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import { KeyAssistOverlay } from '../../components/keyboard/KeyAssist';
import PressableScale from '../../components/ui/PressableScale';
import { FileTypeIcon } from '../fileIcons';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;

// 워크스페이스 파일 고르기 시트 — 고른 파일의 **경로를 채팅 입력에 삽입**한다(claude 가 그 경로를 읽는다).
//  · 목록은 IDE 트리와 **같은 원천**을 재사용한다: `daemonService.fsTree(root, host)` = 워크스페이스 루트
//    아래 파일 flat 목록(경로는 root 기준 상대). 새 원격 fs 프로토콜을 만들지 않는다.
//  · 폴더 컬럼 탐색(PcWorkspaceSheet)이 아니라 **필터 한 줄**인 이유: 여기서 원하는 건 "폴더 고르기" 가
//    아니라 "이미 아는 파일 하나 빨리 집기" 다(에디터 quick-open 관례). 다중 선택도 지원.
//  · 시트 골격/색/딤은 PcWorkspaceSheet 와 같은 규율(하단 시트 + KeyAssistOverlay inModal).

const LIST_MAX = 400; // 렌더 상한 — 필터 전 대형 리포에서 목록이 수만 줄이 되는 것을 막는다.

export default function WorkspaceFileSheet({ visible, onClose, onPick, root, host }: {
  visible: boolean;
  onClose: () => void;
  /** 고른 파일들의 **워크스페이스 상대경로** — 호출부가 삽입 형식을 정한다. */
  onPick: (relPaths: string[]) => void;
  /** 워크스페이스 루트(홈-기준 상대 = ws.localPath) */
  root: string;
  /** 이 워크스페이스의 호스트 PC(hostDeviceId) */
  host: number | null;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQ(''); setSel([]); setErr(null); setLoading(true);
    let alive = true;
    daemonService.fsTree(root, host)
      .then((t) => { if (alive) { setItems(t.items.map((i) => i.path)); setLoading(false); } })
      // 빈 목록으로 뭉개지 않는다 — 오프라인/권한 실패를 그대로 보여준다(조용한 빈 화면 금지).
      .catch((e: any) => { if (alive) { setErr(String(e?.message || e)); setLoading(false); } });
    return () => { alive = false; };
  }, [visible, root, host]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = needle ? items.filter((p) => p.toLowerCase().includes(needle)) : items;
    return hit.slice(0, LIST_MAX);
  }, [items, q]);

  const toggle = useCallback((p: string) => {
    setSel((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }, []);

  const confirm = useCallback(() => {
    if (!sel.length) return;
    onPick(sel);
    onClose();
  }, [sel, onPick, onClose]);

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10,
        paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '84%',
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 10 }}>파일 선택</Text>

        {/* 필터 — 경로 일부만 입력해도 좁혀진다(quick-open). 보조바는 이 인풋에서도 정상 노출된다. */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 10,
          borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
        }}>
          <MagnifyingGlass size={15} color={C.textDim} />
          <KeyTextInput
            value={q} onChangeText={setQ} autoFocus
            placeholder="파일 이름" placeholderTextColor={C.textDim}
            style={{ flex: 1, color: C.text, fontSize: 13.5, padding: 0 }}
          />
        </View>

        <View style={{ minHeight: 120, maxHeight: 360, marginTop: 10 }}>
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} />
          ) : err ? (
            <Text style={{ color: C.error, fontSize: 12.5, paddingVertical: 24, textAlign: 'center' }}>{err}</Text>
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(p) => p}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 24, textAlign: 'center' }}>일치하는 파일이 없어요</Text>}
              renderItem={({ item }) => {
                const on = sel.includes(item);
                const name = item.slice(item.lastIndexOf('/') + 1);
                const dir = item.slice(0, Math.max(0, item.length - name.length - 1));
                return (
                  <Pressable
                    onPress={() => toggle(item)} android_ripple={{ color: C.elevated2 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 8, borderRadius: R.sm, backgroundColor: on ? C.elevated2 : 'transparent' }}
                  >
                    <FileTypeIcon name={name} size={15} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: on ? C.text : C.text2, fontSize: 13.5, fontWeight: on ? '600' : '400' }}>{name}</Text>
                      {dir ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, fontFamily: v2.font.mono }}>{dir}</Text> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Pressable onPress={onClose} style={{ flex: 1, height: 46, borderRadius: R.md, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>취소</Text>
          </Pressable>
          <PressableScale
            onPress={confirm} disabled={!sel.length} baseOpacity={sel.length ? 1 : 0.5}
            style={{ flex: 1, height: 46, borderRadius: R.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.onAccent, fontWeight: '800', fontSize: 14 }}>
              {sel.length > 1 ? `${sel.length}개 넣기` : '넣기'}
            </Text>
          </PressableScale>
        </View>
      </View>
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
