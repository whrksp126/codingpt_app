import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cloud, FolderPlus, ArrowUp, Check, X } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import workspaceService from '../services/workspaceService';
import { useAppAlert } from '../hooks/useAppAlert';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;

// 클라우드 워크스페이스 = 격리 볼륨(/workspace) 안에 폴더 하나를 "지정".
//  PC 폴더 브라우저와 달리 클라우드 러너는 워크스페이스마다 빈 볼륨이라 미리 볼 기존 폴더가 없다.
//  → 러너 기동 없이(어떤 환경에서도) 클라이언트에서 경로를 조립: 상위경로(new folder 로 중첩) + 이름.
//  등록 시 compute='cloud', localPath=<조립 경로>. 실제 폴더는 클라우드 러너 첫 기동 때 그 경로에서 생성.

// 경로 세그먼트 정규화(공백→-, 안전문자만). 빈 값이면 ''.
function sanitizeSeg(s: string): string {
  return String(s || '')
    .trim()
    .replace(/[^가-힣a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function CloudWorkspaceSheet({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (created: { id: string; name: string; localPath: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const { alert } = useAppAlert();

  const [base, setBase] = useState('');           // 조립 중인 상위 경로(/workspace 기준 상대, ''=루트)
  const [name, setName] = useState('');           // 지정할 워크스페이스 폴더 이름
  const [newOpen, setNewOpen] = useState(false);  // "여기에 새 폴더 만들기" 인라인
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBase(''); setName(''); setNewOpen(false); setNewName(''); setBusy(false);
  }, [visible]);

  const goUp = useCallback(() => {
    setBase((b) => (b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : ''));
  }, []);

  // 새 폴더 만들기 = 현재 위치 아래로 한 단계 들어감(중첩 경로 조립).
  const enterNewFolder = useCallback(() => {
    const nm = sanitizeSeg(newName);
    if (!nm) return;
    setBase((b) => (b ? `${b}/${nm}` : nm));
    setNewOpen(false); setNewName('');
  }, [newName]);

  const locationLabel = base ? `/workspace/${base}` : '/workspace';
  const finalName = sanitizeSeg(name) || (base ? base.slice(base.lastIndexOf('/') + 1) : '');

  const designate = useCallback(async () => {
    const nm = sanitizeSeg(name);
    // 이름을 비우면 현재 위치(base)의 마지막 폴더를 워크스페이스로 지정. 둘 다 비면 막는다.
    const finalPath = nm ? (base ? `${base}/${nm}` : nm) : base;
    if (!finalPath) { alert({ title: '이름 필요', message: '워크스페이스 폴더 이름을 입력하거나 폴더를 먼저 만들어 주세요.' }); return; }
    const displayName = nm || finalPath.slice(finalPath.lastIndexOf('/') + 1) || '워크스페이스';
    setBusy(true);
    try {
      const reg: any = await workspaceService.createWorkspace({ name: displayName, kind: 'project', compute: 'cloud', localPath: finalPath });
      const id = reg?.workspace?.id || '';
      onCreated?.({ id, name: displayName, localPath: finalPath });
      onClose();
    } catch (e: any) {
      alert({ title: '생성 실패', message: e?.message || String(e) });
      setBusy(false);
    }
  }, [name, base, alert, onCreated, onClose]);

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '82%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>새 클라우드 워크스페이스</Text>
        <Text style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>클라우드 러너의 격리 공간 안에 만들 폴더 이름을 정하세요. 하위 폴더를 만들어 중첩할 수도 있어요.</Text>

        {busy ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
            <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 10 }}>클라우드 워크스페이스 만드는 중…</Text>
          </View>
        ) : (
          <>
            {/* 현재 위치 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: R.md, backgroundColor: C.elevated2, marginBottom: 8 }}>
              <Cloud size={15} color={C.text2} weight="fill" />
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }} numberOfLines={1}>{locationLabel}</Text>
              <Pressable onPress={goUp} disabled={!base} hitSlop={6} style={{ opacity: base ? 1 : 0.35, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <ArrowUp size={15} color={C.text2} /><Text style={{ fontSize: 12, color: C.text2 }}>상위로</Text>
              </Pressable>
            </View>

            {/* 여기에 새 폴더 만들기(중첩) */}
            {newOpen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={newName} onChangeText={setNewName} autoFocus
                  placeholder="새 폴더 이름" placeholderTextColor={C.textDim}
                  onSubmitEditing={enterNewFolder} returnKeyType="done"
                  autoCapitalize="none" autoCorrect={false}
                  style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, color: C.text, fontSize: 14 }}
                />
                <Btn variant="primary" sm onPress={enterNewFolder}>만들기</Btn>
                <Pressable onPress={() => { setNewOpen(false); setNewName(''); }} hitSlop={8}><X size={18} color={C.textDim} /></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setNewOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 4 }}>
                <FolderPlus size={18} color={C.accent} weight="fill" />
                <Text style={{ fontSize: 13.5, color: C.accent, fontWeight: '600' }}>여기에 새 폴더 만들기</Text>
              </Pressable>
            )}

            {/* 워크스페이스 폴더 이름 */}
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>워크스페이스 폴더 이름</Text>
              <TextInput
                value={name} onChangeText={setName}
                placeholder="예: my-project" placeholderTextColor={C.textDim}
                onSubmitEditing={designate} returnKeyType="done"
                autoCapitalize="none" autoCorrect={false}
                style={{ height: 44, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, color: C.text, fontSize: 15 }}
              />
              {finalName ? (
                <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, fontFamily: v2.font.mono }} numberOfLines={1}>
                  → {base ? `/workspace/${base}/${finalName}` : `/workspace/${finalName}`}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Btn variant="ghost" sm onPress={onClose}>취소</Btn>
              <Btn variant="primary" sm onPress={designate}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Check size={15} color="#fff" weight="bold" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>이 폴더로 지정</Text></View>
              </Btn>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
