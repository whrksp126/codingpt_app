import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Folder, FolderOpen, CaretRight, House, ArrowUp, Sparkle, Warning } from 'phosphor-react-native';

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

// 내 PC 에 새 워크스페이스 만들기 — 이름 + 목적지 폴더를 매번 선택(git clone 방식) → 결정적 스캐폴드(mkdir+git init) → 데몬 IDE 진입.
//  단일 영구 루트 개념 폐기. 목적지 기본값 = 마지막 선택 폴더(lastParent), 없으면 홈(~). 매 생성마다 '변경'으로 폴더 재선택.
type Phase = 'loading' | 'name' | 'pickDest' | 'busy';

export default function PcWorkspaceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const navigation = useNavigation<any>();
  const { alert } = useAppAlert();
  const { setActiveWorkspace } = useAgentSession();
  const { openIde, reload: reloadProject } = useIdeProject();
  const { reload: reloadStore } = useWorkspaceStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [recommended, setRecommended] = useState('CodingPT/workspaces');
  const [allowFullDisk, setAllowFullDisk] = useState(false);
  const [dest, setDest] = useState('');               // 확정 목적지 부모(홈-기준 상대, ''=홈)
  const [dir, setDir] = useState('');                 // 피커 현재 디렉토리(홈-기준 상대)
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [name, setName] = useState('');

  // 시트가 열릴 때 마지막 선택 폴더/전체디스크 조회 → 바로 이름 입력. 아무것도 자동 생성하지 않음.
  useEffect(() => {
    if (!visible) return;
    setPhase('loading'); setName('');
    daemonService.wsGetRoot()
      .then((r) => {
        setRecommended(r.recommended);
        setAllowFullDisk(!!r.allowFullDisk);
        setDest(r.lastParent ?? '');
        setPhase('name');
      })
      .catch(() => { setDest(''); setPhase('name'); });
  }, [visible]);

  // 현재 피커 위치가 macOS 보호폴더(Documents/Desktop/Downloads 등)인지 — 접근 프롬프트 경고.
  const dirProtected = /^(desktop|documents|downloads|movies|music|pictures|library)(\/|$)/i.test(dir);

  // 피커 디렉토리 로드(하위 폴더만).
  const loadDir = useCallback((target: string) => {
    setDirLoading(true);
    daemonService.fsList(target)
      .then((res) => { setDir(res.root); setDirs(res.items.filter((it) => it.dir).map((it) => ({ name: it.name, path: it.path }))); })
      .catch(() => setDirs([]))
      .finally(() => setDirLoading(false));
  }, []);

  // 피커 진입 시 현재 목적지에서 시작.
  const openPicker = useCallback(() => { setPhase('pickDest'); loadDir(dest); }, [dest, loadDir]);

  const goUp = useCallback(() => {
    if (!dir) return;
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    loadDir(parent);
  }, [dir, loadDir]);

  // 현재 피커 위치를 목적지로 확정 → 이름 단계로.
  const chooseDest = useCallback(() => { setDest(dir); setPhase('name'); }, [dir]);

  const create = useCallback(async () => {
    const t = name.trim();
    if (!t) return;
    setPhase('busy');
    try {
      const w = await daemonService.wsCreate(t, dest);
      // 클라우드 메타(compute=local, localPath) 등록 → 워크스페이스 목록에 노출 + 재진입 가능.
      //  실제 파일은 PC 에 있고 이 레코드는 "포인터"(북마크). 메타 실패해도 IDE 진입은 진행.
      try { await workspaceService.createWorkspace({ name: w.name, kind: 'project', compute: 'local', localPath: w.path }); void reloadStore(true); }
      catch (_) { /* 메타 등록 실패 — 다음 새로고침 시 반영 */ }
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
  }, [name, dest, setActiveWorkspace, navigation, openIde, onClose, reloadProject, reloadStore, alert]);

  const destLabel = dest === '' ? '홈(~)' : `~/${dest}`;
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
        ) : phase === 'pickDest' ? (
          <>
            <Text style={{ fontSize: 12.5, color: C.textDim, marginBottom: 10 }}>이 워크스페이스를 만들 폴더로 이동한 뒤 '여기에 만들기'를 누르세요.</Text>
            {/* 추천 위치 원탭 — macOS 폴더 접근 프롬프트 없는 곳(~/CodingPT/workspaces) */}
            <Pressable
              onPress={() => { setDest(recommended); setPhase('name'); }}
              android_ripple={{ color: C.elevated2 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.accent, backgroundColor: C.elevated2, marginBottom: 12 }}
            >
              <Sparkle size={18} color={C.accent} weight="fill" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>추천 위치 사용</Text>
                <Text style={{ fontSize: 11, color: C.textDim, marginTop: 1, fontFamily: v2.font.mono }} numberOfLines={1}>~/{recommended} · 권한 요청 없이 바로</Text>
              </View>
              <CaretRight size={15} color={C.accent} />
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: R.md, backgroundColor: C.elevated2, marginBottom: 8 }}>
              <House size={15} color={C.text2} weight="fill" />
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }} numberOfLines={1}>{dirLabel}</Text>
              <Pressable onPress={goUp} disabled={!dir} hitSlop={6} style={{ opacity: dir ? 1 : 0.35, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <ArrowUp size={15} color={C.text2} /><Text style={{ fontSize: 12, color: C.text2 }}>상위로</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
              {dirLoading ? (
                <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
              ) : dirs.length === 0 ? (
                <Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 18, textAlign: 'center' }}>하위 폴더가 없어요 · 여기에 만들 수 있어요</Text>
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
            {dirProtected && !allowFullDisk && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, paddingHorizontal: 2 }}>
                <Warning size={14} color={C.warn} weight="fill" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11.5, color: C.warn }}>이 폴더는 macOS 보호폴더라 접근 시 PC에서 권한 허용을 물어볼 수 있어요. 원격 작업엔 홈 안쪽이 편해요.</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Btn variant="ghost" sm onPress={() => setPhase('name')}>취소</Btn>
              <Btn variant="primary" sm onPress={chooseDest}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><FolderOpen size={15} color="#fff" weight="fill" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>여기에 만들기</Text></View></Btn>
            </View>
          </>
        ) : (
          // name
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: C.textDim }}>생성 위치</Text>
              <Text style={{ flex: 1, fontFamily: v2.font.mono, fontSize: 12, color: C.text2 }} numberOfLines={1}>{destLabel}</Text>
              <Pressable onPress={openPicker} hitSlop={6}><Text style={{ fontSize: 12, color: C.accent, fontWeight: '700' }}>변경</Text></Pressable>
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
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>선택한 폴더 아래에 프로젝트 폴더가 만들어지고(git init 포함) 모바일 IDE로 바로 열려요. 터미널에서 자기 claude로 이어서 작업하세요.</Text>
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
