import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import KeyTextInput from './keyboard/KeyTextInput';
import { KeyAssistOverlay } from './keyboard/KeyAssist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Folder, Check, Warning, FolderPlus, X } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import daemonService from '../services/daemonService';
import workspaceService from '../services/workspaceService';
import { daemonProjectId } from '../services/ideSource';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import { useAppAlert } from '../hooks/useAppAlert';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;
const COL_W = 210; // 컬럼 폭(macOS Finder 컬럼뷰식)

// 내 PC 워크스페이스 = 선택한 PC 폴더 "자체"를 워크스페이스로 지정(폴더명=워크스페이스명, 이름은 나중에 변경 가능).
//  macOS Finder 컬럼뷰식 — 좌→우 다단으로 폴더를 파고들고, 선택한 폴더를 '이 폴더로 지정'.
//  PC 선택은 이 시트 진입 전 별도 시트에서 끝난 상태(host=hostDeviceId)로 들어온다.
type Col = { path: string; items: { name: string; path: string }[]; loading: boolean };

export default function PcWorkspaceSheet({ visible, onClose, onCreated, host, hostName }: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (created: { id: string; name: string; localPath: string }) => void;
  host?: number | null;   // 대상 PC(hostDeviceId). 미지정 = 활성 러너.
  hostName?: string;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const navigation = useNavigation<any>();
  const { alert } = useAppAlert();
  const { setActiveWorkspace, openIde, reload: reloadProject } = useIdeProject();
  const { reload: reloadStore } = useWorkspaceStore();

  const [cols, setCols] = useState<Col[]>([]);   // 좌→우 컬럼
  const [sel, setSel] = useState<string[]>([]);  // 각 컬럼에서 선택한 폴더 path (길이=선택 깊이)
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // 지정 대상 = 가장 깊이 선택한 폴더(없으면 홈 '').
  const targetPath = sel.length ? sel[sel.length - 1] : '';

  const loadCol = useCallback(async (path: string): Promise<Col> => {
    try {
      const res = await daemonService.fsList(path, host);
      return { path: res.root, items: res.items.filter((it) => it.dir).map((it) => ({ name: it.name, path: it.path })), loading: false };
    } catch { return { path, items: [], loading: false }; }
  }, [host]);

  // 진입 시 홈 컬럼부터.
  useEffect(() => {
    if (!visible) return;
    setSel([]); setBusy(false); setNewOpen(false); setNewName('');
    setCols([{ path: '', items: [], loading: true }]);
    loadCol('').then((home) => setCols([home]));
  }, [visible, loadCol]);

  // 컬럼 i 의 폴더 선택 → i 이후 컬럼을 자르고 자식 컬럼을 로드(가로 끝으로 스크롤).
  const onPickFolder = useCallback(async (colIdx: number, folderPath: string) => {
    setSel((prev) => [...prev.slice(0, colIdx), folderPath]);
    setCols((prev) => [...prev.slice(0, colIdx + 1), { path: folderPath, items: [], loading: true }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    const child = await loadCol(folderPath);
    setCols((prev) => {
      const next = prev.slice(0, colIdx + 1);
      next.push(child);
      return next;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  }, [loadCol]);

  const dirProtected = /^(desktop|documents|downloads|movies|music|pictures|library)(\/|$)/i.test(targetPath);

  // PC 에 새 폴더 만들기(현재 선택 폴더 아래).
  const makeFolder = useCallback(async () => {
    const nm = newName.trim();
    if (!nm) return;
    const target = targetPath ? `${targetPath}/${nm}` : nm;
    try {
      await daemonService.fsMkdir(target, host);
      setNewOpen(false); setNewName('');
      // 마지막 컬럼(현재 선택 폴더의 자식 목록) 새로고침.
      const depth = sel.length; // 자식 컬럼 인덱스
      const refreshed = await loadCol(targetPath);
      setCols((prev) => { const next = prev.slice(0, depth); next.push(refreshed); return next; });
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '폴더를 만들 수 없어요.' });
    }
  }, [newName, targetPath, sel.length, loadCol, alert]);

  // 선택한 폴더를 워크스페이스로 지정.
  const designate = useCallback(async () => {
    setBusy(true);
    try {
      const w = await daemonService.wsCreate({ path: targetPath, host });
      let createdId = '';
      try { const reg: any = await workspaceService.createWorkspace({ name: w.name, kind: 'project', compute: 'local', localPath: w.path, remoteUrl: w.remoteUrl }); createdId = reg?.workspace?.id || ''; void reloadStore(true); }
      catch (_) { /* 메타 등록 실패 — 다음 새로고침 시 반영 */ }
      if (onCreated) { onCreated({ id: createdId, name: w.name, localPath: w.path }); onClose(); return; }
      const pid = daemonProjectId(w.path);
      setActiveWorkspace({ id: pid, name: w.name, kind: 'project' });
      navigation.navigate('Tabs', { screen: 'home' });
      openIde({ ide: { projectId: pid, projectName: w.name } });
      reloadProject(pid).catch(() => { /* noop */ });
      onClose();
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '이 폴더를 워크스페이스로 지정할 수 없어요.' });
      setBusy(false);
    }
  }, [targetPath, host, onCreated, setActiveWorkspace, navigation, openIde, onClose, reloadProject, reloadStore, alert]);

  // 표시용 전체 경로(줄바꿈, 생략 없음).
  const fullPath = `${hostName || '내 PC'} / ${targetPath ? targetPath.split('/').join(' / ') : '홈'}`;

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '84%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />

        {/* 헤더: 제목 + 새 폴더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>폴더 선택</Text>
          <Pressable onPress={() => { setNewOpen((v) => !v); setNewName(''); }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6 }}>
            <FolderPlus size={17} color={C.text2} />
            <Text style={{ fontSize: 12.5, color: C.text2, fontWeight: '600' }}>새 폴더</Text>
          </Pressable>
        </View>

        {/* 전체 경로 — 생략(...) 없이 줄바꿈으로 전부 표시 */}
        <Text style={{ fontFamily: v2.font.mono, fontSize: 12, color: C.textDim, lineHeight: 18, marginBottom: 10 }}>{fullPath}</Text>

        {/* 새 폴더 인라인 입력 */}
        {newOpen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <KeyTextInput
              value={newName} onChangeText={setNewName} autoFocus
              placeholder="새 폴더 이름" placeholderTextColor={C.textDim}
              onSubmitEditing={makeFolder} returnKeyType="done"
              style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, color: C.text, fontSize: 14 }}
            />
            <Pressable onPress={makeFolder} style={{ height: 40, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#052e16', fontWeight: '800', fontSize: 13 }}>만들기</Text>
            </Pressable>
            <Pressable onPress={() => { setNewOpen(false); setNewName(''); }} hitSlop={8}><X size={18} color={C.textDim} /></Pressable>
          </View>
        ) : null}

        {/* 미러 컬럼 — 좌→우 다단, 가로 스크롤 */}
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 320 }}
          contentContainerStyle={{ gap: 1 }}>
          {cols.map((col, ci) => (
            <View key={`${ci}:${col.path}`} style={{ width: COL_W, borderRightWidth: ci < cols.length - 1 ? 1 : 0, borderRightColor: C.border }}>
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {col.loading ? (
                  <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
                ) : col.items.length === 0 ? (
                  <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 20, paddingHorizontal: 10, textAlign: 'center' }}>하위 폴더 없음</Text>
                ) : (
                  col.items.map((d) => {
                    const selected = sel[ci] === d.path;
                    return (
                      <Pressable key={d.path} onPress={() => onPickFolder(ci, d.path)} android_ripple={{ color: C.elevated2 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 10, borderRadius: R.sm, backgroundColor: selected ? C.elevated2 : 'transparent' }}>
                        <Folder size={17} color={C.text2} />
                        <Text style={{ flex: 1, color: selected ? C.text : C.text2, fontSize: 13.5, fontWeight: selected ? '600' : '400' }} numberOfLines={1}>{d.name}</Text>
                        {selected ? <Check size={15} color={C.accent} weight="bold" /> : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        {dirProtected && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, paddingHorizontal: 2 }}>
            <Warning size={14} color={C.warn} weight="fill" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 11.5, color: C.warn }}>macOS 보호폴더는 접근 시 PC에서 권한 허용을 물어볼 수 있어요.</Text>
          </View>
        )}

        {/* 하단 버튼 — '내 PC 연결' 확인 시트와 동일한 스타일(취소 elevated2 / 지정 accent, 나란히 풀폭) */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Pressable onPress={onClose} disabled={busy} style={{ flex: 1, height: 46, borderRadius: R.md, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>취소</Text>
          </Pressable>
          <Pressable onPress={designate} disabled={busy} style={{ flex: 1, height: 46, borderRadius: R.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: busy ? 0.7 : 1 }}>
            {busy ? <ActivityIndicator size="small" color="#052e16" /> : null}
            <Text style={{ color: '#052e16', fontWeight: '800', fontSize: 14 }}>{busy ? '지정 중…' : '이 폴더로 지정'}</Text>
          </Pressable>
        </View>
      </View>
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
