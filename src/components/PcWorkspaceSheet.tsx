import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Folder, FolderPlus, CaretRight, House, ArrowUp, Check, Warning, X } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import daemonService from '../services/daemonService';
import workspaceService from '../services/workspaceService';
import { daemonProjectId } from '../services/ideSource';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import { useAppAlert } from '../hooks/useAppAlert';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;

// 내 PC 워크스페이스 = 선택한 PC 폴더 "자체"를 워크스페이스로 지정(폴더명=워크스페이스명). 하위폴더 생성 X.
//  폴더 브라우저로 이동 → '이 폴더로 지정' / '새 폴더 만들기(PC에 mkdir)'. 데몬 IDE/워크스페이스뷰로 진입.
type Phase = 'loading' | 'pick' | 'busy';

export default function PcWorkspaceSheet({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (created: { id: string; name: string; localPath: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const navigation = useNavigation<any>();
  const { alert } = useAppAlert();
  const { setActiveWorkspace } = useAgentSession();
  const { openIde, reload: reloadProject } = useIdeProject();
  const { reload: reloadStore } = useWorkspaceStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [dir, setDir] = useState('');                 // 현재 브라우징 위치(홈-기준 상대, ''=홈)
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const loadDir = useCallback((target: string) => {
    setDirLoading(true);
    daemonService.fsList(target)
      .then((res) => { setDir(res.root); setDirs(res.items.filter((it) => it.dir).map((it) => ({ name: it.name, path: it.path }))); })
      .catch(() => setDirs([]))
      .finally(() => setDirLoading(false));
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPhase('loading'); setNewOpen(false); setNewName('');
    daemonService.wsGetRoot()
      .then((r) => { const start = r.lastParent ?? ''; setPhase('pick'); loadDir(start); })
      .catch(() => { setPhase('pick'); loadDir(''); });
  }, [visible]);

  const goUp = useCallback(() => {
    if (!dir) return;
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    loadDir(parent);
  }, [dir, loadDir]);

  const dirProtected = /^(desktop|documents|downloads|movies|music|pictures|library)(\/|$)/i.test(dir);
  const currentName = dir === '' ? '홈' : dir.slice(dir.lastIndexOf('/') + 1);

  // PC 에 새 폴더 만들기(현재 위치 아래).
  const makeFolder = useCallback(async () => {
    const nm = newName.trim();
    if (!nm) return;
    const target = dir ? `${dir}/${nm}` : nm;
    try {
      await daemonService.fsMkdir(target);
      setNewOpen(false); setNewName('');
      loadDir(dir); // 목록 새로고침(새 폴더 노출)
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '폴더를 만들 수 없어요.' });
    }
  }, [newName, dir, loadDir, alert]);

  // 현재 폴더를 워크스페이스로 지정.
  const designate = useCallback(async () => {
    setPhase('busy');
    try {
      const w = await daemonService.wsCreate({ path: dir });
      let createdId = '';
      try { const reg: any = await workspaceService.createWorkspace({ name: w.name, kind: 'project', compute: 'local', localPath: w.path }); createdId = reg?.workspace?.id || ''; void reloadStore(true); }
      catch (_) { /* 메타 등록 실패 — 다음 새로고침 시 반영 */ }
      if (onCreated) { onCreated({ id: createdId, name: w.name, localPath: w.path }); onClose(); return; }
      // 레거시(구 IDE 오버레이) 진입.
      const pid = daemonProjectId(w.path);
      setActiveWorkspace({ id: pid, name: w.name, kind: 'project' });
      navigation.navigate('Tabs', { screen: 'home' });
      openIde({ ide: { projectId: pid, projectName: w.name } });
      reloadProject(pid).catch(() => { /* noop */ });
      onClose();
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '이 폴더를 워크스페이스로 지정할 수 없어요.' });
      setPhase('pick');
    }
  }, [dir, onCreated, setActiveWorkspace, navigation, openIde, onClose, reloadProject, reloadStore, alert]);

  const dirLabel = dir === '' ? '홈(~)' : `~/${dir}`;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '82%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>PC 폴더를 워크스페이스로</Text>
        <Text style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>작업할 폴더로 이동한 뒤 '이 폴더로 지정'. 새 폴더를 만들어 지정할 수도 있어요.</Text>

        {phase === 'loading' || phase === 'busy' ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
            {phase === 'busy' && <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 10 }}>워크스페이스로 지정 중…</Text>}
          </View>
        ) : (
          <>
            {/* 현재 위치 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: R.md, backgroundColor: C.elevated2, marginBottom: 8 }}>
              <House size={15} color={C.text2} weight="fill" />
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }} numberOfLines={1}>{dirLabel}</Text>
              <Pressable onPress={goUp} disabled={!dir} hitSlop={6} style={{ opacity: dir ? 1 : 0.35, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <ArrowUp size={15} color={C.text2} /><Text style={{ fontSize: 12, color: C.text2 }}>상위로</Text>
              </Pressable>
            </View>

            {/* 새 폴더 만들기(인라인) */}
            {newOpen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={newName} onChangeText={setNewName} autoFocus
                  placeholder="새 폴더 이름" placeholderTextColor={C.textDim}
                  onSubmitEditing={makeFolder} returnKeyType="done"
                  style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, color: C.text, fontSize: 14 }}
                />
                <Btn variant="primary" sm onPress={makeFolder}>만들기</Btn>
                <Pressable onPress={() => { setNewOpen(false); setNewName(''); }} hitSlop={8}><X size={18} color={C.textDim} /></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setNewOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 4 }}>
                <FolderPlus size={18} color={C.accent} weight="fill" />
                <Text style={{ fontSize: 13.5, color: C.accent, fontWeight: '600' }}>여기에 새 폴더 만들기</Text>
              </Pressable>
            )}

            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {dirLoading ? (
                <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
              ) : dirs.length === 0 ? (
                <Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 18, textAlign: 'center' }}>하위 폴더가 없어요 · 이 폴더를 지정할 수 있어요</Text>
              ) : (
                dirs.map((d) => (
                  <Pressable key={d.path} onPress={() => loadDir(d.path)} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <Folder size={18} color={C.accent} weight="fill" />
                    <Text style={{ flex: 1, color: C.text, fontSize: 13.5 }} numberOfLines={1}>{d.name}</Text>
                    <CaretRight size={15} color={C.textDim} />
                  </Pressable>
                ))
              )}
            </ScrollView>

            {dirProtected && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, paddingHorizontal: 2 }}>
                <Warning size={14} color={C.warn} weight="fill" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11.5, color: C.warn }}>macOS 보호폴더는 접근 시 PC에서 권한 허용을 물어볼 수 있어요.</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, color: C.textDim }}>워크스페이스 이름</Text>
                <Text style={{ fontSize: 13.5, color: C.text, fontWeight: '700' }} numberOfLines={1}>{currentName}</Text>
              </View>
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
