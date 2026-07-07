import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Folder, FolderOpen, CaretRight, House, ArrowUp } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import daemonService from '../services/daemonService';
import { daemonProjectId } from '../services/ideSource';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { useAppAlert } from '../hooks/useAppAlert';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;

// 내 PC 에 새 워크스페이스 만들기 — 최초 1회 루트 폴더 지정(피커) → 이름 → 결정적 스캐폴드(mkdir+git init) → 데몬 IDE 진입.
//  클라우드 생성 흐름과 독립. 루트는 daemon.json 에 저장되어 다음부턴 이름만 입력하면 됨.
type Phase = 'loading' | 'pickRoot' | 'name' | 'busy';

export default function PcWorkspaceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const navigation = useNavigation<any>();
  const { alert } = useAppAlert();
  const { setActiveWorkspace } = useAgentSession();
  const { openIde, reload: reloadProject } = useIdeProject();

  const [phase, setPhase] = useState<Phase>('loading');
  const [root, setRoot] = useState<string | null>(null);
  const [dir, setDir] = useState('');                 // 피커 현재 디렉토리(홈-기준 상대)
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [name, setName] = useState('');

  // 시트가 열릴 때 루트 조회 — 지정돼 있으면 바로 이름 입력, 없으면 폴더 피커.
  useEffect(() => {
    if (!visible) return;
    setPhase('loading'); setName('');
    daemonService.wsGetRoot()
      .then((r) => { setRoot(r); if (r) { setPhase('name'); } else { setDir(''); setPhase('pickRoot'); } })
      .catch(() => { setDir(''); setPhase('pickRoot'); setRoot(null); });
  }, [visible]);

  // 피커 디렉토리 로드(하위 폴더만).
  const loadDir = useCallback((target: string) => {
    setDirLoading(true);
    daemonService.fsList(target)
      .then((res) => { setDir(res.root); setDirs(res.items.filter((it) => it.dir).map((it) => ({ name: it.name, path: it.path }))); })
      .catch(() => setDirs([]))
      .finally(() => setDirLoading(false));
  }, []);
  useEffect(() => { if (phase === 'pickRoot') loadDir(dir); /* eslint-disable-next-line */ }, [phase]);

  const goUp = useCallback(() => {
    if (!dir) return;
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    loadDir(parent);
  }, [dir, loadDir]);

  const chooseRoot = useCallback(async () => {
    setPhase('busy');
    try { const saved = await daemonService.wsSetRoot(dir); setRoot(saved); setPhase('name'); }
    catch (e: any) { alert({ title: '오류', message: e?.message || '이 폴더를 지정할 수 없어요.' }); setPhase('pickRoot'); }
  }, [dir, alert]);

  const create = useCallback(async () => {
    const t = name.trim();
    if (!t) return;
    setPhase('busy');
    try {
      const w = await daemonService.wsCreate(t);
      const pid = daemonProjectId(w.path);
      setActiveWorkspace({ id: pid, name: w.name, kind: 'project' });
      navigation.navigate('Tabs', { screen: 'home' });
      openIde({ ide: { projectId: pid, projectName: w.name } });
      // 직전 데몬 워크스페이스가 활성이던 상태에서 만들면 초기 로드가 레이스로 버려질 수 있어(빈 트리),
      //  새 프로젝트를 강제 재로드해 스캐폴드 파일이 확실히 뜨도록 한다(force=true, projectId 정착 후 적용).
      reloadProject(pid).catch(() => { /* 다음 진입 시 정상 로드 */ });
      onClose();
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || 'PC 에 워크스페이스를 만들 수 없어요.' });
      setPhase('name');
    }
  }, [name, setActiveWorkspace, navigation, openIde, onClose]);

  const rootLabel = root === '' ? '홈(~)' : root ? `~/${root}` : '';
  const dirLabel = dir === '' ? '홈(~)' : `~/${dir}`;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '80%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>내 PC에 새 워크스페이스</Text>

        {phase === 'loading' || phase === 'busy' ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
            {phase === 'busy' && <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 10 }}>PC에 폴더를 만드는 중…</Text>}
          </View>
        ) : phase === 'pickRoot' ? (
          <>
            <Text style={{ fontSize: 12.5, color: C.textDim, marginBottom: 10 }}>워크스페이스를 담을 PC 폴더를 한 번만 정해요. 이 안에 프로젝트별 폴더가 생성됩니다.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: R.md, backgroundColor: C.elevated2, marginBottom: 8 }}>
              <House size={15} color={C.text2} weight="fill" />
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }} numberOfLines={1}>{dirLabel}</Text>
              <Pressable onPress={goUp} disabled={!dir} hitSlop={6} style={{ opacity: dir ? 1 : 0.35, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <ArrowUp size={15} color={C.text2} /><Text style={{ fontSize: 12, color: C.text2 }}>상위로</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {dirLoading ? (
                <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
              ) : dirs.length === 0 ? (
                <Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 18, textAlign: 'center' }}>하위 폴더가 없어요 · 여기를 위치로 지정할 수 있어요</Text>
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
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Btn variant="ghost" sm onPress={onClose}>취소</Btn>
              <Btn variant="primary" sm onPress={chooseRoot}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><FolderOpen size={15} color="#fff" weight="fill" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>여기로 지정</Text></View></Btn>
            </View>
          </>
        ) : (
          // name
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: C.textDim }}>생성 위치</Text>
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12, color: C.text2 }} numberOfLines={1}>{rootLabel}</Text>
              <Pressable onPress={() => { setDir(root || ''); setPhase('pickRoot'); }} hitSlop={6}><Text style={{ fontSize: 12, color: C.accent, fontWeight: '700' }}>변경</Text></Pressable>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="워크스페이스 이름 (예: 내-첫-앱)"
              placeholderTextColor={C.textDim}
              onSubmitEditing={create}
              returnKeyType="done"
              style={{ height: 44, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base, color: C.text, fontSize: 14 }}
            />
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>PC에 폴더가 만들어지고(git init 포함) 모바일 IDE로 바로 열려요. 여기 터미널에서 자기 claude로 이어서 작업하세요.</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Btn variant="ghost" sm onPress={onClose}>취소</Btn>
              <Btn variant="primary" sm onPress={create}>만들기</Btn>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
