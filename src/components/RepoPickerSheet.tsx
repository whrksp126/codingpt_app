import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { GithubLogo, MagnifyingGlass, Lock, GitBranch } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import githubService, { GithubRepo } from '../services/githubService';
import daemonService from '../services/daemonService';
import workspaceService from '../services/workspaceService';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useAppAlert } from '../hooks/useAppAlert';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const C = v2.colors;
const R = v2.radius;

// 시스템 인증세션 복귀용 딥링크(GithubConnectModal 과 동일 — 백엔드 콜백이 이 scheme 으로 302).
const REDIRECT_URL = 'codingpt://github-auth';

// "GitHub에서 열기" — 내 레포 목록에서 선택 → 데몬이 ~/CodingPT/workspaces 로 git clone
//  → compute:'local' 워크스페이스 등록 → onOpen(localPath, name) 으로 진입(허브가 세션 시작).
//  미연동이면 먼저 GitHub 연결을 유도한다. 클라우드 러너가 없으므로 로컬(내 PC) 진입만 지원.
type Phase = 'loading' | 'notConnected' | 'list' | 'cloning';

export default function RepoPickerSheet({
  visible,
  onClose,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (localPath: string, name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const navigation = useNavigation<any>();
  const { alert, confirm } = useAppAlert();
  const { reload: reloadStore } = useWorkspaceStore();
  const { localOnline } = useDaemonStatus();

  const [phase, setPhase] = useState<Phase>('loading');
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [q, setQ] = useState('');
  const [working, setWorking] = useState(false); // 연결 진행 중
  const [cloningName, setCloningName] = useState('');

  // 상태 조회 → 연동돼 있으면 레포 목록, 아니면 연결 유도.
  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const list = await githubService.listRepos();
      if (list === null) { setPhase('notConnected'); return; }
      setRepos(list);
      setPhase('list');
    } catch (_) {
      setPhase('notConnected');
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    load();
  }, [visible, load]);

  // GitHub 연결(GithubConnectModal 과 동일한 시스템 인증세션 플로우).
  const connect = useCallback(async () => {
    setWorking(true);
    try {
      const url = await githubService.getAuthorizeUrl();
      if (!url) { alert({ title: '오류', message: 'GitHub 연결을 시작할 수 없습니다.' }); return; }
      const available = await InAppBrowser.isAvailable();
      if (available) {
        const result = await InAppBrowser.openAuth(url, REDIRECT_URL, {
          ephemeralWebSession: false, showTitle: false, enableUrlBarHiding: true, enableDefaultShare: false,
        });
        if (result.type === 'success' && result.url) {
          if (result.url.includes('status=error')) {
            const msg = decodeURIComponent((result.url.split('message=')[1] || '').split('&')[0] || '연결 실패');
            alert({ title: 'GitHub 연결 실패', message: msg });
          } else {
            await load();
          }
        }
      } else {
        await Linking.openURL(url);
        await alert({ title: 'GitHub 연결', message: '브라우저에서 인증을 마친 뒤 앱으로 돌아와 주세요.' });
        await load();
      }
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || 'GitHub 연결 중 문제가 발생했습니다.' });
    } finally {
      setWorking(false);
    }
  }, [alert, load]);

  // 레포 선택 → (데몬 온라인 가드) → clone → 워크스페이스 등록 → 진입.
  const pickRepo = useCallback(async (repo: GithubRepo) => {
    if (phase === 'cloning') return;
    if (!localOnline) {
      const ok = await confirm({ title: '내 PC 연결 필요', message: 'GitHub 레포는 내 PC로 가져와요. PC 데몬을 지금 연결할까요?', confirmText: '연결하기' });
      if (ok) { onClose(); navigation.navigate('LocalAgent'); }
      return;
    }
    setCloningName(repo.name);
    setPhase('cloning');
    try {
      const cloned = await daemonService.wsClone(repo.cloneUrl, repo.name);
      // compute:'local' 메타 등록(북마크). 실패해도 진입은 진행.
      try { await workspaceService.createWorkspace({ name: cloned.name, kind: 'project', compute: 'local', localPath: cloned.path }); void reloadStore(true); }
      catch (_) { /* 메타 등록 실패 — 다음 새로고침 시 반영 */ }
      onClose();
      onOpen(cloned.path, cloned.name);
    } catch (e: any) {
      alert({ title: '가져오기 실패', message: e?.message || '레포를 가져오지 못했어요.' });
      setPhase('list');
    }
  }, [phase, localOnline, confirm, onClose, navigation, reloadStore, onOpen, alert]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return repos;
    return repos.filter((r) => r.name.toLowerCase().includes(s) || r.fullName.toLowerCase().includes(s));
  }, [repos, q]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '82%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <GithubLogo size={20} color={C.text} weight="fill" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>GitHub에서 열기</Text>
        </View>

        {phase === 'loading' ? (
          <View style={{ paddingVertical: 44, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : phase === 'cloning' ? (
          <View style={{ paddingVertical: 44, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
            <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 12 }} numberOfLines={1}>{cloningName} 가져오는 중…</Text>
            <Text style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>PC에 clone 중이라 잠시 걸릴 수 있어요</Text>
          </View>
        ) : phase === 'notConnected' ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <GithubLogo size={30} color={C.text2} />
            </View>
            <Text style={{ fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
              GitHub 계정을 연결하면{'\n'}내 레포를 바로 가져올 수 있어요.
            </Text>
            <Btn onPress={connect} disabled={working} icon={<GithubLogo size={16} color="#0B0E14" weight="fill" />}>{working ? '연결 중…' : 'GitHub 연결'}</Btn>
          </View>
        ) : (
          <>
            {/* 검색 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl, borderRadius: R.md, paddingHorizontal: 10, height: 40, marginBottom: 10 }}>
              <MagnifyingGlass size={16} color={C.textDim} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="레포 검색"
                placeholderTextColor={C.textDim}
                style={{ flex: 1, color: C.text, fontSize: 14, padding: 0 }}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            {!localOnline && (
              <Text style={{ color: C.warn, fontSize: 11.5, marginBottom: 8, paddingHorizontal: 2 }}>
                내 PC가 연결돼 있지 않아요. 레포를 고르면 연결을 안내할게요.
              </Text>
            )}
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                <Text style={{ color: C.textDim, fontSize: 13 }}>{repos.length === 0 ? '레포가 없어요' : '검색 결과가 없어요'}</Text>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                {filtered.map((r) => (
                  <Pressable key={r.id} onPress={() => pickRepo(r)} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderRadius: R.md }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{r.name}</Text>
                        {r.private && <Lock size={12} color={C.textDim} weight="fill" />}
                      </View>
                      <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                        {[r.language, r.updatedAt ? relShort(r.updatedAt) : null].filter(Boolean).join(' · ') || r.fullName}
                      </Text>
                    </View>
                    <GitBranch size={16} color={C.textDim} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// 짧은 상대시간
function relShort(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const min = Math.floor((Date.now() - d) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${Math.floor(day / 30)}개월 전`;
}
