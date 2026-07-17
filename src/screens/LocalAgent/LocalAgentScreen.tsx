import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Clipboard } from 'react-native';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CaretLeft, Desktop, ArrowsClockwise, CaretRight, FolderOpen, House, ClockCounterClockwise, CheckCircle, XCircle, Info, CircleNotch, Copy, Check, Globe, DownloadSimple, QrCode } from 'phosphor-react-native';

import { Btn, Label } from '../../components/v2/primitives';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';
import ClaudeLoginSheet from '../../components/ClaudeLoginSheet';
import { v2 } from '../../theme/v2Tokens';
import daemonService, { DaemonStatus, DaemonFsEntry, DaemonDoctor } from '../../services/daemonService';
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
// PC용 CodingPT(트레이 앱) 다운로드 페이지 — PC 웹브라우저로 접속하는 곳(폰에선 설치 불가).
//  다운로드는 환경 무관 공개 도메인 고정. 폰에선 이 주소를 복사해 PC에서 열도록 안내.
const DOWNLOAD_URL = 'https://codingpt.ghmate.com/download';
const DOWNLOAD_DISPLAY = 'codingpt.ghmate.com/download';
const baseName = (p: string) => (p ? (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p) : '홈');
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

// 온보딩 체크리스트 한 줄. state: ok(초록 체크) / fail(빨강 X) / info(중립 안내) / pending(스피너)
type CheckState = 'ok' | 'fail' | 'info' | 'pending';
function CheckRow({ state, label, hint, actionLabel, onAction }: { state: CheckState; label: string; hint?: string; actionLabel?: string; onAction?: () => void }) {
  const icon = state === 'ok' ? <CheckCircle size={18} color={C.accent} weight="fill" />
    : state === 'fail' ? <XCircle size={18} color={C.warn} weight="fill" />
    : state === 'pending' ? <CircleNotch size={18} color={C.textDim} />
    : <Info size={18} color={C.textDim} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 }}>
      <View style={{ marginTop: 1 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, color: state === 'fail' ? C.text : C.text2, fontWeight: state === 'fail' ? '700' : '500' }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 2, lineHeight: 17, fontFamily: /brew|claude|node/.test(hint) ? v2.font.mono : v2.font.sans }}>{hint}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={6} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.md, backgroundColor: C.accent }}>
          <Text style={{ fontSize: 12.5, color: '#052e16', fontWeight: '800' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const LocalAgentScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { openIde, setActiveWorkspace } = useIdeProject();

  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);   // 다운로드 주소 복사 피드백
  const [approveInput, setApproveInput] = useState('');   // PC 화면의 연결 코드
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveDone, setApproveDone] = useState(false);  // 승인 완료(PC 연결 마무리 대기)

  // 폴더 피커
  const [cwd, setCwd] = useState('');                       // 데몬 홈-기준 상대경로('' = 홈)
  const [items, setItems] = useState<DaemonFsEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);

  // 온보딩 점검(claude/tmux 설치·로그인). 온라인 되면 1회 조회.
  const [doctor, setDoctor] = useState<DaemonDoctor | null>(null);
  const [doctoring, setDoctoring] = useState(false);
  const [loginSheet, setLoginSheet] = useState(false); // BYO 로그인 시트
  const runDoctor = useCallback(async () => {
    setDoctoring(true);
    try { setDoctor(await daemonService.agentDoctor()); }
    catch { setDoctor(null); }
    finally { setDoctoring(false); }
  }, []);

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

  // 온라인 전환 시 온보딩 점검 1회
  useEffect(() => {
    if (phase === 'online') runDoctor();
  }, [phase, runDoctor]);

  // QR 승인(넷플릭스 방식) — PC 화면의 연결 코드를 이 계정으로 승인. 이후 폴링이 온라인 전환을 감지.
  const doApprove = async (raw?: string) => {
    const code = (raw ?? approveInput).trim().toUpperCase();
    if (!code) { setError('PC 화면의 연결 코드를 입력하세요.'); return; }
    setApproveBusy(true);
    setError(null);
    try {
      await daemonService.approvePairSession(code);
      setApproveDone(true);
      setApproveInput('');
      refreshStatus(); // 기기 등록됨 → offline(연결 마무리 대기) 로 전환, 폴링이 online 을 잡음
    } catch (e: any) {
      setError(e?.message || '승인에 실패했어요. 코드를 확인해 주세요.');
    } finally {
      setApproveBusy(false);
    }
  };

  // PC에서 열 다운로드 주소를 클립보드에 복사(폰에선 설치 불가라 열지 않고 복사만).
  const copyDownloadUrl = useCallback(() => {
    Clipboard.setString(DOWNLOAD_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  // 선택한 폴더를 소스로 모바일 IDE 열기. 최근 목록에 기록.
  const openFolder = useCallback((root: string) => {
    const rec = [root, ...recents.filter((r) => r !== root)].slice(0, 8);
    setRecents(rec);
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(rec)).catch(() => { /* noop */ });
    const pid = daemonProjectId(root);
    // 워크스페이스 IDE와 완전히 "동일 환경"으로 연다:
    //  1) 데몬 폴더를 활성 워크스페이스로 전환 → IdeProjectContext 가 이전 워크스페이스를 떠나고 이 프로젝트를 로드(전환·트리 로드).
    //  2) 홈 탭으로 이동 → LocalAgent(연결, root-stack 푸시 화면) dismiss. IDE 오버레이가 탭 위에 떠야 툴바/패널 터치가 정상(푸시 화면 위면 WebView 가 상단 터치를 가로챔).
    //  3) IDE 오버레이 오픈. (leave-effect 가 방금 여는 IDE 는 내리지 않도록 IdeProjectContext 에서 가드)
    setActiveWorkspace({ id: pid, name: baseName(root), kind: 'project' });
    navigation.navigate('Tabs', { screen: 'home' });
    openIde({ ide: { projectId: pid, projectName: baseName(root) } });
  }, [recents, openIde, navigation, setActiveWorkspace]);

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
        <ResponsiveContainer fill>
        <View style={{ flex: 1 }}>
          {/* 온보딩 체크리스트 — claude/tmux 설치·로그인 점검(계약 §7 AGENT_NOT_READY 예방) */}
          {(() => {
            const claudeOk = !!doctor?.claude?.installed;
            const tmuxOk = !!doctor?.tmux?.installed;
            const loginProbed = !!doctor?.login?.probed;
            const loginOk = !!doctor?.login?.loggedIn;
            const needsFix = doctor && (!claudeOk || !tmuxOk || (loginProbed && !loginOk));
            // 점검 통과(claude 설치)면 접어두고, 문제 있으면 펼쳐 안내.
            if (doctoring && !doctor) {
              return (
                <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CircleNotch size={15} color={C.textDim} />
                  <Text style={{ fontSize: 12.5, color: C.textDim }}>PC 환경 점검 중…</Text>
                </View>
              );
            }
            if (!needsFix) return null; // 전부 정상이면 체크리스트 숨김(바로 폴더 피커)
            return (
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 12.5, color: C.text2, fontWeight: '700' }}>PC 환경 점검</Text>
                  <Pressable onPress={runDoctor} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}>
                    <ArrowsClockwise size={13} color={C.textDim} />
                    <Text style={{ fontSize: 12, color: C.textDim }}>다시 점검</Text>
                  </Pressable>
                </View>
                <CheckRow state="ok" label="데몬 실행 중" />
                <CheckRow
                  state={claudeOk ? 'ok' : 'fail'}
                  label={claudeOk ? `claude 설치됨${doctor?.claude?.version ? ` · ${doctor.claude.version}` : ''}` : 'claude CLI 미설치'}
                  hint={claudeOk ? undefined : 'PC에 Claude Code CLI 를 설치하세요. 설치 후 [다시 점검].'}
                />
                <CheckRow
                  state={loginProbed ? (loginOk ? 'ok' : 'fail') : 'info'}
                  label={loginOk
                    ? `claude 로그인됨${doctor?.login?.email ? ` · ${doctor.login.email}` : ''}`
                    : 'claude 미로그인'}
                  hint={loginOk ? undefined : 'BYO — 본인 Claude 계정으로 로그인해야 채팅할 수 있어요. 자격증명은 이 PC에만 저장돼요.'}
                  actionLabel={loginProbed && !loginOk ? '로그인' : undefined}
                  onAction={loginProbed && !loginOk ? () => setLoginSheet(true) : undefined}
                />
                <CheckRow
                  state={tmuxOk ? 'ok' : 'fail'}
                  label={tmuxOk ? 'tmux 설치됨' : 'tmux 미설치 (PC 터미널 미러용)'}
                  hint={tmuxOk ? undefined : 'brew install tmux  — 채팅은 되지만 PC 터미널 화면 공유엔 필요해요.'}
                />
              </View>
            );
          })()}

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
        </ResponsiveContainer>
      ) : (
        // ── 미페어링 / 오프라인 ──
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <ResponsiveContainer>
          {phase === 'unpaired' ? (
            <>
              <Label>PC 연결하기</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                내 컴퓨터를 연결하면 폰에서 PC 폴더를 열어 편집하고, PC 터미널을 이어서 조작할 수 있어요.
                연결은 PC에서 한 번만 설치하면 됩니다.
              </Text>

              {/* 단계 카드 — PC에서 진행. 폰에선 주소 복사만 */}
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, marginTop: 16, overflow: 'hidden' }}>
                {/* 1) PC 브라우저에서 열기 */}
                <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.accent }}>1</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Globe size={16} color={C.text2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>PC 브라우저에서 이 주소 열기</Text>
                    </View>
                    <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 19, marginTop: 5 }}>
                      Mac이나 Windows 컴퓨터의 웹브라우저 주소창에 아래 주소를 입력하세요. 폰에서는 설치할 수 없어요.
                    </Text>
                    <Pressable
                      onPress={copyDownloadUrl}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: copied ? C.accent : C.border }}
                    >
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text, fontFamily: v2.font.mono }} numberOfLines={1}>{DOWNLOAD_DISPLAY}</Text>
                      {copied ? <Check size={16} color={C.accent} weight="bold" /> : <Copy size={16} color={C.text2} />}
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: copied ? C.accent : C.text2 }}>{copied ? '복사됨' : '복사'}</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />

                {/* 2) 다운로드 후 설치 */}
                <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.accent }}>2</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <DownloadSimple size={16} color={C.text2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>다운로드해서 설치</Text>
                    </View>
                    <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 19, marginTop: 5 }}>
                      열린 페이지에서 내 컴퓨터에 맞는 파일을 받아 실행하면 PC 메뉴바(트레이)에 CodingPT가 상주합니다. Node·터미널 같은 별도 프로그램은 필요 없어요.
                    </Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />

                {/* 3) 페어링 코드 입력 */}
                <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.accent }}>3</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <QrCode size={16} color={C.text2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>QR 스캔 또는 코드 입력</Text>
                    </View>
                    <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 19, marginTop: 5 }}>
                      설치한 CodingPT 화면에 뜬 QR을 폰 카메라로 스캔하면 자동 연결됩니다. 또는 그 아래 표시된 연결 코드를 입력하세요.
                    </Text>
                    {approveDone ? (
                      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.accent }}>
                        <CheckCircle size={18} color={C.accent} weight="fill" />
                        <Text style={{ flex: 1, fontSize: 13, color: C.text }}>승인됨! PC에서 연결을 마무리하는 중…</Text>
                      </View>
                    ) : (
                      <>
                        <KeyTextInput
                          value={approveInput}
                          onChangeText={(t) => setApproveInput(t.toUpperCase())}
                          placeholder="예: ABCD-2345"
                          placeholderTextColor={C.textDim}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={12}
                          onSubmitEditing={() => doApprove()}
                          style={{ marginTop: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, color: C.accent, fontSize: 18, fontWeight: '700', letterSpacing: 3, textAlign: 'center', fontFamily: v2.font.mono }}
                        />
                        <View style={{ marginTop: 10 }}>
                          <Btn sm full onPress={() => doApprove()} disabled={approveBusy || !approveInput.trim()}>
                            {approveBusy ? '연결 중…' : '연결'}
                          </Btn>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <Label>PC 오프라인</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                {device ? `${device.deviceName} 이(가) 아직 연결되지 않았어요.` : 'PC가 아직 연결되지 않았어요.'}{'\n'}
                PC 메뉴바(트레이)의 CodingPT 아이콘이 <Text style={{ color: C.text }}>연결됨 · 실행 중</Text> 인지 확인하세요.
              </Text>
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginTop: 16 }}>
                <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 19 }}>
                  설치돼 있다면 PC 메뉴바 아이콘을 열어 실행 상태를 확인하세요. 아직 설치 전이라면 PC 브라우저에서 아래 주소로 접속해 설치하세요.
                </Text>
                <Pressable
                  onPress={copyDownloadUrl}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: copied ? C.accent : C.border }}
                >
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text, fontFamily: v2.font.mono }} numberOfLines={1}>{DOWNLOAD_DISPLAY}</Text>
                  {copied ? <Check size={16} color={C.accent} weight="bold" /> : <Copy size={16} color={C.text2} />}
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: copied ? C.accent : C.text2 }}>{copied ? '복사됨' : '복사'}</Text>
                </Pressable>
              </View>
              <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Btn variant="outline" sm full onPress={() => refreshStatus()}>
                    다시 확인
                  </Btn>
                </View>
              </View>
              {approveDone ? (
                <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
                  <CheckCircle size={16} color={C.accent} weight="fill" />
                  <Text style={{ fontSize: 12.5, color: C.text }}>승인됨! PC에서 연결을 마무리하는 중…</Text>
                </View>
              ) : (
                <View style={{ marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <KeyTextInput
                    value={approveInput}
                    onChangeText={(t) => setApproveInput(t.toUpperCase())}
                    placeholder="다른 PC 연결 코드"
                    placeholderTextColor={C.textDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                    onSubmitEditing={() => doApprove()}
                    style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, color: C.accent, fontSize: 15, fontWeight: '700', letterSpacing: 2, textAlign: 'center', fontFamily: v2.font.mono }}
                  />
                  <Btn sm onPress={() => doApprove()} disabled={approveBusy || !approveInput.trim()}>
                    {approveBusy ? '…' : '연결'}
                  </Btn>
                </View>
              )}
            </>
          )}
          {error ? (
            <Text style={{ fontSize: 12, color: C.warn, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          ) : null}
          </ResponsiveContainer>
        </ScrollView>
      )}

      {/* BYO 로그인 시트 — 활성 러너(여기선 이 PC 데몬)에서 사용자 claude 계정 로그인 */}
      <ClaudeLoginSheet
        visible={loginSheet}
        onClose={() => setLoginSheet(false)}
        onLoggedIn={() => { runDoctor(); }}
        targetLabel="내 PC"
        targetKind="local"
      />
    </View>
  );
};

export default LocalAgentScreen;
