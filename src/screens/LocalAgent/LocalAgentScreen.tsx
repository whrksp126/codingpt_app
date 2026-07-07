import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CaretLeft, Desktop, ArrowsClockwise, CaretRight, FolderOpen, House, ClockCounterClockwise } from 'phosphor-react-native';

import { Btn, Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import daemonService, { DaemonStatus, DaemonFsEntry } from '../../services/daemonService';
import { daemonProjectId } from '../../services/ideSource';
import { useIdeProject } from '../../contexts/IdeProjectContext';

const C = v2.colors;
const R = v2.radius;

// ── "내 PC" 연결 + 폴더 선택 ─────────────────────────────────────────
// 사용자 PC(codingpt_daemon)에 연결하고, 작업할 폴더를 고르면 그 폴더를 소스로 모바일 IDE 를 연다.
// IDE 안에서 PC 파일 편집 · PC 터미널(자기 claude 직접 실행) · (예정)프리뷰를 그대로 사용한다.
// 상태별: 미페어링(코드 발급) → 오프라인(실행 안내) → 온라인(폴더 피커).

type Phase = 'loading' | 'unpaired' | 'offline' | 'online';

const RECENTS_KEY = 'daemon:recentFolders';
const baseName = (p: string) => (p ? (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p) : '홈');
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

const LocalAgentScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { openIde } = useIdeProject();

  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 폴더 피커
  const [cwd, setCwd] = useState('');                       // 데몬 홈-기준 상대경로('' = 홈)
  const [items, setItems] = useState<DaemonFsEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await daemonService.getStatus();
      setStatus(s);
      setError(null);
      if (s.online) setPhase('online');
      else if (s.devices.length > 0) setPhase('offline');
      else setPhase('unpaired');
      return s;
    } catch (e: any) {
      setError(e?.message || '상태 조회 실패');
      setPhase((p) => (p === 'loading' ? 'offline' : p));
      return null;
    }
  }, []);

  // 진입 시 + 온라인 전까지 5초 폴링(페어링/데몬 실행이 끝나면 자동으로 피커로 전환).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const s = await refreshStatus();
      if (cancelled) return;
      if (!s || !s.online) timer = setTimeout(tick, 5000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [refreshStatus]);

  // 최근 연 폴더 로드(1회)
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => { if (raw) setRecents(JSON.parse(raw)); })
      .catch(() => { /* noop */ });
  }, []);

  // 폴더 목록 로드(디렉토리만 탐색 대상 — 파일도 표시하되 비활성)
  const loadDir = useCallback(async (path: string) => {
    setListLoading(true);
    try {
      const r = await daemonService.fsList(path);
      setItems(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message || '폴더를 불러올 수 없어요.');
    } finally {
      setListLoading(false);
    }
  }, []);

  // 온라인 되면 현재 cwd 로드
  useEffect(() => {
    if (phase === 'online') loadDir(cwd);
  }, [phase, cwd, loadDir]);

  const issuePairCode = async () => {
    setPairBusy(true);
    try {
      const { code } = await daemonService.createPairCode();
      setPairCode(code);
    } catch (e: any) {
      setError(e?.message || '페어링 코드 발급 실패');
    } finally {
      setPairBusy(false);
    }
  };

  // 선택한 폴더를 소스로 모바일 IDE 열기(오버레이). 최근 목록에 기록.
  const openFolder = useCallback((root: string) => {
    const rec = [root, ...recents.filter((r) => r !== root)].slice(0, 8);
    setRecents(rec);
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(rec)).catch(() => { /* noop */ });
    openIde({ ide: { projectId: daemonProjectId(root), projectName: baseName(root) } });
  }, [recents, openIde]);

  const device = status?.current || status?.devices?.[0] || null;
  const dirs = items.filter((it) => it.dir);

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 탑바 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingTop: Math.max(insets.top, 10), paddingBottom: 10, paddingHorizontal: 10,
        borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.base,
      }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ padding: 6 }}>
          <CaretLeft size={20} color={C.text2} />
        </Pressable>
        <Desktop size={18} color={C.text2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }} numberOfLines={1}>
            내 PC{device ? ` · ${device.deviceName}` : ''}
          </Text>
          {device ? (
            <Text style={{ fontSize: 11, color: C.textDim, fontFamily: v2.font.mono }} numberOfLines={1}>
              {device.platform || ''}{device.daemonVersion ? ` · daemon v${device.daemonVersion}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: phase === 'online' ? C.accent : C.textDim }} />
          <Text style={{ fontSize: 12, color: phase === 'online' ? C.text2 : C.textDim }}>
            {phase === 'online' ? '온라인' : phase === 'loading' ? '확인 중' : '오프라인'}
          </Text>
        </View>
      </View>

      {phase === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : phase === 'online' ? (
        // ── 폴더 피커 ──
        <View style={{ flex: 1 }}>
          {/* 경로 바 + 폴더 열기 CTA */}
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Text style={{ fontSize: 12.5, color: C.textDim }}>작업할 폴더를 선택하세요</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => setCwd('')}
                hitSlop={6}
                style={{ padding: 6, borderRadius: 6, backgroundColor: C.elevated2 }}
              >
                <House size={16} color={C.text2} weight={cwd === '' ? 'fill' : 'regular'} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: 12.5, color: C.text2, fontFamily: v2.font.mono }} numberOfLines={1}>
                  ~/{cwd}
                </Text>
              </View>
            </View>
            <Btn
              variant="accent" sm full
              icon={<FolderOpen size={16} color={C.onAccent} weight="fill" />}
              onPress={() => openFolder(cwd)}
            >
              {`"${baseName(cwd)}" 폴더 IDE로 열기`}
            </Btn>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}>
            {/* 최근 폴더 */}
            {recents.length > 0 && cwd === '' ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ClockCounterClockwise size={13} color={C.textDim} />
                  <Text style={{ fontSize: 11.5, color: C.textDim, fontWeight: '700' }}>최근</Text>
                </View>
                {recents.map((r) => (
                  <Pressable
                    key={'rec:' + r}
                    onPress={() => openFolder(r)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 8 }}
                  >
                    <FolderOpen size={17} color={C.accent} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13.5, color: C.text }} numberOfLines={1}>{baseName(r)}</Text>
                      <Text style={{ fontSize: 11, color: C.textDim, fontFamily: v2.font.mono }} numberOfLines={1}>~/{r}</Text>
                    </View>
                  </Pressable>
                ))}
                <View style={{ height: 1, backgroundColor: C.border, marginTop: 8, marginBottom: 2 }} />
              </View>
            ) : null}

            {/* 상위로 */}
            {cwd !== '' ? (
              <Pressable
                onPress={() => setCwd(parentOf(cwd))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 20 }}
              >
                <Text style={{ fontSize: 15, color: C.textDim }}>..</Text>
                <Text style={{ fontSize: 13.5, color: C.textDim }}>상위 폴더</Text>
              </Pressable>
            ) : null}

            {listLoading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : dirs.length === 0 ? (
              <Text style={{ paddingHorizontal: 20, paddingVertical: 16, fontSize: 12.5, color: C.textDim }}>
                하위 폴더가 없어요. 위 버튼으로 이 폴더를 바로 열 수 있어요.
              </Text>
            ) : dirs.map((d) => (
              <Pressable
                key={d.path}
                onPress={() => setCwd(d.path)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 20 }}
              >
                <FolderOpen size={18} color={C.text2} />
                <Text style={{ flex: 1, fontSize: 13.5, color: C.text }} numberOfLines={1}>{d.name}</Text>
                <CaretRight size={15} color={C.textDim} />
              </Pressable>
            ))}
            {error ? <Text style={{ paddingHorizontal: 20, paddingTop: 10, fontSize: 12, color: C.warn }}>{error}</Text> : null}
          </ScrollView>
        </View>
      ) : (
        // ── 미페어링 / 오프라인 ──
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {phase === 'unpaired' ? (
            <>
              <Label>PC 연결하기</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                내 컴퓨터를 CodingPT에 연결하면 폰에서 PC 폴더를 IDE로 열어 파일을 편집하고,
                PC 터미널에서 claude 같은 CLI 에이전트를 어디서든 이어서 조작할 수 있어요.
              </Text>
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginTop: 16 }}>
                <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 20 }}>
                  1. PC 터미널에서 데몬 폴더로 이동{'\n'}
                  <Text style={{ fontFamily: v2.font.mono, color: C.text2 }}>   cd codingpt_service/codingpt_daemon</Text>{'\n'}
                  2. 페어링 실행{'\n'}
                  <Text style={{ fontFamily: v2.font.mono, color: C.text2 }}>   node index.js pair --server {'<서버주소>'}</Text>{'\n'}
                  3. 아래에서 발급한 코드를 입력
                </Text>
                {pairCode ? (
                  <View style={{ marginTop: 14, alignItems: 'center', paddingVertical: 14, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: 3, color: C.accent, fontFamily: v2.font.mono }}>{pairCode}</Text>
                  </View>
                ) : null}
                <View style={{ marginTop: 14 }}>
                  <Btn variant="outline" sm full onPress={issuePairCode} disabled={pairBusy}>
                    {pairBusy ? '발급 중…' : pairCode ? '코드 재발급' : '페어링 코드 발급'}
                  </Btn>
                </View>
                {pairCode ? (
                  <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, textAlign: 'center' }}>
                    코드는 10분간 유효해요. 페어링이 끝나면 자동으로 연결됩니다.
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Label>PC 오프라인</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                {device ? `${device.deviceName} 이(가) 아직 연결되지 않았어요.` : 'PC가 아직 연결되지 않았어요.'}{'\n'}
                PC에서 데몬이 실행 중인지 확인해 주세요.
              </Text>
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginTop: 16 }}>
                <Text style={{ fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }}>
                  cd codingpt_service/codingpt_daemon{'\n'}npm start
                </Text>
              </View>
              <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Btn variant="outline" sm full onPress={() => refreshStatus()}>
                    다시 확인
                  </Btn>
                </View>
              </View>
              <Pressable onPress={issuePairCode} style={{ marginTop: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowsClockwise size={13} color={C.textDim} />
                <Text style={{ fontSize: 12.5, color: C.textDim }}>다른 PC 연결(새 페어링 코드)</Text>
              </Pressable>
              {pairCode ? (
                <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 20, fontWeight: '700', letterSpacing: 3, color: C.accent, fontFamily: v2.font.mono }}>{pairCode}</Text>
              ) : null}
            </>
          )}
          {error ? (
            <Text style={{ fontSize: 12, color: C.warn, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

export default LocalAgentScreen;
