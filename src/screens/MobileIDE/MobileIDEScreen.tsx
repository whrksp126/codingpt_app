import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Keyboard, Image, Switch,
  PanResponder, useWindowDimensions, Modal, Animated, BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X } from '../../assets/SvgIcon';
import {
  SidebarIcon, TerminalIcon, BrowserIcon, ListIcon, FullscreenIcon,
  PlayIcon, PauseIcon, StepIcon, StopIcon, BugIcon, SaveIcon,
} from '../../components/module/ide/ideIcons';

// 디버그 재생 배속 (촘촘: 매우 느림 ~ 매우 빠름)
const DEBUG_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
import { FileTypeIcon } from '../../components/module/ide/fileTypeIcons';
import CodeEditorWebView, { CodeEditorHandle } from '../../components/module/ide/CodeEditorWebView';
import { keysFor, ctxKeyOf, DEFAULT_CTX, type EditorContext } from '../../components/module/ide/keyContexts';
import { loadFreq, bump as bumpKeyFreq, boostOrder } from '../../components/module/ide/keyFrequency';
import KeyButton, { POPUP_CELL, type PopupInfo } from '../../components/module/ide/KeyButton';
import SpecialKeyPanel, { type SpecialKeyName } from '../../components/keyboard/SpecialKeyPanel';
import { useModifierKeys, type ModId } from '../../components/keyboard/modifierKeys';
import { useKeyboardOS } from '../../utils/keyboardOSSetting';
import { Keyboard as KeyboardIcon } from 'phosphor-react-native';
import { haptic } from '../../animations/haptics';
import {
  createInlinePreview, buildPreviewUrl, runCode,
  debuggableLanguage, runCommandText, getIdeAsset, saveIdeProject,
  startDevPreview, buildDevPreviewUrl, stopDevPreview,
  listTerminals, newTerminal, selectTerminal, closeTerminal, clearTerminalScreen,
  listSandboxPorts, openSandboxPort, type SandboxWindow,
} from '../../services/ideService';
import TerminalWebView, { TerminalHandle } from '../../components/module/ide/TerminalWebView';
import { startTerminal, buildTerminalWsUrl } from '../../services/terminalService';
import { AgentDiff, writeAgentFile } from '../../services/agentService';
import { useAgentSession } from '../../contexts/AgentSessionContext';
import { useIdeProject } from '../../contexts/IdeProjectContext';
import sessionService from '../../services/sessionService';
import { pickAnyFiles } from '../../services/attachmentPicker';
import { FilePlus, FolderPlus, DownloadSimple, Plus, Play, Globe, ClockCounterClockwise, CaretRight } from 'phosphor-react-native';
import PressableScale from '../../components/ui/PressableScale';
import { v2Colors, v2Font, v2Radius } from '../../theme/v2Tokens';

// Agent 채팅 메시지 아이템
type AgentMsg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'thinking'; text: string }
  | { id: string; role: 'tool'; tool: string; relPath?: string; command?: string; ok?: boolean; output?: string };

// 코딩에 자주 쓰는 특수문자 — 키보드 위에 가로 스크롤로 노출
const SPECIAL_CHARS = [
  '<', '>', '/', '"', "'", '`', '-', '_', '=', '+', '.', ',', ':', ';',
  '(', ')', '{', '}', '[', ']', '|', '&', '!', '?', '#', '@', '$', '*', '\\', '~',
];
// 터미널 Ctrl 모디파이어 활성 시 노출되는 흔한 컨트롤 조합(^C 인터럽트, ^D EOF, ^Z 정지, ^L clear …).
const CTRL_LETTERS = ['c', 'd', 'z', 'l', 'a', 'e', 'r', 'w', 'u', 'k'];
// 실물키보드 특수키 패널의 원샷 키 → 터미널 PTY 로 보낼 ANSI/제어 시퀀스.
const TERM_SEQ: Record<SpecialKeyName, string> = {
  Escape: '\x1b', Tab: '\t', Enter: '\r', Backspace: '\x7f',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F',
  PageUp: '\x1b[5~', PageDown: '\x1b[6~', Delete: '\x1b[3~',
};

// 터미널 스티키 모디파이어: 글자/기호 → 컨트롤 바이트(Ctrl+C=\x03 등). @A-Z[\]^_ 및 a-z 처리.
const ctrlByte = (ch: string): string => {
  const up = (ch || '').toUpperCase().charCodeAt(0);
  if (up >= 64 && up <= 95) return String.fromCharCode(up & 0x1f);
  return ch;
};

// 에디터 설정(줄바꿈/줄번호/글자크기)을 앱 재시작 후에도 유지하기 위한 AsyncStorage 키.
const IDE_SETTINGS_KEY = 'ide:editorSettings';
// 워크스페이스별 직전 작업 상태(열린 탭/활성 파일/터미널 열림)를 복원하기 위한 키.
const ideStateKey = (id: string) => `ide:state:${id}`;

// 브라우저는 코드 에디터(파일 탭)와 완전히 별개인 패널 — 우측에서 등장해 하단 영역을 꽉 채운다.
// 각 브라우저 탭은 자체 주소/화면을 가진다(여러 탭 가능). isPreview=프로젝트 인라인 미리보기 탭.
type BrowserTab = {
  id: string;
  title: string;
  url: string | null;
  address: string;
  loading: boolean;
  error: string | null;
  isPreview?: boolean;
  isPort?: boolean;     // 감지된 실행 포트 미리보기 탭(부팅 레이스 → onError 자동 재시도)
  port?: number;
};

const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();
const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);
// 미리보기 대상 이미지(편집 불가). svg 는 텍스트로 편집하므로 제외.
const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p);

// 새 파일 확장자 → 에디터 언어(하이라이팅). 미지정은 plaintext.
const LANG_BY_EXT: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx', json: 'json', py: 'python', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', md: 'markdown', xml: 'xml', svg: 'xml', sql: 'sql',
  yml: 'yaml', yaml: 'yaml', sh: 'shell',
};
const langOf = (p: string) => LANG_BY_EXT[(p.split('.').pop() || '').toLowerCase()] || 'plaintext';

// ── 파일 경로 배열 → 중첩 트리 ──
type TreeNode = { name: string; path: string; dir: boolean; isAsset?: boolean; children?: TreeNode[] };
const buildTree = (files: { path: string }[], assets: { path: string }[]): TreeNode => {
  const root: TreeNode = { name: '', path: '', dir: true, children: [] };
  const ensure = (parts: string[]): TreeNode => {
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const cp = parts.slice(0, i + 1).join('/');
      let child = node.children!.find((c) => c.dir && c.path === cp);
      if (!child) { child = { name: parts[i], path: cp, dir: true, children: [] }; node.children!.push(child); }
      node = child;
    }
    return node;
  };
  const add = (path: string, isAsset: boolean) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return;
    const parent = ensure(parts.slice(0, -1));
    const name = parts[parts.length - 1];
    if (name === '.gitkeep') return;
    parent.children!.push({ name, path, dir: false, isAsset });
  };
  files.forEach((f) => add(f.path, false));
  assets.forEach((a) => add(a.path, true));
  const sort = (n: TreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
};

const TopBarButton = ({ active, onPress, children }: any) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    style={{ padding: 6, borderRadius: 6, backgroundColor: active ? '#2A2F3A' : 'transparent' }}
  >
    {children}
  </Pressable>
);

// 특수문자 보조 키 — 누르는 동안 색이 바뀌고(실제 키보드처럼) 키보드와 동일한 햅틱.
// 함수형 style(({pressed})=>...)이 일부 기기에서 적용 안 되므로 useState + 객체 style 로 누름 상태를 처리.
// 터미널 키보드 액세서리의 컨트롤 키(Ctrl+C·↑·↓). 특수문자 키(SpecialKey)와 동일 스타일(흰 키), active=실행 중 빨강 강조.
// 마운트 시 페이드(+선택적 위로 슬라이드) — moti 대신 RN Animated(훅 충돌 없음).
const FadeView = ({ children, style, dy = 0 }: { children: React.ReactNode; style?: any; dy?: number }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 120, useNativeDriver: true }).start(); }, [a]);
  const transform = dy ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }] : [];
  return <Animated.View style={[style, { opacity: a, transform }]}>{children}</Animated.View>;
};

const AccessoryKey = ({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) => {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); haptic.keyPress(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      hitSlop={3}
      style={{
        minWidth: 33, height: 37, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 10, borderRadius: 6,
        backgroundColor: active ? '#F0B4B1' : (down ? '#AAB2C2' : '#FFFFFF'),
        elevation: 1,
      }}
    >
      <Text style={{ color: active ? '#7F1D1D' : '#2B2D31', fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
};

// 보조바 ⌨︎ 토글 — 누르면 OS 키보드 ↔ 실물키보드 특수키 패널 전환. active=패널 열림(강조).
const KbToggleKey = ({ active, onPress }: { active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    hitSlop={3}
    style={{ minWidth: 40, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: active ? '#2A2F3A' : '#FFFFFF', elevation: 1 }}
  >
    <KeyboardIcon size={20} color={active ? '#E2E8F0' : '#2B2D31'} weight={active ? 'fill' : 'regular'} />
  </Pressable>
);


// 탭 닫기 버튼 — 미저장(dirty)이면 흰 동그라미(●), 누르면(또는 clean) X (VS Code 호버 동작의 모바일 대응)
const TabClose = ({ dirty, active, onPress }: { dirty: boolean; active: boolean; onPress: () => void }) => {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} hitSlop={8}>
      {dirty && !down
        ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: active ? '#fff' : '#CBD5E1' }} />
        : <X width={12} height={12} fill={active ? '#fff' : '#64748B'} />}
    </Pressable>
  );
};

type MobileIDEProps = {
  ide: {
    projectId: string;
    projectName?: string;
    entryFile?: string;
    initialTabs?: string[];
    activeTab?: string;
    highlights?: Record<string, Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>>;
  };
  lessonId?: number;
  visible?: boolean;     // 오버레이 가시성(숨김=언마운트 아님, 상태 보존)
  onClose?: () => void;  // 헤더 닫기(X)
};

export default function MobileIDEScreen({ ide, lessonId, visible = true, onClose }: MobileIDEProps) {
  const projectId: string = ide?.projectId;
  const projectName: string = ide?.projectName || '작업영역';
  const entryFile: string | undefined = ide?.entryFile;
  // 관리자가 소스 모달에서 저장한 "보기 상태" — 열어둘 탭(순서)/활성 탭/파일별 하이라이트 구간.
  const initialTabs: string[] | undefined = ide?.initialTabs;
  const savedActiveTab: string | undefined = ide?.activeTab;
  const savedHighlights: Record<string, Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>> = ide?.highlights || {};

  // 프로젝트 소스(파일·내용)는 IdeProjectContext 가 워크스페이스 단위로 미리 로드/캐시/동기화한다.
  // IDE 는 그 상태를 그대로 소비(즉시 진입·재로드 스피너 없음)하고 편집 UI 만 얹는다.
  const {
    project, contents, setProject, setContents,
    loading, error, ready: projectReady,
    ensureProject, reload: reloadProject, subscribeFileChange, setEditorActive,
  } = useIdeProject();
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  const [showExplorer, setShowExplorer] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(false); // 터미널 넓게 보기(에디터 덮기) 토글
  // 탐색기 파일 생성/가져오기 — 새 파일/새 폴더 이름 입력 모달 + 가져오기 진행상태
  const [newEntry, setNewEntry] = useState<null | 'file' | 'folder'>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const [importing, setImporting] = useState(false);

  // ── 바이브코딩 에이전트 (공유 세션 컨텍스트) ──
  // 채팅(에이전트)은 메인 채팅 화면에 있다. IDE 는 같은 세션의 파일 변경을 따라가고(에디터/터미널)
  // 메인 채팅이 비포커스인 동안 떠야 하는 승인 모달만 처리한다. (IDE 안에 에이전트 패널은 없음)
  const {
    pendingPermission,
    resolvePermission,
    registerEventListener,
    registerLeaveGuard,
    openSession,
    newSession,
    activeWorkspace,
    activeSessionId,
  } = useAgentSession();
  // 실행 중 여부 — 워크스페이스 이탈 가드(확인 다이얼로그)에서 참조.
  //  관리형 dev(devRunningRef) 뿐 아니라 사용자가 직접 띄운 서버(감지 포트)도 있으면 경고한다(나가면 종료됨).
  const devRunningRef = useRef(false);
  const runningPortsRef = useRef(0);
  useEffect(() => {
    registerLeaveGuard(() => devRunningRef.current || runningPortsRef.current > 0);
    return () => registerLeaveGuard(null);
  }, [registerLeaveGuard]);
  // 저장(영속화) — 편집을 objectstore 프로젝트로 되써 컨테이너 재시작에도 보존
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);       // 동시 저장 방지
  const dirtyRef = useRef(false);        // 마지막 저장 이후 변경 있음
  const loadedRef = useRef(false);       // 최초 로드 후에만 자동저장(로드 중 onChange 무시)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markDirtyRef = useRef<() => void>(() => {}); // 편집 표시(자동저장 트리거) — 정의 순서 무관하게 ref 경유
  // 터미널 출력 매칭용 — 컨텍스트 raw 이벤트 구독에서 Bash 명령↔결과 연결
  const ideToolCmdRef = useRef<Record<string, string>>({}); // toolUseId → Bash 명령
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // 에디터 설정
  const [wrap, setWrap] = useState(true); // 자동 줄바꿈
  const [lineNumbers, setLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true); // 자동 저장 on/off (설정 메뉴)
  const [showSettings, setShowSettings] = useState(false);
  // 파일별 저장 스냅샷(영속된 내용) → 탭 dirty(●) 판정. closingTab = 미저장 탭 닫기 확인 모달
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, string>>({});
  const [closingTab, setClosingTab] = useState<string | null>(null);

  // 터미널 — 엔트리를 스트림(cmd/out/err) + 출처(run/debug)별로 보관.
  //   VS Code 정렬: 문제=에러(진단) · 출력=프로그램 stdout · 디버그 콘솔=디버그 세션 · 터미널=일반 실행
  type TermLine = { stream: 'cmd' | 'out' | 'err'; kind: 'run' | 'debug'; text: string };
  const [bottomTab, setBottomTab] = useState<'문제' | '출력' | '디버그' | '터미널'>('터미널');
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false); // 배속 드롭다운
  const [running, setRunning] = useState(false);
  // 인터랙티브 PTY 터미널 — xterm WebView + ws(서버 셸). 토큰은 터미널 탭 처음 열 때 발급.
  const termRef = useRef<TerminalHandle>(null);
  const [termWsUrl, setTermWsUrl] = useState<string | null>(null);
  const [termConnecting, setTermConnecting] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);
  const [termReady, setTermReady] = useState(false); // xterm 로드+연결 완료 → 로딩 오버레이 숨김
  // 멀티 터미널 = tmux 윈도우(탭). 단일 PTY WebView 가 활성 윈도우를 따라간다.
  const [termWindows, setTermWindows] = useState<SandboxWindow[]>([]);
  // 감지된 실행 포트(수동으로 띄운 서버 포함) — 런처 "실행 중인 포트" 섹션.
  const [detectedPorts, setDetectedPorts] = useState<number[]>([]);
  const [hintOpen, setHintOpen] = useState(false); // 에디터 자동완성 팝업 열림 → 액세서리에 방향키/선택 노출
  // 커서 컨텍스트(스코프) — 컨텍스트 인식 보조키 세트 구동. WebView __classifyContext → onContextChange.
  const [editorCtx, setEditorCtx] = useState<EditorContext>(DEFAULT_CTX);
  // 롱프레스 대체키 팝업(부모가 오버레이 렌더 — 바 ScrollView 클리핑 회피).
  const [keyPopup, setKeyPopup] = useState<PopupInfo | null>(null);
  // 터미널 스티키 모디파이어: Ctrl 래치(원샷) / 락(고정).
  const [ctrlLatched, setCtrlLatched] = useState(false);
  const [ctrlLocked, setCtrlLocked] = useState(false);
  // 실물키보드 특수키 패널 — OS 키보드를 내리고 그 자리에 렌더. kbMode='panel' 이면 패널, 'os' 면 일반 키보드.
  const [kbMode, setKbMode] = useState<'os' | 'panel'>('os');
  const [keyboardHeight, setKeyboardHeight] = useState(300); // 마지막으로 관측된 소프트 키보드 높이(패널 높이로 재사용)
  const keyboardOS = useKeyboardOS(); // 특수키 패널 배치(전역 설정에서 전환, 기본 Windows)
  const [inputFocused, setInputFocused] = useState(false); // 에디터/터미널 입력 포커스 — 보조바를 키보드보다 먼저 노출
  // 패널은 OS 키보드가 "완전히 사라진 뒤"(keyboardDidHide) 띄운다 — adjustResize 라 키보드가 떠 있는 동안엔
  // 절대배치 bottom:0 이 키보드 위가 되어 겹쳐 보임. 그래서 blur→dismiss→hide 완료 시점에 전환.
  const wantPanelRef = useRef(false);
  const panelFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 카카오/노션식 "밑에 깔린 패널이 그대로 드러나는" 전환용 — 패널을 키보드 리사이즈에 딸려가지 않게
  //  화면상 고정 top 에 앵커링한다. fullH = 키보드 내려간 상태의 KAV 높이(관측 최댓값), barH = 보조바 높이(측정).
  const fullHRef = useRef(0);
  const [barH, setBarH] = useState(48);
  // 패널 → OS 키보드 전환 중(닫힘~키보드 등장 완료)엔 패널 자리를 검게 두지 않고 패널색 배경으로 채운다.
  const [kbSwitching, setKbSwitching] = useState(false);
  const switchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 공유 모디파이어 상태(ctrl/alt/meta/shift/caps/fn) — 패널 표시 + OS 키보드 글자와 조합.
  const modApi = useModifierKeys();
  // 터미널 패널 높이(드래그로 조절) + 출력 자동 하단 추적
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // 브라우저 패널을 헤더(상태바 inset + 48px) 바로 아래에 위치시키기 위함
  const [terminalHeight, setTerminalHeight] = useState(240);
  const terminalHeightRef = useRef(240);
  const dragStartHeightRef = useRef(240);
  const maxTermHeightRef = useRef(600);
  useEffect(() => { maxTermHeightRef.current = Math.round(winHeight * 0.8); }, [winHeight]);
  const termScrollRef = useRef<ScrollView>(null);
  const termStickRef = useRef(true); // 사용자가 위로 스크롤하지 않았으면 항상 최하단 추적
  const onTermScroll = useCallback((e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    termStickRef.current = (contentSize.height - (contentOffset.y + layoutMeasurement.height)) < 48;
  }, []);
  // 터미널 엔트리 추가(여러 줄이면 줄 단위로 분리). setter 만 사용하므로 안정적.
  const addTerm = useCallback((stream: 'cmd' | 'out' | 'err', kind: 'run' | 'debug', text: string) => {
    setTermLines((l) => [...l, ...String(text).replace(/\n$/, '').split('\n').map((s) => ({ stream, kind, text: s }))]);
  }, []);
  // 터미널 패널 위 테두리 드래그 → 높이 조절
  const termPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
      onPanResponderGrant: () => { dragStartHeightRef.current = terminalHeightRef.current; },
      onPanResponderMove: (_, g) => {
        const next = Math.max(120, Math.min(maxTermHeightRef.current, dragStartHeightRef.current - g.dy));
        terminalHeightRef.current = next;
        setTerminalHeight(next);
      },
    }),
  ).current;

  // ── 디버그 세션 ──
  // 백엔드가 흘려준 trace/output 을 타임라인에 모아 클라이언트에서 재생(하이라이트+출력).
  // 재생/일시정지/스텝/속도/브레이크포인트는 모두 프론트가 제어.
  const debugTimelineRef = useRef<Array<{ kind: 'line'; line: number } | { kind: 'out'; text: string; error?: boolean }>>([]);
  const debugIdxRef = useRef(0);
  const debugPlayingRef = useRef(false);
  const debugSpeedRef = useRef(1);
  const debugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugFileRef = useRef<string | null>(null);
  const debugStreamDoneRef = useRef(false);
  const breakpointsRef = useRef<Record<string, number[]>>({});
  const activePathRef = useRef<string | null>(null);
  const [debugActive, setDebugActive] = useState(false); // 컨트롤 바 노출
  const [debugPlaying, setDebugPlaying] = useState(false);
  const [debugDone, setDebugDone] = useState(false);
  const [debugSpeed, setDebugSpeed] = useState(1);
  const [debugCurrentLine, setDebugCurrentLine] = useState<number | null>(null);
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>({});

  // ── 브라우저 패널(코드 에디터와 별개) ──
  // showBrowser=우측에서 등장하는 전체 하단 패널 노출. browserTabs=여러 탭, 각 탭이 자체 주소/화면.
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([]);
  const [activeBrowserId, setActiveBrowserId] = useState<string | null>(null);
  const browserSeq = useRef(0);
  const previewWebRef = useRef<WebView>(null); // 활성 탭의 WebView(활성 탭만 마운트)
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  // 우측에서 슬라이드 등장(좌측 탐색기처럼 하단 영역을 꽉 채움)
  const browserX = useRef(new Animated.Value(0)).current;

  const activeBrowser = browserTabs.find((t) => t.id === activeBrowserId) || null;
  const updateBrowserTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setBrowserTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // 빈 탭 런처용 최근 방문 URL(워크스페이스별 AsyncStorage 영속). 우리 프리뷰/실행 프록시는 일시적이라 제외.
  const [recentUrls, setRecentUrls] = useState<{ url: string; title: string; ts: number }[]>([]);
  const isEphemeralUrl = (u: string) => /\/api\/(preview|executor)\//.test(u || '');
  const pushRecentUrl = useCallback((url: string, title: string) => {
    if (!url || !/^https?:\/\//i.test(url) || isEphemeralUrl(url)) return;
    setRecentUrls((prev) => {
      const next = [{ url, title: title || url, ts: Date.now() }, ...prev.filter((r) => r.url !== url)].slice(0, 12);
      AsyncStorage.setItem(`ide:browserRecent:${projectId}`, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [projectId]);

  // 주소창 입력 → URL 이면 이동, 아니면 검색 (해당 탭에 반영)
  const navigateTo = useCallback((raw: string, tabId: string) => {
    const t = (raw || '').trim();
    if (!t) return;
    let url: string;
    if (/^https?:\/\//i.test(t)) url = t;
    else if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) url = `https://${t}`;
    else url = `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    setAddressEditing(false);
    updateBrowserTab(tabId, { url, address: url, error: null, loading: true });
  }, [updateBrowserTab]);

  // 새 빈 탭 추가
  const addBrowserTab = useCallback(() => {
    browserSeq.current += 1;
    const id = `b${browserSeq.current}`;
    setBrowserTabs((ts) => [...ts, { id, title: '새 탭', url: null, address: '', loading: false, error: null }]);
    setActiveBrowserId(id);
  }, []);

  // 브라우저 탭 닫기 — 마지막 탭이면 패널도 닫음
  // 미리보기(dev 서버) 폴링 세대 — 재오픈/닫기 시 증가시켜 진행 중 폴링을 무효화.
  const previewGenRef = useRef(0);
  // 포트 미리보기 onError 자동 재시도 카운터(탭별) — 서버 부팅 레이스로 처음 몇 번 에러나도 reload 로 복구.
  const portRetryRef = useRef<Record<string, number>>({});
  const closeBrowserTab = useCallback((id: string) => {
    setBrowserTabs((ts) => {
      const closing = ts.find((t) => t.id === id);
      // 미리보기 탭(어느 탭이든 isPreview)을 닫으면 dev 서버 종료. (탭 id 고정 'preview' 아님)
      if (closing?.isPreview) { previewGenRef.current++; devRunningRef.current = false; stopDevPreview(projectId).catch(() => { /* idle TTL 백업 */ }); }
      const idx = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      setActiveBrowserId((cur) => (cur === id ? (next[idx]?.id || next[idx - 1]?.id || null) : cur));
      if (next.length === 0) setShowBrowser(false);
      return next;
    });
  }, [projectId]);

  // 활성 탭 id 를 ref 로(openPreview 등에서 stale 없이 "현재 탭" 참조)
  const activeBrowserIdRef = useRef<string | null>(null);
  useEffect(() => { activeBrowserIdRef.current = activeBrowserId; }, [activeBrowserId]);

  // 패널 토글 시 슬라이드(우측서 인 / 우측으로 아웃). 닫아도 언마운트하지 않고 화면 밖으로만 보냄
  // → 브라우저 탭/WebView(페이지·스크롤·로그인 상태)가 그대로 유지된다.
  const browserWasShown = useRef(false);
  useEffect(() => {
    if (showBrowser && !browserWasShown.current) browserX.setValue(winWidth || 400); // 닫힘→열림: 오른쪽서 슬라이드인 시작점
    browserWasShown.current = showBrowser;
    Animated.timing(browserX, { toValue: showBrowser ? 0 : (winWidth || 400), duration: 220, useNativeDriver: true }).start();
  }, [showBrowser, winWidth, browserX]);

  // 활성 브라우저 탭 전환 시 이전 탭의 nav 상태가 남지 않도록 초기화(새 탭의 onNavigationStateChange 가 갱신)
  useEffect(() => { setCanGoBack(false); setCanGoForward(false); }, [activeBrowserId]);

  // 워크스페이스별 최근 방문 URL 로드(빈 탭 런처에서 재방문 카드로 노출)
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`ide:browserRecent:${projectId}`)
      .then((raw) => { if (alive) setRecentUrls(raw ? (JSON.parse(raw) as typeof recentUrls) : []); })
      .catch(() => { if (alive) setRecentUrls([]); });
    return () => { alive = false; };
  }, [projectId]);

  // dev 서버 생명주기 = "워크스페이스" 바인딩(IDE 닫힘이 아님!).
  //  모바일 IDE 만 닫는 건(채팅으로 복귀 등) 실행 중인 dev 서버·터미널을 절대 종료하지 않는다 —
  //  바이브코딩 중 소스 보러 잠깐 들어왔다 나가도 서버가 유지돼야 함. 실제 종료는 워크스페이스를
  //  떠날 때 IdeProjectContext 가 한 번만 수행한다(stopDevPreview). 여기서 stop 하면 수동 npm run dev
  //  까지 SWEEP 으로 죽어버리는 버그가 있었다 → 제거.

  // 키보드 표시 여부(특수문자 바 노출 제어) + 이미지 프리뷰 data URL 캐시
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // imgCache[path]: undefined=미로드, 'loading', string=dataUrl, null=실패
  const [imgCache, setImgCache] = useState<Record<string, string | null | 'loading'>>({});

  const editorRef = useRef<CodeEditorHandle>(null);

  // 설정 영속화: 로드 완료 전엔 저장하지 않도록 가드(초기 기본값으로 덮어쓰기 방지).
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      const h = e?.endCoordinates?.height;
      if (h && h > 120) setKeyboardHeight(h); // 패널을 이 높이로 렌더(키보드 자리에 딱 맞춤)
      setKbMode('os'); // 인풋을 다시 탭해 키보드가 뜨면 특수키 패널은 접는다
      setInputFocused(true); // 키보드가 뜨면 보조바도 확실히 노출(WebView onFocusChange 미발화 대비)
      // 키보드가 완전히 등장 → 전환용 배경 종료(이 시점부턴 키보드가 그 자리를 덮음).
      setKbSwitching(false);
      if (switchFallbackRef.current) { clearTimeout(switchFallbackRef.current); switchFallbackRef.current = null; }
    });
    const h = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false); setInputFocused(false); setKbSwitching(false);
      // ⌨︎ 로 패널을 요청해둔 상태면, 키보드가 완전히 내려간 지금 패널 전환(겹침 방지).
      if (wantPanelRef.current) {
        wantPanelRef.current = false;
        if (panelFallbackRef.current) { clearTimeout(panelFallbackRef.current); panelFallbackRef.current = null; }
        setKbMode('panel');
      }
    });
    return () => { s.remove(); h.remove(); };
  }, []);

  // IDE 진입 시 초기화: 이전 화면(워크스페이스 프롬프트 등)의 OS 키보드가 떠 있는 채로 열리면
  //  fullH(KAV onLayout)가 키보드-업 축소 높이로 잡혀 보조바가 위로 튀는 버그가 있다.
  //  → 열릴 때 키보드를 내리고 상태를 os 기본으로 리셋해 깨끗한 초기 좌표를 확보한다.
  useEffect(() => {
    if (!visible) return;
    Keyboard.dismiss();
    setKbMode('os'); setInputFocused(false); setKbSwitching(false);
    wantPanelRef.current = false;
    editorRef.current?.setImeSuppressed(false); // 이전 세션의 IME 억제가 남지 않도록 초기화
  }, [visible]);


  // 저장된 에디터 설정 복원 (마운트 1회)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(IDE_SETTINGS_KEY);
        if (raw) {
          const v = JSON.parse(raw);
          if (typeof v.wrap === 'boolean') setWrap(v.wrap);
          if (typeof v.lineNumbers === 'boolean') setLineNumbers(v.lineNumbers);
          if (typeof v.fontSize === 'number') setFontSize(v.fontSize);
          if (typeof v.autoSaveEnabled === 'boolean') setAutoSaveEnabled(v.autoSaveEnabled);
        }
      } catch (_) { /* noop */ }
      settingsLoadedRef.current = true;
    })();
  }, []);

  // 설정 변경 시 저장 (로드 완료 후에만)
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    AsyncStorage.setItem(IDE_SETTINGS_KEY, JSON.stringify({ wrap, lineNumbers, fontSize, autoSaveEnabled })).catch(() => {});
  }, [wrap, lineNumbers, fontSize, autoSaveEnabled]);

  // 작업 상태(열린 탭/활성 파일/터미널) 변경 시 워크스페이스별로 저장 — 다음 진입 시 복원
  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    AsyncStorage.setItem(ideStateKey(projectId), JSON.stringify({ openTabs, activePath, showTerminal, terminalExpanded })).catch(() => {});
  }, [projectId, openTabs, activePath, showTerminal, terminalExpanded]);

  const loadImage = useCallback(async (path: string) => {
    setImgCache((c) => (c[path] !== undefined ? c : { ...c, [path]: 'loading' }));
    const res = await getIdeAsset(projectId, path);
    setImgCache((c) => ({ ...c, [path]: res.success && res.data ? res.data.dataUrl : null }));
  }, [projectId]);

  // 활성 파일이 이미지이고 아직 안 받았으면 로드 (탭 전환/진입파일 자동오픈 커버)
  useEffect(() => {
    if (activePath && isImagePath(activePath) && imgCache[activePath] === undefined) loadImage(activePath);
  }, [activePath, imgCache, loadImage]);

  // 재생 엔진이 stale state 없이 현재 활성 파일을 참조하도록 ref 동기화
  useEffect(() => { activePathRef.current = activePath; setEditorCtx(DEFAULT_CTX); }, [activePath]);
  // 보조키 사용빈도 1회 로드(로컬 영속).
  useEffect(() => { loadFreq(); }, []);

  // 터미널 출력이 늘어나면(사용자가 위로 스크롤한 상태가 아니면) 자동으로 최하단 추적
  useEffect(() => {
    if (termStickRef.current) {
      requestAnimationFrame(() => termScrollRef.current?.scrollToEnd({ animated: false }));
    }
  }, [termLines, bottomTab]);

  // IDE 가 보일 때 → 컨텍스트에 이 프로젝트를 활성화(미리 로드돼 있으면 즉시) + 저장 소유권을 IDE 로.
  // 오버레이는 닫혀도(visible=false) 언마운트되지 않으므로, "보이는 동안"에만 컨텍스트를 점유한다.
  // (보이는 동안=IDE 가 저장 담당, 숨김/언마운트=컨텍스트가 에이전트 변경을 저장)
  useEffect(() => {
    if (!projectId || !visible) { setEditorActive(false); return; }
    ensureProject(projectId);
    setEditorActive(true);
    return () => { setEditorActive(false); };
  }, [projectId, visible, ensureProject, setEditorActive]);

  // 프로젝트 소스가 (미리 로드/이번 로드로) 준비되면 1회: dirty baseline 설정 + 탭/터미널 상태 복원.
  // 컨텍스트가 contents 를 소유하므로 여기선 화면별(탭/baseline) 상태만 초기화한다.
  const baselineDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectReady || !project || !projectId) return;
    if (baselineDoneRef.current === projectId) return;
    baselineDoneRef.current = projectId;
    const p = project;
    setSavedSnapshot({ ...contents }); // 영속 baseline = 현재 로드된 내용
    loadedRef.current = true; // 이후 편집부터 자동저장 활성
    dirtyRef.current = false;
    setSaveState('saved');
    const fileExists = (pth: string) =>
      p.files.some((f) => f.path === pth) || p.assets.some((a) => a.path === pth);
    // 관리자가 저장한 탭/활성 탭이 있으면 그대로 복원(존재하는 파일/에셋만)
    const savedTabs = (initialTabs || []).filter(fileExists);
    if (savedTabs.length) {
      setOpenTabs(savedTabs);
      setActivePath(savedActiveTab && savedTabs.includes(savedActiveTab) ? savedActiveTab : savedTabs[0]);
      return;
    }
    // 관리자 지정 상태가 없으면 → 기기에 저장된 직전 작업 상태(열린 탭/활성 파일/터미널) 복원
    (async () => {
      let restoredTabs = false;
      try {
        const raw = await AsyncStorage.getItem(ideStateKey(projectId));
        if (raw) {
          const st = JSON.parse(raw) as { openTabs?: string[]; activePath?: string | null; showTerminal?: boolean; terminalExpanded?: boolean };
          const tabs = (st.openTabs || []).filter(fileExists);
          if (tabs.length) {
            setOpenTabs(tabs);
            setActivePath(st.activePath && tabs.includes(st.activePath) ? st.activePath : tabs[0]);
            restoredTabs = true;
          }
          // 터미널 열림 상태는 탭 복원 여부와 무관하게 복원
          if (st.showTerminal) setShowTerminal(true);
          if (st.terminalExpanded) setTerminalExpanded(true);
        }
      } catch (_) { /* noop */ }
      if (!restoredTabs) {
        // 복원할 상태 없으면 진입 파일 자동 오픈
        const entry =
          (entryFile && p.files.find((f) => f.path === entryFile)?.path) ||
          p.files.find((f) => /index\.html?$/i.test(f.path))?.path ||
          p.files.find((f) => /\.html?$/i.test(f.path))?.path ||
          p.files[0]?.path ||
          null;
        if (entry) { setOpenTabs([entry]); setActivePath(entry); }
      }
    })();
  }, [projectReady, project, projectId, contents, initialTabs, savedActiveTab, entryFile, ensureProject, setEditorActive]);

  const tree = useMemo(
    () => buildTree(project?.files || [], project?.assets || []),
    [project],
  );

  const openFile = useCallback((path: string) => {
    // 이미지는 프리뷰 탭으로, 텍스트는 에디터 탭으로 — 둘 다 탭으로 연다
    setOpenTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActivePath(path);
    if (isImagePath(path)) loadImage(path);
  }, [loadImage]);

  // 파일별 미저장 여부 — 현재 편집 내용 vs 영속 baseline(savedSnapshot). 새 파일은 baseline 없음 → dirty.
  const isDirty = (path: string) => contents[path] !== undefined && contents[path] !== savedSnapshot[path];
  const anyDirty = Object.keys(contents).some(isDirty);

  // 탭 실제 닫기(확인 없이)
  const doCloseTab = (path: string) => {
    setOpenTabs((t) => {
      const idx = t.indexOf(path);
      const next = t.filter((p) => p !== path);
      if (activePath === path) setActivePath(next[idx] || next[idx - 1] || null);
      return next;
    });
  };

  // 탭 닫기 요청 — 미저장 변경이 있으면: 자동저장 ON이면 저장 후 닫기, OFF면 확인 모달.
  const closeTab = (path: string) => {
    if (isDirty(path)) {
      if (autoSaveEnabled) { void doSaveRef.current({ toast: false }); doCloseTab(path); return; }
      setClosingTab(path); // 수동 모드 → VS Code 식 확인 모달
      return;
    }
    doCloseTab(path);
  };

  // 미저장 탭 닫기 모달 응답: save=저장 후 닫기, discard=변경 폐기 후 닫기, cancel=취소
  const confirmCloseDirty = (action: 'save' | 'discard' | 'cancel') => {
    const path = closingTab;
    setClosingTab(null);
    if (!path || action === 'cancel') return;
    if (action === 'save') {
      void doSaveRef.current({ toast: false });
    } else if (action === 'discard' && path in savedSnapshot) {
      setContents((c) => ({ ...c, [path]: savedSnapshot[path] })); // baseline 으로 되돌림
    }
    doCloseTab(path);
  };

  // 편집 내용을 샌드박스 FS 로 디바운스 반영 → 실행 중인 dev 서버가 감지해 HMR(핫리로드).
  //  · objectstore 저장(markDirty)과 별개. 같은 relPath(=contents 키)가 readWorkspaceFile 과 동일 매핑.
  const sandboxSyncRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const syncFileToSandbox = useCallback((relPath: string, content: string) => {
    if (!projectId) return;
    const timers = sandboxSyncRef.current;
    if (timers[relPath]) clearTimeout(timers[relPath]);
    timers[relPath] = setTimeout(() => {
      delete timers[relPath];
      writeAgentFile(relPath, content, projectId).catch(() => { /* dev 미가동 등 — 무시 */ });
    }, 350);
  }, [projectId]);
  useEffect(() => () => { Object.values(sandboxSyncRef.current).forEach((t) => clearTimeout(t)); }, []);

  // 에디터 onChange. setActivePath 업데이터 안에서 setState 호출 금지(렌더 중 setState 경고) → activePathRef 사용.
  const setActiveContent = useCallback((val: string) => {
    const cur = activePathRef.current;
    if (cur) {
      setContents((c) => ({ ...c, [cur]: val }));
      syncFileToSandbox(cur, val); // 샌드박스 FS 반영 → HMR
    }
    markDirtyRef.current(); // 사용자 편집 → objectstore 자동 저장 예약
  }, [syncFileToSandbox]);

  const filesPayload = useCallback(
    () => (project?.files || []).map((f) => ({ path: f.path, content: contents[f.path] ?? f.content })),
    [project, contents],
  );

  // 짧게 떠올랐다 사라지는 토스트
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // 새 파일/폴더 생성 → project.files 에 추가 + 자동저장(objectstore 영속).
  //  · 폴더는 objectstore 가 평면이라 placeholder(.gitkeep)로 트리에 표시.
  const createEntry = useCallback(() => {
    const kind = newEntry;
    const raw = newEntryName.trim().replace(/^\/+|\/+$/g, '');
    setNewEntry(null);
    setNewEntryName('');
    if (!kind || !raw) return;
    const exists = (p: string) => (project?.files || []).some((f) => f.path === p) || (project?.assets || []).some((a) => a.path === p);
    const filePath = kind === 'folder' ? `${raw}/.gitkeep` : raw;
    if (exists(filePath)) { showToast('이미 존재합니다.'); return; }
    setProject((p) => (p ? { ...p, files: [...p.files, { path: filePath, language: langOf(filePath), content: '' }] } : p));
    setContents((c) => ({ ...c, [filePath]: '' }));
    if (kind === 'file') openFile(filePath);
    markDirtyRef.current(); // 자동저장 예약 → objectstore
  }, [newEntry, newEntryName, project, openFile, showToast]);

  // 외부 파일 가져오기 → base64 로 읽어 objectstore 에 바이너리 저장 → 프로젝트 재로드(트리 갱신).
  const importFiles = useCallback(async () => {
    if (!projectId || importing) return;
    let picked;
    try { picked = await pickAnyFiles(); } catch (_) { showToast('파일을 불러올 수 없습니다.'); return; }
    if (!picked.length) return;
    setImporting(true);
    try {
      const payload = picked.map((a) => ({ path: a.name, content: a.base64, base64: true }));
      const res = await saveIdeProject(projectId, payload);
      if (res.success) {
        // 컨텍스트가 소유한 소스를 강제 재로드 → 트리/내용 갱신(캐시·다음 진입에도 반영)
        await reloadProject(projectId);
        showToast(`${picked.length}개 파일을 가져왔어요.`);
      } else { showToast('가져오기에 실패했어요.'); }
    } catch (_) { showToast('가져오기 중 오류가 발생했어요.'); }
    finally { setImporting(false); }
  }, [projectId, importing, showToast, reloadProject]);

  // 저장 코어 — 현재 텍스트 파일(에이전트/사용자 편집 포함)을 objectstore 에 영속화.
  // toast=true 면 결과 토스트(수동 저장), false 면 조용히(자동 저장 — 상태 인디케이터만).
  const doSave = useCallback(async (opts?: { toast?: boolean }) => {
    if (!projectId || !(project?.files?.length)) return;
    if (savingRef.current) {
      // 저장 진행 중 — 끝난 뒤 재시도하도록 짧게 재예약(변경 유실 방지)
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => { void doSaveRef.current({ toast: opts?.toast }); }, 800);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveState('saving');
    const payload = filesPayload();
    try {
      const res = await saveIdeProject(projectId, payload);
      if (res.success && res.data) {
        dirtyRef.current = false;
        setSaveState('saved');
        // 저장된 내용을 baseline 으로 → 모든 탭 dirty(●) 해제
        setSavedSnapshot((prev) => {
          const next = { ...prev };
          for (const f of payload) next[f.path] = f.content;
          return next;
        });
        if (opts?.toast) {
          const { saved, failed } = res.data;
          showToast(failed && failed.length ? `${saved}개 저장 · ${failed.length}개 실패` : `${saved}개 파일 저장됨`);
        }
      } else {
        setSaveState('error');
        if (opts?.toast) showToast(res.error || '저장 실패');
      }
    } catch (e) {
      setSaveState('error');
      if (opts?.toast) showToast(e instanceof Error ? e.message : '저장 실패');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [projectId, project, filesPayload, showToast]);

  // 최신 doSave 를 ref 로 — 디바운스/언마운트 콜백의 stale 클로저 방지
  const doSaveRef = useRef(doSave);
  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  // 편집 발생 표시. 탭 dirty(●)는 contents vs savedSnapshot 로 자동 파생되므로 여기선 자동저장만 관리.
  const markDirty = useCallback(() => {
    if (!loadedRef.current) return; // 로드 중 onChange 무시
    dirtyRef.current = true;
    if (!autoSaveEnabled) return; // 수동 저장 모드 → 자동 저장 안 함(● 표시만)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { void doSaveRef.current({ toast: false }); }, 1500);
  }, [autoSaveEnabled]);
  markDirtyRef.current = markDirty; // setActiveContent 등 ref 경유 호출용(정의 순서 무관)

  // 화면 떠날 때(언마운트) 변경분이 남아 있으면 마지막 저장
  useEffect(() => () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (dirtyRef.current) void doSaveRef.current({ toast: false });
  }, []);

  // 수동 저장(상단바 버튼) — 결과 토스트 표시
  const handleSave = useCallback(() => { void doSave({ toast: true }); }, [doSave]);

  // ── 에이전트 → 에디터 라이브 반영 ──
  // 파일 데이터(contents/트리) 동기화와 닫혀 있을 때의 저장은 IdeProjectContext 가 소유한다.
  // 여기선 IDE 가 "열려 있을 때"의 화면 반응만 얹는다: 변경 파일 탭 열기 + 활성 에디터 즉시 갱신 + dirty 표시.
  useEffect(() => {
    const off = subscribeFileChange((relPath, content) => {
      setOpenTabs((t) => (t.includes(relPath) ? t : [...t, relPath]));
      if (relPath === activePathRef.current) editorRef.current?.setValue(content);
      markDirtyRef.current(); // 열려 있는 동안엔 IDE 가 저장 담당
    });
    return off;
  }, [subscribeFileChange]);

  // 컨텍스트 raw 이벤트 구독 → 에이전트 Bash 를 터미널에 "표시"(셸 입력 아님, 별도 one-shot exec).
  //  · 인터랙티브 터미널(xterm)에 dim 으로 명령/결과를 써서 "모바일에서 실행되는" 느낌은 유지하되,
  //    사용자 PTY 셸과 섞이지 않게 화면 출력만 한다(write, sendKey 아님).
  useEffect(() => {
    const off = registerEventListener((evt) => {
      if (evt.type === 'tool_use') {
        if (evt.tool === 'Bash' && evt.input?.command) {
          ideToolCmdRef.current[evt.toolUseId] = evt.input.command;
          termRef.current?.write(`\r\n\x1b[90m$ ${evt.input.command}\x1b[0m\r\n`);
          setBottomTab('터미널');
          setShowTerminal(true);
        }
      } else if (evt.type === 'tool_result') {
        if (ideToolCmdRef.current[evt.toolUseId] != null && evt.content) {
          const body = evt.ok ? String(evt.content) : `\x1b[31m${evt.content}\x1b[0m`;
          termRef.current?.write(body.endsWith('\n') ? body : body + '\n');
        }
      }
    });
    return off;
  }, [registerEventListener, subscribeFileChange]);

  // 승인/거부 응답 → 대기 중인 에이전트 도구 실행 해소(컨텍스트가 처리)
  const respondPermission = useCallback((decision: 'allow' | 'deny') => {
    resolvePermission(decision);
  }, [resolvePermission]);

  // IDE 진입 시 컨텍스트 세션을 이 워크스페이스에 부착.
  //  · 채팅("소스 보기")에서 넘어와 이미 같은 워크스페이스 세션이 활성이면 그대로 유지(라이브 스트림 보존).
  //  · 드로어/홈에서 바로 열었으면 최신 세션을 열거나(없으면) 새로 만든다.
  // 언마운트해도 스트림은 컨텍스트가 들고 있어 끊기지 않는다(채팅으로 돌아가도 이어짐).
  useEffect(() => {
    if (!visible) return;          // 숨겨진(상주) IDE 는 세션을 가로채지 않는다 — 워크스페이스 이탈 후 leaveSession 을 되돌리는 재부착 버그 방지
    if (!projectId) return;
    if (activeWorkspace?.id === projectId && activeSessionId) return; // 이미 부착됨
    let alive = true;
    (async () => {
      const ws = { id: projectId, name: projectName };
      try {
        const list = await sessionService.listSessions(projectId);
        if (!alive) return;
        if (list.length > 0) await openSession(ws, list[0].id);
        else await newSession(ws);
      } catch (_) {
        try { if (alive) await newSession(ws); } catch (_) { /* noop */ }
      }
    })();
    return () => { alive = false; };
  }, [visible, projectId, projectName, activeWorkspace, activeSessionId, openSession, newSession]);

  // openPreview 는 아래에서 정의되므로 ref 로 우회(렌더 시점 TDZ 회피).
  const openPreviewRef = useRef<null | (() => void)>(null);

  // ── 인터랙티브 PTY 터미널 ──
  const termActive = showTerminal && bottomTab === '터미널';
  // 터미널 토큰을 IDE 진입 즉시(eager) 발급·연결 — 사용자가 터미널 탭을 열 땐 이미 준비돼 있게(체감 속도↑).
  //   xterm CDN 로드 + ws/tmux attach 가 가장 느린데, 이를 백그라운드(숨김 마운트)에서 미리 끝낸다.
  // 발급은 1회만 — 진행 중 플래그(ref)로 중복/경합 방지.
  const termStartRef = useRef(false);
  useEffect(() => {
    if (!visible || !projectId) return;
    if (termStartRef.current || termWsUrl) return;
    termStartRef.current = true;
    let alive = true;
    setTermConnecting(true);
    setTermError(null);
    (async () => {
      try {
        const token = await startTerminal(projectId);
        if (alive) setTermWsUrl(buildTerminalWsUrl(token));
      } catch (e: any) {
        if (alive) { setTermError(e?.message || '터미널을 시작할 수 없어요.'); termStartRef.current = false; }
      } finally {
        if (alive) setTermConnecting(false);
      }
    })();
    return () => { alive = false; };
  }, [visible, projectId, termWsUrl]);
  // 프로젝트가 바뀌면 터미널 세션 재시작 허용.
  useEffect(() => { termStartRef.current = false; setTermWsUrl(null); setTermError(null); setTermReady(false); }, [projectId]);

  // 키 입력을 PTY stdin 으로(액세서리 바). Ctrl+C=\x03, 방향키=ANSI escape.
  const sendKey = useCallback((s: string) => { termRef.current?.sendKey(s); }, []);
  const ctrlC = useCallback(() => { termRef.current?.sendKey('\x03'); }, []);
  // 터미널 특수문자 입력 — Ctrl 활성 시 컨트롤 바이트로 변환, 래치(원샷)면 1회 후 자동 해제.
  const sendTermChar = useCallback((s: string) => {
    const ctrlOn = ctrlLatched || ctrlLocked;
    termRef.current?.sendKey(ctrlOn ? ctrlByte(s) : s);
    if (ctrlLatched && !ctrlLocked) setCtrlLatched(false);
  }, [ctrlLatched, ctrlLocked]);

  // ── 실물키보드 특수키 패널 ──
  // 모디파이어(vmod) 변경 시 활성 대상(에디터/터미널)에 주입 → OS 키보드 글자와 조합.
  useEffect(() => {
    const f = modApi.flags;
    if (termActive) termRef.current?.setVmods({ ctrl: f.ctrl });
    else editorRef.current?.setVmods(f);
  }, [modApi.flags, termActive]);
  // ⌨︎ 열기 — 활성 WebView 입력을 blur(삼성/구글 키보드는 Keyboard.dismiss 로 안 내려감) 후 즉시 패널로 전환.
  //  패널은 화면 하단 absolute 오버레이라 키보드는 뒤에서 내려가고 패널이 바로 자리를 덮는다(체감 지연 최소화).
  //  keyboardDidHide 는 백업(이벤트가 늦게 와도 상태 보정). 짧은 폴백 타이머로도 이중 보장.
  const openKbPanel = useCallback(() => {
    wantPanelRef.current = true;
    if (termActive) termRef.current?.blur();
    else { editorRef.current?.setImeSuppressed(true); editorRef.current?.blur(); } // 패널 키로 편집해도 OS 키보드 안 뜨게
    Keyboard.dismiss();
    setKbMode('panel');                          // 즉시 전환
    if (panelFallbackRef.current) clearTimeout(panelFallbackRef.current);
    panelFallbackRef.current = setTimeout(() => {
      if (wantPanelRef.current) { wantPanelRef.current = false; setKbMode('panel'); }
    }, 120);
  }, [termActive]);
  // 패널 → OS 키보드 복귀. 포커스 직전에 현재 모디파이어(vmod)를 명시 재주입해 타이밍 갭 제거.
  const closeKbPanel = useCallback(() => {
    setKbMode('os');
    // ★ 전환 순간 보조바가 언마운트→재마운트되며 튀는 것 방지: 포커스로 키보드가 다시 뜰 때까지
    //   (keyboardVisible=false, kbMode=os 인 짧은 갭 동안) 바 렌더 조건을 유지하도록 inputFocused 를 미리 true 로.
    setInputFocused(true);
    // 패널 자리가 검게 번쩍이지 않도록, 키보드가 완전히 등장(keyboardDidShow)할 때까지 패널색 배경 유지.
    setKbSwitching(true);
    if (switchFallbackRef.current) clearTimeout(switchFallbackRef.current);
    switchFallbackRef.current = setTimeout(() => setKbSwitching(false), 500); // 키보드가 안 뜰 경우 대비
    const f = modApi.flags;
    if (termActive) { termRef.current?.setVmods({ ctrl: f.ctrl }); termRef.current?.focus(); }
    // IME 억제 해제(inputmode=text) 후 blur→재포커스로 OS 키보드 복귀.
    else { editorRef.current?.setVmods(f); editorRef.current?.setImeSuppressed(false); editorRef.current?.refocusKeyboard(); }
  }, [termActive, modApi]);
  // 패널/보조바를 키보드 없이 완전히 내린다(하드웨어 백 등) — 포커스 blur 로 재등장 방지.
  const dismissKbPanel = useCallback(() => {
    if (switchFallbackRef.current) { clearTimeout(switchFallbackRef.current); switchFallbackRef.current = null; }
    if (panelFallbackRef.current) { clearTimeout(panelFallbackRef.current); panelFallbackRef.current = null; }
    wantPanelRef.current = false;
    setKbSwitching(false); setKbMode('os'); setInputFocused(false);
    // IME 억제 해제 필수 — 안 하면 다음에 에디터를 직접 탭해도 inputmode=none 이 남아 키보드가 안 뜬다.
    if (termActive) termRef.current?.blur(); else { editorRef.current?.setImeSuppressed(false); editorRef.current?.blur(); }
  }, [termActive]);
  const toggleKbPanel = useCallback(() => { if (kbMode === 'panel') closeKbPanel(); else openKbPanel(); }, [kbMode, closeKbPanel, openKbPanel]);

  // 하드웨어 백(뒤로가기) 우선순위: 특수키 패널 > OS 키보드 > IDE 닫기.
  //  패널/키보드가 떠 있으면 페이지 이동 대신 그것부터(키보드처럼) 내린다. 아무것도 없을 때만 IDE 닫기.
  //  ※ Host 의 BackHandler 는 제거했다(여기서 kbMode 를 알고 우선 처리해야 하므로).
  useEffect(() => {
    if (!visible) return;
    const onBack = () => {
      if (kbMode === 'panel') { dismissKbPanel(); return true; }          // 패널만 내림
      if (keyboardVisible || inputFocused) {                              // OS 키보드 → 보조바 먼저 숨기고 내림
        setInputFocused(false);
        if (termActive) termRef.current?.blur(); else editorRef.current?.blur();
        Keyboard.dismiss();
        return true;
      }
      onClose?.();                                                        // 그 외 → IDE 닫기
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [visible, kbMode, keyboardVisible, inputFocused, termActive, dismissKbPanel, onClose]);
  // 패널 원샷 특수키 → 활성 대상. 터미널=ANSI/제어 시퀀스, 에디터=CM 명령(applyKey, 현재 모디파이어 반영).
  const onPanelKey = useCallback((name: SpecialKeyName) => {
    if (termActive) { const seq = TERM_SEQ[name]; if (seq) termRef.current?.sendKey(seq); }
    else editorRef.current?.applyKey(name, modApi.flags, keyboardOS); // OS별 화살표 네비게이션(⌘/⌥ vs Ctrl) 분기
    modApi.consume();
  }, [termActive, modApi, keyboardOS]);
  // 터미널 "지우기" — 화면 + 스크롤백까지 비운다. xterm 버퍼 즉시 clear(체감) + 백엔드 tmux clear-history
  //  (모바일 터치 스크롤은 tmux 히스토리를 보므로 clear-history 까지 해야 스크롤해도 빈 화면).
  const clearTerminal = useCallback(() => {
    termRef.current?.clear();
    clearTerminalScreen().catch(() => {});
  }, []);

  // ── 멀티 터미널(tmux 윈도우) + 포트 감지 ──
  // 윈도우 목록/실행 포트를 새로고침 — 터미널 탭 바 + 런처 "실행 중인 포트" 에 반영.
  const refreshTerminals = useCallback(async () => {
    if (!projectId) return;
    try { const r = await listTerminals(projectId); if (r.success && r.data) setTermWindows(r.data.windows || []); } catch { /* noop */ }
  }, [projectId]);
  const refreshPorts = useCallback(async () => {
    if (!projectId) return;
    // 관리형 dev 포트는 "개발 서버 미리보기" 흐름이 담당(포트 프록시는 vite --base 와 불일치) → 목록에서 제외.
    try {
      const r = await listSandboxPorts(projectId);
      if (r.success && r.data) {
        const ps = (r.data.ports || []).filter((p) => p !== r.data!.devPort);
        setDetectedPorts(ps);
        runningPortsRef.current = ps.length; // 이탈 가드용(실행 중 서버 있으면 경고)
      }
    } catch { /* noop */ }
  }, [projectId]);

  // 윈도우(탭) 전환 — 활성 PTY 가 즉시 그 윈도우를 표시.
  //  smcup off(네이티브 스크롤) 부작용으로 전환 시 이전 윈도우 잔상이 xterm 스크롤백에 남는다 →
  //  전환 직전 xterm 버퍼를 비우고(clear) tmux 가 새 윈도우를 다시 그리게 한다(각 셸이 자기 화면만).
  const switchTerminal = useCallback(async (index: number) => {
    try {
      termRef.current?.clear();
      await selectTerminal(index);
      setTermWindows((ws) => ws.map((w) => ({ ...w, active: w.index === index })));
      setTimeout(() => termRef.current?.fit(), 60); // resize → tmux 전체 재그리기 유도
      refreshTerminals();
    } catch { /* noop */ }
  }, [refreshTerminals]);

  // 새 터미널(윈도우) — 생성 시 그 윈도우로 전환됨. 이전 잔상 제거 위해 xterm 비우고 새로고침.
  const addTerminal = useCallback(async () => {
    try {
      termRef.current?.clear();
      await newTerminal(projectId);
      await refreshTerminals();
      setTimeout(() => termRef.current?.fit(), 60);
    } catch { /* noop */ }
  }, [projectId, refreshTerminals]);

  // 터미널(윈도우) 닫기 — 그 안의 프로세스도 종료. 마지막 1개는 셸로 리셋.
  const closeTerminalTab = useCallback(async (index: number) => {
    try { await closeTerminal(index); await refreshTerminals(); setTimeout(() => termRef.current?.fit(), 80); } catch { /* noop */ }
  }, [refreshTerminals]);

  // 진입 시 터미널 정리 — 실행 중인 게 없으면(프로세스/포트 0) 묵은 유휴 셸을 닫고 새 셸 하나로 리셋.
  //  실행 중인 게 있으면(dev 서버·수동 서버 등) 전부 유지(영속). 워크스페이스/프로젝트당 1회만.
  const reconciledRef = useRef<string | null>(null);
  const reconcileTerminals = useCallback(async () => {
    if (!projectId || reconciledRef.current === projectId) return;
    reconciledRef.current = projectId;
    try {
      const [w, p] = await Promise.all([listTerminals(projectId), listSandboxPorts(projectId)]);
      const wins = (w.success && w.data?.windows) || [];
      const ports = (p.success && p.data?.ports) || [];
      const isIdleShell = (cmd: string) => /^-?(bash|sh|zsh|dash)$/i.test((cmd || '').trim());
      const running = wins.some((x) => !isIdleShell(x.command)) || ports.length > 0;
      if (!running && wins.length > 0) {
        // 실행 중인 게 없음 → 묵은 셸 정리. 새 셸을 만들고(백엔드가 프로젝트 dir 에서 생성 → npm run dev 가능)
        //  기존 셸은 전부 닫는다. (cwd 가 워크스페이스 루트로 잘못 잡힌 옛 셸도 이걸로 자가 치유)
        const fresh = await newTerminal(projectId);
        const keep = fresh.success ? fresh.data?.index : null;
        if (keep != null) {
          for (const x of wins) { try { await closeTerminal(x.index); } catch { /* noop */ } }
        }
        termRef.current?.clear(); // 새 셸 — 이전 세션 잔상 제거
      }
      await refreshTerminals();
      setTimeout(() => termRef.current?.fit(), 120);
    } catch { /* noop */ }
  }, [projectId, refreshTerminals]);
  useEffect(() => { reconciledRef.current = null; }, [projectId]);
  useEffect(() => { if (visible && projectId) reconcileTerminals(); }, [visible, projectId, reconcileTerminals]);

  // 런처(빈 미리보기 탭)가 보이는지 — 포트 섹션 실시간 갱신 트리거.
  const launcherShown = showBrowser && !!activeBrowser && !activeBrowser.url && !activeBrowser.error && !activeBrowser.loading;
  // 터미널/런처가 보일 때 윈도우·포트를 주기적으로 새로고침(실행 상태 실시간 반영).
  useEffect(() => {
    if (!visible || !projectId) return;
    if (!termActive && !launcherShown) return;
    refreshTerminals(); refreshPorts();
    const id = setInterval(() => { refreshTerminals(); refreshPorts(); }, 4000);
    return () => clearInterval(id);
  }, [visible, projectId, termActive, launcherShown, refreshTerminals, refreshPorts]);

  // ── 디버그 재생 엔진 (refs 기반: stale closure 방지) ──
  const appendTerm = (text: string, error?: boolean) => addTerm(error ? 'err' : 'out', 'debug', text);

  const clearDebugTimer = () => {
    if (debugTimerRef.current) { clearTimeout(debugTimerRef.current); debugTimerRef.current = null; }
  };

  const finishDebugPlayback = () => {
    clearDebugTimer();
    debugPlayingRef.current = false;
    setDebugPlaying(false);
    setDebugDone(true);
    // 실행이 끝까지 가면 잠깐 마지막 줄을 보여준 뒤 자동 종료(세션 정리) → 별도 정지 버튼 불필요.
    debugTimerRef.current = setTimeout(() => { stopDebug(); }, 900);
  };

  // 한 스텝 진행: 사이의 출력들을 소비하고 다음 line 에서 멈춤. 반환: 멈춘 줄(없으면 null)
  const debugStepInternal = (): number | null => {
    const tl = debugTimelineRef.current;
    let idx = debugIdxRef.current;
    while (idx < tl.length) {
      const ev = tl[idx]; idx++;
      if (ev.kind === 'out') { appendTerm(ev.text, ev.error); continue; }
      debugIdxRef.current = idx;
      setDebugCurrentLine(ev.line);
      // 현재 보고 있는 에디터가 디버그 대상 파일일 때만 하이라이트
      if (activePathRef.current === debugFileRef.current) editorRef.current?.highlightLine(ev.line);
      return ev.line;
    }
    debugIdxRef.current = idx;
    return null;
  };

  const scheduleNextAuto = () => {
    clearDebugTimer();
    if (!debugPlayingRef.current) return;
    const delay = Math.max(60, Math.round(600 / debugSpeedRef.current));
    debugTimerRef.current = setTimeout(runAutoStep, delay);
  };

  const runAutoStep = () => {
    const line = debugStepInternal();
    if (line == null) {
      const atEnd = debugIdxRef.current >= debugTimelineRef.current.length;
      if (atEnd && debugStreamDoneRef.current) finishDebugPlayback();
      else scheduleNextAuto(); // 데이터 더 기다림
      return;
    }
    const bp = breakpointsRef.current[debugFileRef.current || ''] || [];
    if (bp.includes(line)) { debugPlayingRef.current = false; setDebugPlaying(false); clearDebugTimer(); return; }
    scheduleNextAuto();
  };

  const playDebug = () => {
    // 끝까지 재생된 뒤엔 더 진행할 게 없음(타임라인 소진) — runAutoStep 이 안전 종료 처리.
    debugPlayingRef.current = true;
    setDebugPlaying(true);
    runAutoStep();
  };
  const pauseDebug = () => { debugPlayingRef.current = false; setDebugPlaying(false); clearDebugTimer(); };
  const stepDebug = () => {
    pauseDebug();
    const line = debugStepInternal();
    if (line == null && debugStreamDoneRef.current && debugIdxRef.current >= debugTimelineRef.current.length) finishDebugPlayback();
  };
  const stopDebug = () => {
    pauseDebug();
    setSpeedMenuOpen(false);
    editorRef.current?.clearHighlight();
    setDebugCurrentLine(null);
    setDebugActive(false);
    setDebugDone(false);
    debugTimelineRef.current = [];
    debugIdxRef.current = 0;
    debugStreamDoneRef.current = false;
    debugFileRef.current = null;
  };
  const setSpeed = (s: number) => { debugSpeedRef.current = s; setDebugSpeed(s); };

  // ── 디버그 실행 ──
  const runDebug = useCallback(async () => {
    if (!activePath) return;
    const lang = debuggableLanguage(activePath);
    setShowTerminal(true);
    if (!lang) {
      setBottomTab('터미널');
      addTerm('cmd', 'run', `이 파일은 디버그(라인 추적) 대상이 아닙니다. 디버그 지원: Python · JavaScript · Ruby · Bash`);
      return;
    }
    setBottomTab('디버그'); // VS Code 처럼 디버그는 디버그 콘솔에서
    // 세션 초기화
    clearDebugTimer();
    editorRef.current?.clearHighlight();
    debugTimelineRef.current = [];
    debugIdxRef.current = 0;
    debugStreamDoneRef.current = false;
    debugPlayingRef.current = false;
    debugFileRef.current = activePath;
    setDebugCurrentLine(null);
    setDebugDone(false);
    setDebugActive(true);
    setRunning(true);
    editorRef.current?.setBreakpoints(breakpointsRef.current[activePath] || []);
    addTerm('cmd', 'debug', `$ ${runCommandText(lang, baseOf(activePath))}  # 디버그`);
    const code = contents[activePath] ?? '';
    await runCode(
      code, lang,
      (msg) => {
        if (msg.type === 'trace' && typeof msg.line === 'number') debugTimelineRef.current.push({ kind: 'line', line: msg.line });
        else if (msg.type === 'output' && msg.data) debugTimelineRef.current.push({ kind: 'out', text: String(msg.data) });
        else if (msg.type === 'error' && msg.data) debugTimelineRef.current.push({ kind: 'out', text: String(msg.data), error: true });
      },
      (err) => { debugTimelineRef.current.push({ kind: 'out', text: err, error: true }); },
      () => { debugStreamDoneRef.current = true; setRunning(false); if (!debugPlayingRef.current) playDebug(); }, // 수집 완료 → 자동 재생
      { debug: true },
    );
  }, [activePath, contents]);

  // 거터 클릭 → 브레이크포인트 토글
  const toggleBreakpoint = useCallback((path: string | null, line: number) => {
    if (!path) return;
    setBreakpoints((prev) => {
      const cur = prev[path] || [];
      const next = cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line].sort((a, b) => a - b);
      const merged = { ...prev, [path]: next };
      breakpointsRef.current = merged;
      editorRef.current?.setBreakpoints(next);
      return merged;
    });
  }, []);

  // 에디터 준비(또는 탭 전환 후 재마운트) 시 브레이크포인트 / 디버그 현재줄 / 하이라이트 복원
  const onEditorReady = useCallback(() => {
    const path = activePathRef.current;
    if (!path) return;
    editorRef.current?.setBreakpoints(breakpointsRef.current[path] || []);
    if (debugFileRef.current === path && debugCurrentLine != null) editorRef.current?.highlightLine(debugCurrentLine);
    const hl = savedHighlights[path];
    if (hl && hl.length) editorRef.current?.setHighlights(hl);
  }, [debugCurrentLine, savedHighlights]);

  // 언마운트 시 타이머 정리
  useEffect(() => () => clearDebugTimer(), []);

  // ── 프로젝트 미리보기 ──
  // 브라우저 패널의 "미리보기" 탭(id='preview'). 프레임워크 앱(dev 스크립트 있음)은 샌드박스에서
  // 실제 dev 서버를 띄워 프록시, 순수 HTML 은 기존 정적 인라인 미리보기로 폴백.
  const openPreview = useCallback(async () => {
    // 현재(활성) 탭에서 실행 — 런처를 띄운 그 탭을 미리보기로 전환(새 탭 X). 활성 탭 없으면 'preview' 생성.
    const id = activeBrowserIdRef.current || 'preview';
    const gen = ++previewGenRef.current; // 이 호출 세대 — 재호출 시 이전 폴링 무효화
    setShowBrowser(true);
    setBrowserTabs((ts) => {
      const base: BrowserTab = { id, title: '미리보기', url: null, address: '', loading: true, error: null, isPreview: true };
      return ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? { ...t, title: '미리보기', isPreview: true, loading: true, url: null, error: null } : t)) : [...ts, base];
    });
    setActiveBrowserId(id);

    const loadStatic = async () => {
      devRunningRef.current = false; // 정적 미리보기는 dev 서버 아님
      const res = await createInlinePreview(projectId, filesPayload(), entryFile);
      if (gen !== previewGenRef.current) return;
      if (res.success && res.data?.sessionId) {
        const url = buildPreviewUrl(res.data.sessionId, res.data.entryFile || 'index.html');
        updateBrowserTab(id, { url, address: url, loading: false, error: null });
      } else {
        updateBrowserTab(id, { error: `세션 생성 실패: ${res.error || '알 수 없는 오류'}`, loading: false });
      }
    };

    try {
      const res = await startDevPreview(projectId);
      if (gen !== previewGenRef.current) return;
      const data = res.success ? res.data : undefined;
      if (data && data.mode === 'dev') {
        const url = buildDevPreviewUrl(data.token);
        if (data.ready) {
          updateBrowserTab(id, { url, address: url, loading: false, error: null });
          devRunningRef.current = true;
          showToast('개발 서버가 터미널에서 실행 중 · 터미널 탭에서 로그 확인·Ctrl+C 종료');
          return;
        }
        // 준비 중(설치/빌드) — 표시 후 ready 될 때까지 폴링(최대 ~3분)
        updateBrowserTab(id, { url: null, address: url, loading: true, error: null });
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2500));
          if (gen !== previewGenRef.current) return;
          const p = await startDevPreview(projectId);
          if (gen !== previewGenRef.current) return;
          const pd = p.success ? p.data : undefined;
          if (pd && pd.mode === 'dev' && pd.ready) {
            updateBrowserTab(id, { url, address: url, loading: false, error: null });
            devRunningRef.current = true;
            showToast('개발 서버가 터미널에서 실행 중 · 터미널 탭에서 로그 확인·Ctrl+C 종료');
            return;
          }
          if (!pd || pd.mode !== 'dev') break; // 상태 변경(정적 등) → 폴백
        }
        await loadStatic(); // 타임아웃/상태변경 → 정적 폴백
        return;
      }
      // mode:'static' 또는 실패 → 정적 미리보기
      await loadStatic();
    } catch (e) {
      if (gen !== previewGenRef.current) return;
      updateBrowserTab(id, { error: `프리뷰 예외: ${e instanceof Error ? e.message : String(e)}`, loading: false });
    }
  }, [projectId, entryFile, filesPayload, updateBrowserTab, showToast]);

  // 빈 탭 런처 카드 노출 판단(파일 트리 기반). dev 스크립트 / 정적 html 존재 여부.
  const hasDevScript = useMemo(() => {
    const pkgs = (project?.files || []).filter((f) => /(^|\/)package\.json$/.test(f.path) && !f.path.includes('node_modules'));
    for (const f of pkgs) {
      try {
        const s = JSON.parse(contents[f.path] ?? f.content)?.scripts;
        if (s && (s.dev || s.start || s.serve)) return true;
      } catch { /* 잘못된 JSON 무시 */ }
    }
    return false;
  }, [project, contents]);
  const htmlEntry = useMemo(() => {
    const files = (project?.files || []).filter((f) => !f.path.includes('node_modules'));
    return files.find((f) => /(^|\/)index\.html?$/i.test(f.path))?.path
        || files.find((f) => /\.html?$/i.test(f.path))?.path
        || null;
  }, [project]);

  // 정적 미리보기만 강제 실행(빈 탭 "정적 미리보기" 카드) — dev 감지 건너뛰고 인라인 정적 서빙.
  const openStaticPreview = useCallback(async () => {
    const id = activeBrowserIdRef.current || 'preview';   // 현재 탭에서 실행(새 탭 X)
    devRunningRef.current = false; // 정적 미리보기 — dev 서버 아님
    const gen = ++previewGenRef.current;
    setShowBrowser(true);
    setBrowserTabs((ts) => {
      const base: BrowserTab = { id, title: '미리보기', url: null, address: '', loading: true, error: null, isPreview: true };
      return ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? { ...t, title: '미리보기', isPreview: true, loading: true, url: null, error: null } : t)) : [...ts, base];
    });
    setActiveBrowserId(id);
    try {
      const res = await createInlinePreview(projectId, filesPayload(), entryFile || htmlEntry || undefined);
      if (gen !== previewGenRef.current) return;
      if (res.success && res.data?.sessionId) {
        const url = buildPreviewUrl(res.data.sessionId, res.data.entryFile || 'index.html');
        updateBrowserTab(id, { url, address: url, loading: false, error: null });
      } else {
        updateBrowserTab(id, { error: `세션 생성 실패: ${res.error || '알 수 없는 오류'}`, loading: false });
      }
    } catch (e) {
      if (gen !== previewGenRef.current) return;
      updateBrowserTab(id, { error: `정적 프리뷰 예외: ${e instanceof Error ? e.message : String(e)}`, loading: false });
    }
  }, [projectId, entryFile, htmlEntry, filesPayload, updateBrowserTab]);

  // 빈 탭 런처에서 카드 탭 → 현재 탭으로 해당 URL 이동
  const openUrlInActiveTab = useCallback((url: string) => {
    if (activeBrowserId) navigateTo(url, activeBrowserId);
  }, [activeBrowserId, navigateTo]);

  // 감지된 임의 포트 → 미리보기. 토큰 발급(userId 바인딩) 후 그 URL 을 현재(또는 새) 탭에 로드.
  const openPortPreview = useCallback(async (port: number) => {
    const id = activeBrowserIdRef.current || 'preview';
    const gen = ++previewGenRef.current;
    devRunningRef.current = false; // 수동 포트(우리가 관리하는 dev 서버 아님)
    setShowBrowser(true);
    setBrowserTabs((ts) => {
      const base: BrowserTab = { id, title: `:${port}`, url: null, address: '', loading: true, error: null, isPort: true, port };
      return ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? { ...t, title: `:${port}`, isPort: true, port, isPreview: false, loading: true, url: null, error: null } : t)) : [...ts, base];
    });
    setActiveBrowserId(id);
    portRetryRef.current[id] = 0; // 재시도 카운터 초기화
    try {
      const res = await openSandboxPort(projectId, port);
      if (gen !== previewGenRef.current) return;
      if (res.success && res.data?.token) {
        // WebView 로 바로 로드. 포워더 기동/서버 부팅 레이스로 처음 한두 번 에러나도 onError 가 자동 재시도.
        const url = buildDevPreviewUrl(res.data.token);
        updateBrowserTab(id, { url, address: url, loading: false, error: null });
      } else {
        updateBrowserTab(id, { error: `포트 ${port} 미리보기 실패: ${res.error || '알 수 없는 오류'}`, loading: false });
      }
    } catch (e) {
      if (gen !== previewGenRef.current) return;
      updateBrowserTab(id, { error: `포트 ${port} 예외: ${e instanceof Error ? e.message : String(e)}`, loading: false });
    }
  }, [projectId, updateBrowserTab]);

  // WebView 로드 에러 처리:
  //  · 포트 미리보기(isPort): 서버 부팅/포워더 기동 레이스로 처음 몇 번 실패할 수 있으니 reload 자동 재시도(최대 ~8회).
  //    WebView 를 언마운트하지 않도록 url 유지(loading=false) 후 reload — 준비되면 자동 표시.
  //  · 프로젝트 미리보기(isPreview): 죽은 에러화면 대신 런처로 복귀.
  //  · 일반 탭: 에러 메시지 표시.
  const handlePreviewError = useCallback((tab: BrowserTab, message: string) => {
    if (tab.isPort) {
      const n = (portRetryRef.current[tab.id] || 0) + 1;
      portRetryRef.current[tab.id] = n;
      if (n <= 8) {
        updateBrowserTab(tab.id, { error: null, loading: false });
        setTimeout(() => previewWebRef.current?.reload(), 1200);
      } else {
        updateBrowserTab(tab.id, { error: `포트 ${tab.port ?? ''}: 서버 응답 없음 — 터미널에서 실행 중인지 확인하세요`, loading: false });
      }
      return;
    }
    if (tab.isPreview) { updateBrowserTab(tab.id, { url: null, error: null, loading: false }); return; }
    updateBrowserTab(tab.id, { error: message, loading: false });
  }, [updateBrowserTab]);

  // 터미널에 사용자가 직접 친 명령 감지 → dev 서버 명령이면 포트가 뜨는 대로 자동 미리보기.
  //   (관리형 재실행 안 함 — 사용자가 방금 띄운 그 서버를 그대로 프록시.)
  const onTerminalCommand = useCallback((line: string) => {
    const cmd = line.trim().toLowerCase();
    const isDev = /\b(npm|pnpm|yarn|bun)\b.*\b(dev|start|serve|preview)\b/.test(cmd)
      || /\bvite\b/.test(cmd)
      || /\b(next|nuxt|astro)\b.*\bdev\b/.test(cmd)
      || /python3?\s+-m\s+http\.server/.test(cmd)
      || /\bnpx\b.*\b(serve|http-server|vite)\b/.test(cmd);
    if (!isDev) return;
    const before = new Set(detectedPorts);
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const r = await listSandboxPorts(projectId);
        if (r.success && r.data) {
          const ports = r.data.ports || [];
          setDetectedPorts(ports);
          const fresh = ports.find((p) => !before.has(p));
          if (fresh) { showToast(`포트 ${fresh} 감지 — 미리보기를 엽니다`); openPortPreview(fresh); return; }
        }
      } catch { /* noop */ }
      if (tries < 12) setTimeout(poll, 2500); // 최대 ~30초
    };
    setTimeout(poll, 2000);
  }, [projectId, detectedPorts, openPortPreview, showToast]);

  // 터미널의 dev 명령이 미리보기를 열 수 있도록 ref 동기화(정의 순서상 TDZ 회피)
  useEffect(() => { openPreviewRef.current = openPreview; }, [openPreview]);

  const activeIsDebuggable = activePath ? !!debuggableLanguage(activePath) : false;

  // ── 트리 렌더 ──
  const renderTree = (node: TreeNode, depth = 0): React.ReactNode =>
    (node.children || []).map((child) => {
      if (child.dir) {
        const isOpen = !collapsed[child.path];
        return (
          <View key={`d:${child.path}`}>
            <Pressable
              onPress={() => setCollapsed((c) => ({ ...c, [child.path]: !c[child.path] }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: depth * 14 + 8 }}
            >
              <Text style={{ color: '#94A3B8', fontSize: 11, width: 10 }}>{isOpen ? '▾' : '▸'}</Text>
              <Text style={{ color: '#E2E8F0', fontSize: 13 }}>{child.name}</Text>
            </Pressable>
            {isOpen && renderTree(child, depth + 1)}
          </View>
        );
      }
      const isActive = activePath === child.path;
      return (
        <Pressable
          key={`f:${child.path}`}
          onPress={() => openFile(child.path)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            paddingVertical: 5, paddingLeft: depth * 14 + 22, paddingRight: 8,
            backgroundColor: isActive ? '#1F2430' : 'transparent', borderRadius: 4,
          }}
        >
          <FileTypeIcon name={child.name} />
          <Text style={{ color: isActive ? '#fff' : '#CBD5E1', fontSize: 13 }} numberOfLines={1}>{child.name}</Text>
        </Pressable>
      );
    });

  // 활성(once/lock) 모디파이어를 보조바 앞쪽에 칩으로 표시 → 탭하면 해제(패널 재오픈 없이).
  const MOD_ORDER: ModId[] = ['ctrl', 'meta', 'alt', 'shift', 'caps', 'fn'];
  const modLabel = (id: ModId): string => (keyboardOS === 'mac'
    ? ({ ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧', caps: 'caps', fn: 'fn' } as Record<ModId, string>)
    : ({ ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift', caps: 'Caps', fn: 'Fn' } as Record<ModId, string>))[id];
  const renderModChips = () => {
    const active = MOD_ORDER.filter((id) => modApi.mods[id] !== 'off');
    if (!active.length) return null;
    return (
      <>
        {active.map((id) => {
          const locked = modApi.mods[id] === 'lock';
          return (
            <Pressable
              key={'mc' + id}
              onPress={() => { haptic.keyTap(); modApi.tap(id); }}
              hitSlop={3}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 37, paddingHorizontal: 9, borderRadius: 6, backgroundColor: locked ? '#1D4ED8' : '#3B82F6', elevation: 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{modLabel(id)}</Text>
              <Text style={{ color: '#DBEAFE', fontSize: 12, fontWeight: '700' }}>✕</Text>
            </Pressable>
          );
        })}
        <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3, alignSelf: 'center' }} />
      </>
    );
  };

  // 보조바(에디터/터미널) 본체 — OS 키보드 위(인라인)와 특수키 패널 위(오버레이) 양쪽에서 공유 렌더.
  const renderBar = () => {
    if (termActive) {
      return (
        <View style={{ backgroundColor: '#D2D7E1', flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ paddingLeft: 5, paddingVertical: 5 }}>
            <KbToggleKey active={kbMode === 'panel'} onPress={toggleKbPanel} />
          </View>
          <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3, alignSelf: 'center' }} />
          <ScrollView
            horizontal
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5, alignItems: 'center' }}
          >
            {renderModChips()}
            {/* 스티키 모디파이어 Ctrl — 탭=래치(원샷), 길게=락(고정). 활성 시 ^문자 조합 노출. */}
            <Pressable
              onPress={() => { haptic.keyPress(); if (ctrlLocked) { setCtrlLocked(false); setCtrlLatched(false); } else setCtrlLatched((v) => !v); }}
              onLongPress={() => { haptic.holdOpen(); setCtrlLocked(true); setCtrlLatched(false); }}
              delayLongPress={280}
              hitSlop={3}
              style={{ minWidth: 44, height: 37, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 6, backgroundColor: (ctrlLatched || ctrlLocked) ? '#F0B4B1' : '#FFFFFF', elevation: 1 }}
            >
              <Text style={{ color: (ctrlLatched || ctrlLocked) ? '#7F1D1D' : '#2B2D31', fontSize: 13, fontWeight: '700' }}>{ctrlLocked ? 'Ctrl⇪' : 'Ctrl'}</Text>
            </Pressable>
            <AccessoryKey label="Tab" onPress={() => sendKey('\t')} />
            <AccessoryKey label="Esc" onPress={() => sendKey('\x1b')} />
            <AccessoryKey label="↑" onPress={() => sendKey('\x1b[A')} />
            <AccessoryKey label="↓" onPress={() => sendKey('\x1b[B')} />
            <AccessoryKey label="←" onPress={() => sendKey('\x1b[D')} />
            <AccessoryKey label="→" onPress={() => sendKey('\x1b[C')} />
            <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3 }} />
            {(ctrlLatched || ctrlLocked) && CTRL_LETTERS.map((l) => (
              <KeyButton key={'cl' + l} def={{ id: 'cl' + l, label: '^' + l.toUpperCase(), text: l }} fontSize={14} onCommit={() => sendTermChar(l)} />
            ))}
            {SPECIAL_CHARS.map((ch) => (
              <KeyButton
                key={'t' + ch}
                def={{ id: 't' + ch, label: ch, text: ch }}
                onCommit={(text) => sendTermChar(text)}
                onPopupOpen={setKeyPopup}
                onPopupMove={(i) => setKeyPopup((p) => (p ? { ...p, activeIndex: i } : p))}
                onPopupClose={() => setKeyPopup(null)}
              />
            ))}
          </ScrollView>
        </View>
      );
    }
    if (activePath && !isImagePath(activePath)) {
      return (
        <View style={{ backgroundColor: '#D2D7E1', flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ paddingLeft: 5, paddingVertical: 5 }}>
            <KbToggleKey active={kbMode === 'panel'} onPress={toggleKbPanel} />
          </View>
          <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3, alignSelf: 'center' }} />
          <ScrollView
            horizontal
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5 }}
          >
            {renderModChips()}
            {/* 자동완성 추천 선택용 ↑/↓/선택/✕ 는 모바일에서 팝업을 직접 터치·선택하는 게 더 쉬워 제거함. */}
            {/* 커서 이동은 실물키보드 특수키 패널(⌨︎)의 방향키가 담당 → 보조바에선 제거. */}
            <FadeView key={ctxKeyOf(editorCtx)} style={{ flexDirection: 'row', gap: 5 }}>
              {boostOrder(ctxKeyOf(editorCtx), keysFor(editorCtx)).map((def) => (
                <KeyButton
                  key={def.id}
                  def={def}
                  onCommit={(text, caret, d) => { editorRef.current?.insertText(text, caret); bumpKeyFreq(ctxKeyOf(editorCtx), d.id); }}
                  onPopupOpen={setKeyPopup}
                  onPopupMove={(i) => setKeyPopup((p) => (p ? { ...p, activeIndex: i } : p))}
                  onPopupClose={() => setKeyPopup(null)}
                />
              ))}
            </FadeView>
          </ScrollView>
        </View>
      );
    }
    return null;
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0A0D14' }}>
      {/* 상단바 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48, borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
        <Pressable onPress={() => onClose?.()} hitSlop={8} style={{ marginRight: 12 }}>
          <X width={22} height={22} fill="#fff" />
        </Pressable>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>모바일 <Text style={{ fontWeight: '800' }}>IDE</Text></Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TopBarButton active={showExplorer} onPress={() => setShowExplorer((v) => !v)}><SidebarIcon filled={showExplorer} /></TopBarButton>
          <TopBarButton active={showTerminal} onPress={() => { setShowTerminal((v) => !v); setTerminalExpanded(false); }}><TerminalIcon filled={showTerminal} /></TopBarButton>
          <TopBarButton
            active={showBrowser}
            onPress={() => {
              if (showBrowser) { setShowBrowser(false); return; }
              setShowBrowser(true);
              // 자동 실행 X — 빈 탭(스마트 런처)만 띄운다. dev 서버는 사용자가 카드/터미널로 "명시적으로" 시작.
              if (browserTabs.length === 0) addBrowserTab();
            }}
          ><BrowserIcon filled={showBrowser} /></TopBarButton>
          <TopBarButton active={showSettings} onPress={() => setShowSettings((v) => !v)}><ListIcon filled={showSettings} /></TopBarButton>
        </View>
      </View>

      {(loading || (!project && !error)) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#64748B', marginTop: 10 }}>프로젝트 불러오는 중…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#F87171', textAlign: 'center' }}>{error}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > fullHRef.current) fullHRef.current = h; }}
        >
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* 탐색기 */}
            {showExplorer && (
              <View style={{ width: 220, borderRightWidth: 1, borderRightColor: '#1C2230', backgroundColor: '#0A0D14' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 6, paddingVertical: 6 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, flex: 1 }}>탐색기</Text>
                  <Pressable onPress={() => { setNewEntryName(''); setNewEntry('file'); }} hitSlop={6} style={{ padding: 5 }}>
                    <FilePlus size={16} color="#94A3B8" />
                  </Pressable>
                  <Pressable onPress={() => { setNewEntryName(''); setNewEntry('folder'); }} hitSlop={6} style={{ padding: 5 }}>
                    <FolderPlus size={16} color="#94A3B8" />
                  </Pressable>
                  <Pressable onPress={importFiles} hitSlop={6} disabled={importing} style={{ padding: 5, opacity: importing ? 0.4 : 1 }}>
                    {importing ? <ActivityIndicator size="small" color="#94A3B8" /> : <DownloadSimple size={16} color="#94A3B8" />}
                  </Pressable>
                </View>
                <ScrollView>
                  <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 4 }}>▾ {projectName}</Text>
                  {renderTree(tree)}
                </ScrollView>
              </View>
            )}

            {/* 에디터 컬럼 */}
            <View style={{ flex: 1 }}>
              {/* 탭 바 — 길게 눌러 드래그하면 순서 변경(VSCode 처럼) */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#1C2230', backgroundColor: '#0A0D14' }}>
                <DraggableFlatList
                  data={openTabs}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(p) => p}
                  onDragEnd={({ data }) => setOpenTabs(data)}
                  activationDistance={12}
                  renderItem={({ item: p, drag, isActive: dragging }) => {
                    const active = p === activePath;
                    return (
                      <ScaleDecorator>
                        <Pressable
                          onPress={() => setActivePath(p)}
                          onLongPress={drag}
                          delayLongPress={180}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#1C2230', backgroundColor: dragging ? '#1B2230' : active ? '#11151F' : 'transparent', borderTopWidth: 2, borderTopColor: active ? '#3B82F6' : 'transparent', opacity: dragging ? 0.95 : 1 }}
                        >
                          <FileTypeIcon name={p} />
                          <Text style={{ color: active ? '#fff' : '#94A3B8', fontSize: 13 }}>{baseOf(p)}</Text>
                          <TabClose dirty={isDirty(p)} active={active} onPress={() => closeTab(p)} />
                        </Pressable>
                      </ScaleDecorator>
                    );
                  }}
                />
              </View>

              {/* breadcrumb + 줄바꿈 토글 */}
              {activePath && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700' }}>{projectName}</Text>
                  <Text style={{ color: '#475569', fontSize: 12 }}>›</Text>
                  <FileTypeIcon name={activePath} size={14} />
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>{baseOf(activePath)}</Text>
                </View>
              )}

              {/* 에디터 / 이미지 프리뷰 */}
              <View style={{ flex: 1, backgroundColor: '#0A0D14' }}>
                {activePath ? (
                  isImagePath(activePath) ? (
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}
                      maximumZoomScale={4}
                      minimumZoomScale={1}
                    >
                      {imgCache[activePath] === 'loading' || imgCache[activePath] === undefined ? (
                        <ActivityIndicator color="#fff" />
                      ) : imgCache[activePath] ? (
                        <Image
                          source={{ uri: imgCache[activePath] as string }}
                          style={{ width: '100%', height: 300 }}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={{ color: '#F87171', fontSize: 13 }}>이미지를 불러오지 못했습니다.</Text>
                      )}
                      <Text style={{ color: '#475569', fontSize: 12, marginTop: 10 }}>{baseOf(activePath)}</Text>
                    </ScrollView>
                  ) : (
                    <CodeEditorWebView
                      key={activePath}
                      ref={editorRef}
                      value={contents[activePath] ?? ''}
                      language={langOf(activePath)}
                      wrap={wrap}
                      lineNumbers={lineNumbers}
                      fontSize={fontSize}
                      onChange={setActiveContent}
                      onReady={onEditorReady}
                      onBreakpointToggle={(line) => toggleBreakpoint(activePath, line)}
                      onHintToggle={setHintOpen}
                      onContextChange={setEditorCtx}
                      onShortcut={(action) => { if (action === 'save') handleSave(); }}
                      onVmodConsume={modApi.consume}
                      onFocusChange={setInputFocused}
                    />
                  )
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#475569' }}>왼쪽 탐색기에서 파일을 여세요.</Text>
                  </View>
                )}
              </View>

              {/* 터미널/출력 패널 — 토글해도 언마운트하지 않고 숨김만(터미널 세션/내역/실행 중 프로세스 유지).
                  넓게 보기 시 에디터 컬럼 전체를 덮음(절대배치). */}
                <View style={[
                  { borderTopWidth: 1, borderTopColor: '#1C2230', backgroundColor: '#0A0D14' },
                  terminalExpanded
                    ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }
                    : { height: terminalHeight },
                  !showTerminal && ({ display: 'none' } as const),
                ]}>
                  {/* 위 테두리 드래그 핸들 — 위아래로 끌어 높이 조절(넓게 보기 모드 제외) */}
                  {!terminalExpanded && (
                    <View
                      {...termPanResponder.panHandlers}
                      style={{ height: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0D14' }}
                      hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                    >
                      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155' }} />
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
                    {/* 탭 — 가로 스크롤(4탭이 좁은 화면에서 안 잘리도록) */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="always"
                      style={{ flexShrink: 1 }}
                      contentContainerStyle={{ alignItems: 'center', gap: 16, paddingRight: 12 }}
                    >
                      {(['문제', '출력', '디버그', '터미널'] as const).map((t) => (
                        <Pressable key={t} onPress={() => { setBottomTab(t); setSpeedMenuOpen(false); }}>
                          <Text style={{ color: bottomTab === t ? '#fff' : '#64748B', fontSize: 13, fontWeight: bottomTab === t ? '700' : '400', borderBottomWidth: bottomTab === t ? 2 : 0, borderBottomColor: '#3B82F6', paddingBottom: 2 }}>{t}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {/* 우측 액션 */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 8 }}>
                      {/* VS Code 처럼 분리: 터미널 = 직접 명령 입력 실행(아래 입력창) · 디버그 = 디버그만 */}
                      {!debugActive && bottomTab === '디버그' && (
                        <Pressable onPress={runDebug} disabled={running || !activeIsDebuggable} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: (running || !activeIsDebuggable) ? 0.5 : 1 }}>
                          <PlayIcon size={13} color={activeIsDebuggable ? '#34D399' : '#64748B'} />
                          <Text style={{ color: activeIsDebuggable ? '#34D399' : '#64748B', fontSize: 13, fontWeight: '600' }}>{running ? '실행 중…' : '실행'}</Text>
                        </Pressable>
                      )}
                      {bottomTab !== '문제' && (
                        <Pressable onPress={() => (termActive ? clearTerminal() : setTermLines([]))} hitSlop={6}><Text style={{ color: '#64748B', fontSize: 12 }}>지우기</Text></Pressable>
                      )}
                      <Pressable onPress={() => setTerminalExpanded((v) => !v)} hitSlop={6}><FullscreenIcon size={16} color="#64748B" expanded={terminalExpanded} /></Pressable>
                      <Pressable onPress={() => { stopDebug(); setShowTerminal(false); setTerminalExpanded(false); }} hitSlop={6}><X width={14} height={14} fill="#64748B" /></Pressable>
                    </View>
                  </View>

                  {/* 멀티 터미널 탭 바 — tmux 윈도우 = 탭. 에디터 파일 탭과 동일한 스타일(상단 액센트·우측 구분선). */}
                  {termActive && termWindows.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1C2230', backgroundColor: '#0A0D14' }}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="always"
                        style={{ flexShrink: 1 }}
                        contentContainerStyle={{ alignItems: 'stretch' }}
                      >
                        {termWindows.map((w, i) => {
                          const isDev = w.name === 'dev';
                          // 라벨은 화면 위치(1,2,3…) 기준 — tmux 내부 index 는 닫기/생성에 따라 뒤죽박죽이라 노출 안 함.
                          const label = isDev ? 'dev 서버' : (w.name === 'shell' ? `셸 ${i + 1}` : w.name);
                          return (
                            <Pressable
                              key={w.index}
                              onPress={() => switchTerminal(w.index)}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                paddingHorizontal: 13, paddingVertical: 9,
                                borderRightWidth: 1, borderRightColor: '#1C2230',
                                backgroundColor: w.active ? '#11151F' : 'transparent',
                                borderLeftWidth: 2, borderLeftColor: w.active ? '#3B82F6' : 'transparent',
                              }}
                            >
                              <Text numberOfLines={1} style={{ color: w.active ? '#fff' : '#94A3B8', fontSize: 13, maxWidth: 130 }}>{label}</Text>
                              {termWindows.length > 1 && (
                                <Pressable onPress={() => closeTerminalTab(w.index)} hitSlop={8} style={{ marginLeft: 1 }}>
                                  <X width={12} height={12} fill={w.active ? '#fff' : '#64748B'} />
                                </Pressable>
                              )}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      <Pressable onPress={addTerminal} hitSlop={8} style={{ paddingHorizontal: 13, paddingVertical: 9 }}>
                        <Plus size={16} color="#94A3B8" weight="bold" />
                      </Pressable>
                    </View>
                  )}

                  {/* 디버그 컨트롤 바 — 디버그 콘솔 탭에서만. 재생/일시정지·스텝·정지 + 배속 드롭다운 */}
                  {debugActive && bottomTab === '디버그' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1C2230', backgroundColor: '#0E1320', gap: 18 }}>
                      <Pressable onPress={() => (debugPlaying ? pauseDebug() : playDebug())} disabled={debugDone} hitSlop={10} style={{ opacity: debugDone ? 0.35 : 1 }}>
                        {debugPlaying ? <PauseIcon size={20} color="#34D399" /> : <PlayIcon size={20} color="#34D399" />}
                      </Pressable>
                      <Pressable onPress={stepDebug} disabled={debugDone} hitSlop={10} style={{ opacity: debugDone ? 0.35 : 1 }}>
                        <StepIcon size={20} color="#CBD5E1" />
                      </Pressable>
                      {/* 정지 — 디버그 세션 종료(하이라이트 정리) */}
                      <Pressable onPress={stopDebug} hitSlop={10}>
                        <StopIcon size={18} color="#F87171" />
                      </Pressable>
                      <View style={{ flex: 1 }} />
                      {/* 배속 드롭다운 버튼 */}
                      <Pressable
                        onPress={() => setSpeedMenuOpen(true)}
                        hitSlop={6}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 7, paddingHorizontal: 11, paddingVertical: 5 }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{debugSpeed}×</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 9 }}>▼</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* 배속 선택 드롭다운(Modal — WebView 위로 안전하게 표시) */}
                  <Modal visible={speedMenuOpen} transparent animationType="fade" onRequestClose={() => setSpeedMenuOpen(false)}>
                    <Pressable style={{ flex: 1 }} onPress={() => setSpeedMenuOpen(false)}>
                      <View style={{ position: 'absolute', right: 16, bottom: 96, backgroundColor: '#1B1F2A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2F3A', paddingVertical: 6, minWidth: 130, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, elevation: 12 }}>
                        <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 6 }}>재생 배속</Text>
                        {DEBUG_SPEEDS.map((s) => (
                          <Pressable key={s} onPress={() => { setSpeed(s); setSpeedMenuOpen(false); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: debugSpeed === s ? '#22304A' : 'transparent' }}>
                            <Text style={{ color: debugSpeed === s ? '#60A5FA' : '#CBD5E1', fontSize: 14, fontWeight: debugSpeed === s ? '700' : '400' }}>{s}×</Text>
                            {debugSpeed === s && <Text style={{ color: '#60A5FA', fontSize: 13 }}>✓</Text>}
                          </Pressable>
                        ))}
                      </View>
                    </Pressable>
                  </Modal>

                  {/* 인터랙티브 PTY 터미널 — termWsUrl 생기면 항상 마운트 유지(보이기/숨기기만 → 세션·내역·실행 중 프로세스 보존). */}
                  <View style={{ flex: 1, display: termActive ? 'flex' : 'none' }}>
                      {termError ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                          <Text style={{ color: '#F87171', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{termError}</Text>
                          <Pressable onPress={() => { setTermError(null); setTermWsUrl(null); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A2F3A' }}>
                            <Text style={{ color: '#CBD5E1', fontSize: 13 }}>다시 시도</Text>
                          </Pressable>
                        </View>
                      ) : termWsUrl ? (
                        <>
                          <TerminalWebView ref={termRef} wsUrl={termWsUrl} onReady={() => setTermReady(true)} onCommand={onTerminalCommand} onVmodConsume={modApi.consume} onFocusChange={setInputFocused} />
                          {/* 로딩 오버레이 — xterm 로드+연결(onReady) 전까지 빈 검은 화면 대신 스피너 표시 */}
                          {!termReady && (
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0D14' }}>
                              <ActivityIndicator color="#34D399" />
                              <Text style={{ color: '#64748B', fontSize: 12, marginTop: 10 }}>터미널 불러오는 중…</Text>
                            </View>
                          )}
                        </>
                      ) : termActive ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator color="#34D399" />
                          <Text style={{ color: '#64748B', fontSize: 12, marginTop: 10 }}>터미널 불러오는 중…</Text>
                        </View>
                      ) : null}
                  </View>
                  {!termActive && (
                  <ScrollView
                    ref={termScrollRef}
                    style={{ flex: 1, paddingHorizontal: 12 }}
                    keyboardShouldPersistTaps="handled"
                    onScroll={onTermScroll}
                    scrollEventThrottle={32}
                    onContentSizeChange={() => { if (termStickRef.current) termScrollRef.current?.scrollToEnd({ animated: false }); }}
                  >
                    {(() => {
                      const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
                      const empty = (msg: string) => <Text style={{ color: '#475569', fontSize: 12, paddingVertical: 8 }}>{msg}</Text>;
                      // VS Code 정렬: 문제=에러(진단) · 출력=프로그램 stdout · 디버그 콘솔=디버그 세션.
                      if (bottomTab === '문제') {
                        const errs = termLines.filter((e) => e.stream === 'err');
                        return errs.length
                          ? errs.map((e, i) => <Text key={i} style={{ color: '#F87171', fontSize: 12, fontFamily: mono }}>{e.text}</Text>)
                          : empty('문제 없음');
                      }
                      if (bottomTab === '출력') {
                        const outs = termLines.filter((e) => e.stream === 'out');
                        return outs.length
                          ? outs.map((e, i) => <Text key={i} style={{ color: '#CBD5E1', fontSize: 12, fontFamily: mono }}>{e.text}</Text>)
                          : empty('출력 없음');
                      }
                      // 디버그 콘솔 = kind:debug
                      const shown = termLines.filter((e) => e.kind === 'debug');
                      if (!shown.length) return empty('디버그를 실행하면 여기에 표시됩니다.');
                      const lineColor = (e: TermLine) => (e.stream === 'err' ? '#F87171' : e.stream === 'cmd' ? '#94A3B8' : '#CBD5E1');
                      return shown.map((e, i) => <Text key={i} style={{ color: lineColor(e), fontSize: 12, fontFamily: mono }}>{e.text}</Text>);
                    })()}
                  </ScrollView>
                  )}

                </View>

            </View>
          </View>

          {/* 보조바가 아래 단일 절대배치 오버레이로 빠졌으므로, flow 상에서 그만큼(barH) 자리를 예약해
              에디터/터미널 하단이 바에 가리지 않게 한다(기존 인라인 바가 차지하던 공간 대체).
              ※ keyboardVisible 대신 inputFocused 기준 — 키보드 숨김(blur) 시 바가 키보드보다 먼저 사라지도록. */}
          {(inputFocused || kbMode === 'panel' || kbSwitching) && (activePath || termActive) && (
            <View style={{ height: barH }} />
          )}

          {/* 보조바 + 특수키 패널 — 단일 절대배치 마운트로 통일.
              바는 항상 같은 top(키보드가 있던 자리 상단)에 고정 → OS 키보드↔패널 전환 시 바가 재마운트/점프하지
              않고, 뒤에서 OS 키보드만 슬라이드로 내려가/올라오며 숨겨지고 나타난다.
              top = fullH - barH - keyboardHeight. Android adjustResize 에선 os모드(키보드 up)일 때 container 가
              (fullH - keyboardHeight)로 줄어 이 top 이 자동으로 "키보드 바로 위"가 되고, panel모드(키보드 down)엔
              패널 자리를 남긴 위치가 되어 동일 공식이 양쪽 모두 성립한다. */}
          {(inputFocused || kbMode === 'panel' || kbSwitching) && (activePath || termActive) && (
            <View style={{
              position: 'absolute', left: 0, right: 0,
              ...(kbMode === 'panel' || kbSwitching
                // 패널 모드/전환 중: top 고정(키보드 있던 자리 상단) + 바닥까지 채움 + 패널색 배경.
                //  → 패널이 제자리에 드러나고(안 흔들림), 아래 빈 공간/검정 번쩍임이 없다.
                ? { top: Math.max(0, (fullHRef.current || 700) - barH - keyboardHeight), bottom: 0, backgroundColor: '#C9CFDA' }
                // OS 모드: 바를 KAV 바닥(=키보드 위)에 붙인다. adjustResize 로 키보드가 오르내리면 바닥이 함께
                //  움직여 바가 키보드와 같이 슬라이드 → 키보드 숨김 시 바가 늦게 사라지지 않고 함께 내려간다.
                : { bottom: 0 }),
            }}>
              <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0 && Math.abs(h - barH) > 1) setBarH(h); }}>
                {renderBar()}
              </View>
              {kbMode === 'panel' && (
                <View style={{ flex: 1 }}>
                  <SpecialKeyPanel
                    height={keyboardHeight}
                    os={keyboardOS}
                    mods={modApi.mods}
                    onTapMod={modApi.tap}
                    onHoldMod={modApi.hold}
                    onKey={onPanelKey}
                  />
                </View>
              )}
            </View>
          )}
          {/* 롱프레스 대체키 팝업 오버레이 — 바 ScrollView 밖(형제)으로 띄워 클리핑 회피. Android elevation 필수. */}
          {keyPopup && (() => {
            const n = keyPopup.items.length;
            const popW = n * POPUP_CELL + 8;
            let left = keyPopup.x + keyPopup.width / 2 - POPUP_CELL / 2 - 4; // 0번(기본) 셀이 눌린 키 위에 오도록
            left = Math.max(4, Math.min(left, (winWidth || 400) - popW - 4));
            return (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 50, zIndex: 1000, elevation: 1000 }}>
                <FadeView dy={6}
                  style={{ position: 'absolute', left, flexDirection: 'row', backgroundColor: '#2A2F3A', borderRadius: 10, padding: 4,
                    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 14 }}
                >
                  {keyPopup.items.map((it, i) => (
                    <View key={it.id} style={{ width: POPUP_CELL, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 7,
                      backgroundColor: i === keyPopup.activeIndex ? '#094771' : 'transparent' }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{it.label}</Text>
                    </View>
                  ))}
                </FadeView>
              </View>
            );
          })()}
        </KeyboardAvoidingView>
      )}

      {/* 설정 드롭다운 */}
      {showSettings && (
        <>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setShowSettings(false)}
          />
          <View style={{
            position: 'absolute', top: 50, right: 10, width: 244,
            backgroundColor: '#1B1F2A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2F3A',
            paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
          }}>
            <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 }}>에디터 설정</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: '#E2E8F0', fontSize: 14 }}>자동 줄바꿈</Text>
              <Switch value={wrap} onValueChange={(v) => { haptic.keyTap(); setWrap(v); }}
                trackColor={{ true: '#3B82F6', false: '#3A3F4B' }} thumbColor="#fff" />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: '#E2E8F0', fontSize: 14 }}>줄 번호 표시</Text>
              <Switch value={lineNumbers} onValueChange={(v) => { haptic.keyTap(); setLineNumbers(v); }}
                trackColor={{ true: '#3B82F6', false: '#3A3F4B' }} thumbColor="#fff" />
            </View>

            <View style={{ height: 1, backgroundColor: '#2A2F3A', marginVertical: 4 }} />

            <Text style={{ color: '#94A3B8', fontSize: 13, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>글자 크기</Text>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
              {([['작게', 12], ['보통', 14], ['크게', 17]] as const).map(([label, size]) => {
                const active = fontSize === size;
                return (
                  <Pressable key={label} onPress={() => { haptic.keyTap(); setFontSize(size); }}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7,
                      backgroundColor: active ? '#15243F' : '#262B36',
                      borderWidth: 1, borderColor: active ? '#3B82F6' : 'transparent',
                    }}>
                    <Text style={{ color: active ? '#93C5FD' : '#94A3B8', fontSize: 13, fontWeight: active ? '700' : '400' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: '#2A2F3A', marginVertical: 4 }} />
            <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 }}>저장</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: '#E2E8F0', fontSize: 14 }}>자동 저장</Text>
              <Switch value={autoSaveEnabled} onValueChange={(v) => { haptic.keyTap(); setAutoSaveEnabled(v); }}
                trackColor={{ true: '#3B82F6', false: '#3A3F4B' }} thumbColor="#fff" />
            </View>
            {/* 자동 저장 OFF 일 때만 수동 저장 버튼 노출 */}
            {!autoSaveEnabled && (
              <Pressable
                onPress={() => { setShowSettings(false); handleSave(); }}
                disabled={saving}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 2, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: anyDirty ? '#15243F' : '#262B36', borderWidth: 1, borderColor: anyDirty ? '#3B82F6' : 'transparent' }}
              >
                {saving ? <ActivityIndicator size={15} color="#93C5FD" /> : <SaveIcon size={16} color={anyDirty ? '#93C5FD' : '#94A3B8'} />}
                <Text style={{ color: anyDirty ? '#93C5FD' : '#94A3B8', fontSize: 14, fontWeight: '600' }}>저장{anyDirty ? ' · 변경됨' : ''}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* 브라우저 패널 — 코드 에디터(파일 탭)와 완전히 별개.
          우측에서 슬라이드 등장해 헤더 아래 전체 영역을 채운다(터미널은 가려져 안 보임).
          토글 닫기는 언마운트하지 않고 화면 밖으로만 보냄 → 탭/WebView 상태 유지. 탭이 0개면 언마운트. */}
      {browserTabs.length > 0 && (
        <Animated.View
          pointerEvents={showBrowser ? 'auto' : 'none'}
          style={{ position: 'absolute', top: insets.top + 48, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', transform: [{ translateX: browserX }] }}
        >
          {/* 브라우저 탭 스트립 (+ 새 탭, 패널 닫기) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0D14', borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
              {browserTabs.map((tab) => {
                const active = tab.id === activeBrowserId;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveBrowserId(tab.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#1C2230', backgroundColor: active ? '#11151F' : 'transparent', borderTopWidth: 2, borderTopColor: active ? '#3B82F6' : 'transparent' }}
                  >
                    <BrowserIcon size={15} color={active ? '#fff' : '#94A3B8'} />
                    <Text numberOfLines={1} style={{ color: active ? '#fff' : '#94A3B8', fontSize: 13, maxWidth: 120 }}>{tab.title || '새 탭'}</Text>
                    <Pressable onPress={() => closeBrowserTab(tab.id)} hitSlop={8}><X width={12} height={12} fill={active ? '#fff' : '#64748B'} /></Pressable>
                  </Pressable>
                );
              })}
              <Pressable onPress={addBrowserTab} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                <Plus size={16} color="#94A3B8" />
              </Pressable>
            </ScrollView>
          </View>

          {/* 활성 탭: 검색창 + 컨트롤(뒤로/앞으로/새로고침 + 주소·검색) */}
          {activeBrowser && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6, backgroundColor: '#16181D', borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
              <Pressable onPress={() => previewWebRef.current?.goBack()} disabled={!canGoBack} hitSlop={6} style={{ opacity: canGoBack ? 1 : 0.35, padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>‹</Text>
              </Pressable>
              <Pressable onPress={() => previewWebRef.current?.goForward()} disabled={!canGoForward} hitSlop={6} style={{ opacity: canGoForward ? 1 : 0.35, padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>›</Text>
              </Pressable>
              <Pressable onPress={() => { if (activeBrowser.isPreview) openPreview(); else if (activeBrowser.url) previewWebRef.current?.reload(); }} hitSlop={6} style={{ padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 17 }}>↻</Text>
              </Pressable>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2F3A', borderRadius: 18, paddingHorizontal: 14, height: 34 }}>
                <TextInput
                  value={activeBrowser.address}
                  onChangeText={(v) => updateBrowserTab(activeBrowser.id, { address: v })}
                  onFocus={() => setAddressEditing(true)}
                  onBlur={() => setAddressEditing(false)}
                  onSubmitEditing={(e) => navigateTo(e.nativeEvent.text, activeBrowser.id)}
                  placeholder="주소 또는 검색"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  selectTextOnFocus
                  style={{ flex: 1, color: '#fff', fontSize: 13, padding: 0 }}
                  numberOfLines={1}
                />
              </View>
            </View>
          )}

          {/* 활성 탭 화면 */}
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {!activeBrowser ? null : activeBrowser.error ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0A0D14' }}>
                <Text style={{ color: '#F87171', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>페이지를 표시할 수 없습니다</Text>
                <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>{activeBrowser.error}</Text>
              </View>
            ) : activeBrowser.loading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>
            ) : !activeBrowser.url ? (
              <BrowserLauncher
                hasDevScript={hasDevScript}
                htmlEntry={htmlEntry}
                recentUrls={recentUrls}
                detectedPorts={detectedPorts}
                onDevPreview={openPreview}
                onStaticPreview={openStaticPreview}
                onOpenUrl={openUrlInActiveTab}
                onOpenPort={openPortPreview}
                onRefreshPorts={refreshPorts}
              />
            ) : (
              <WebView
                key={activeBrowser.id}
                ref={previewWebRef}
                source={{ uri: activeBrowser.url }}
                originWhitelist={['*']}
                mixedContentMode="always"
                javaScriptEnabled
                domStorageEnabled
                onNavigationStateChange={(s) => {
                  setCanGoBack(s.canGoBack);
                  setCanGoForward(s.canGoForward);
                  if (!addressEditing) updateBrowserTab(activeBrowser.id, { address: s.url, title: s.title || activeBrowser.title });
                  if (s.url && !s.loading) pushRecentUrl(s.url, s.title || '');
                }}
                // 미리보기 탭 에러: 포트=자동 재시도, 프로젝트=런처 복귀, 일반=메시지.
                onError={(e) => handlePreviewError(activeBrowser, `로드 오류: ${e.nativeEvent.description || ''} (code ${e.nativeEvent.code})`)}
                onHttpError={(e) => { const sc = e.nativeEvent.statusCode || 0; if (activeBrowser.isPort && sc > 0 && sc < 500) return; handlePreviewError(activeBrowser, `HTTP ${sc} — ${e.nativeEvent.url || ''}`); }}
                onLoadEnd={() => updateBrowserTab(activeBrowser.id, { loading: false })}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </Animated.View>
      )}

      {/* 저장 등 토스트 */}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 58, alignSelf: 'center', backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#334155' }}>
          <Text style={{ color: '#E2E8F0', fontSize: 13 }}>{toast}</Text>
        </View>
      ) : null}

      {/* 수정 승인 diff 모달 — 에이전트가 파일 변경 전 사용자 승인 대기 */}
      <PermissionDiffModal
        pending={pendingPermission}
        onApprove={() => respondPermission('allow')}
        onReject={() => respondPermission('deny')}
      />

      {/* 미저장 탭 닫기 확인 (자동 저장 OFF 일 때) — VS Code 식 */}
      <Modal visible={!!closingTab} transparent animationType="fade" onRequestClose={() => confirmCloseDirty('cancel')}>
        <Pressable onPress={() => confirmCloseDirty('cancel')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Pressable onPress={() => {}} style={{ width: '84%', maxWidth: 360, backgroundColor: '#0E121B', borderRadius: 14, borderWidth: 1, borderColor: '#1C2230', padding: 18 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>저장하지 않은 변경사항</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              <Text style={{ color: '#E2E8F0' }}>{closingTab ? baseOf(closingTab) : ''}</Text> 의 변경사항을 저장할까요? 저장하지 않으면 변경 내용이 사라집니다.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              <Pressable onPress={() => confirmCloseDirty('discard')} style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#3A2030', backgroundColor: '#1A1014', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#F87171', fontSize: 13.5, fontWeight: '600' }}>저장 안 함</Text>
              </Pressable>
              <Pressable onPress={() => confirmCloseDirty('cancel')} style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#2A2F3A', backgroundColor: '#1B1F2A', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: '600' }}>취소</Text>
              </Pressable>
              <Pressable onPress={() => confirmCloseDirty('save')} style={{ flex: 1.2, height: 44, borderRadius: 10, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>저장</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 새 파일/폴더 이름 입력 */}
      <Modal visible={!!newEntry} transparent animationType="fade" onRequestClose={() => setNewEntry(null)}>
        <Pressable onPress={() => setNewEntry(null)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Pressable onPress={() => {}} style={{ width: '84%', maxWidth: 360, backgroundColor: '#0E121B', borderRadius: 14, borderWidth: 1, borderColor: '#1C2230', padding: 18 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 }}>{newEntry === 'folder' ? '새 폴더' : '새 파일'}</Text>
            <TextInput
              value={newEntryName}
              onChangeText={setNewEntryName}
              autoFocus
              placeholder={newEntry === 'folder' ? '폴더 이름 (예: components)' : '파일 이름 (예: index.html)'}
              placeholderTextColor="#475569"
              autoCapitalize="none"
              onSubmitEditing={createEntry}
              style={{ height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A2F3A', backgroundColor: '#11151F', color: '#fff', fontSize: 14 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Pressable onPress={() => setNewEntry(null)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#2A2F3A', backgroundColor: '#1B1F2A', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#CBD5E1', fontSize: 13.5, fontWeight: '600' }}>취소</Text>
              </Pressable>
              <Pressable onPress={createEntry} style={{ height: 40, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>만들기</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}


// ── 브라우저 빈 탭 스마트 런처 ──
// 개인 세션 샌드박스라 URL 직접 입력이 어려워, 개발 상황을 감지해 한 번 탭으로 미리보기를 연다.
interface BrowserLauncherProps {
  hasDevScript: boolean;
  htmlEntry: string | null;
  recentUrls: { url: string; title: string; ts: number }[];
  detectedPorts: number[];
  onDevPreview: () => void;
  onStaticPreview: () => void;
  onOpenUrl: (url: string) => void;
  onOpenPort: (port: number) => void;
  onRefreshPorts: () => void;
}
// 런처 액션 행 — 앱 공용 OptionRow 와 동일한 디자인 언어(v2 토큰 + PressableScale).
const LauncherRow = ({ Icon, iconColor, title, subtitle, onPress }: {
  Icon: React.ComponentType<{ size?: number; color?: string; weight?: any }>;
  iconColor?: string; title: string; subtitle?: string; onPress: () => void;
}) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.98}
    dim={0.08}
    android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
    style={{
      flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingVertical: 13, paddingHorizontal: 14, borderRadius: 11,
      borderWidth: 1, backgroundColor: v2Colors.elevated, borderColor: v2Colors.border,
    }}
  >
    <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: v2Colors.elevated2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={18} color={iconColor || v2Colors.text3} weight="regular" />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontFamily: v2Font.sans, fontSize: 14, fontWeight: v2Font.weight.semibold, color: v2Colors.text, letterSpacing: -0.14 }}>{title}</Text>
      {subtitle ? <Text numberOfLines={1} style={{ fontFamily: v2Font.sans, fontSize: 11.5, color: v2Colors.textDim, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
    <CaretRight size={16} color={v2Colors.text3} weight="bold" />
  </PressableScale>
);
const LauncherSection = ({ title }: { title: string }) => (
  <Text style={{ fontFamily: v2Font.sans, fontSize: 11, fontWeight: v2Font.weight.semibold, color: v2Colors.textDim, letterSpacing: 0.3, marginBottom: 9 }}>{title}</Text>
);
const BrowserLauncher = ({ hasDevScript, htmlEntry, recentUrls, detectedPorts, onDevPreview, onStaticPreview, onOpenUrl, onOpenPort, onRefreshPorts }: BrowserLauncherProps) => {
  // 미리보기 카드는 항상 노출 — dev/static 판단은 백엔드(startDevPreview)가 한다.
  // (워크스페이스 파일은 샌드박스 fs 에 있어 클라이언트 project.files 로는 감지 못 할 수 있음)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: v2Colors.base }}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled"
    >
      <LauncherSection title="미리보기" />
      <View style={{ gap: 8 }}>
        <LauncherRow
          Icon={Play}
          iconColor={v2Colors.accent}
          title="개발 서버 미리보기"
          subtitle={hasDevScript ? 'npm run dev 실행 결과 (자동 설정)' : 'dev 서버가 있으면 실행, 없으면 정적으로'}
          onPress={onDevPreview}
        />
        <LauncherRow
          Icon={Globe}
          title="정적 미리보기"
          subtitle={htmlEntry || 'index.html 등 정적 파일 보기'}
          onPress={onStaticPreview}
        />
      </View>

      {/* 실행 중인 포트 — 터미널에서 직접 띄운 서버(front/back dev 등)까지 감지해 바로 미리보기로 연결. */}
      {detectedPorts.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <Text style={{ fontFamily: v2Font.sans, fontSize: 11, fontWeight: v2Font.weight.semibold, color: v2Colors.textDim, letterSpacing: 0.3 }}>실행 중인 포트</Text>
            <Pressable onPress={onRefreshPorts} hitSlop={8}><Text style={{ fontFamily: v2Font.sans, fontSize: 11.5, color: v2Colors.accent, fontWeight: v2Font.weight.semibold }}>새로고침</Text></Pressable>
          </View>
          <View style={{ gap: 8 }}>
            {detectedPorts.map((p) => (
              <LauncherRow
                key={p}
                Icon={Play}
                iconColor={v2Colors.accent}
                title={`localhost:${p}`}
                subtitle="이 포트에서 실행 중인 서버 미리보기"
                onPress={() => onOpenPort(p)}
              />
            ))}
          </View>
        </View>
      )}

      {recentUrls.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <LauncherSection title="최근 방문" />
          <View style={{ gap: 8 }}>
            {recentUrls.map((r) => (
              <LauncherRow
                key={r.url}
                Icon={ClockCounterClockwise}
                title={r.title || r.url}
                subtitle={r.url}
                onPress={() => onOpenUrl(r.url)}
              />
            ))}
          </View>
        </View>
      )}

      <Text style={{ fontFamily: v2Font.sans, fontSize: 12, color: v2Colors.textDim, textAlign: 'center', marginTop: 22, lineHeight: 18 }}>
        또는 위 주소창에 URL 을 직접 입력할 수 있어요.
      </Text>
    </ScrollView>
  );
};


// ── 수정 승인 diff 모달 ──
type DiffLine = { kind: 'ctx' | 'del' | 'add'; text: string };

// 공통 prefix/suffix 를 잘라낸 컴팩트 라인 diff (앞뒤 2줄 컨텍스트)
const lineDiff = (oldStr: string, newStr: string): DiffLine[] => {
  const a = (oldStr || '').split('\n');
  const b = (newStr || '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const out: DiffLine[] = [];
  for (let i = Math.max(0, start - 2); i < start; i++) out.push({ kind: 'ctx', text: a[i] });
  for (let i = start; i < endA; i++) out.push({ kind: 'del', text: a[i] });
  for (let i = start; i < endB; i++) out.push({ kind: 'add', text: b[i] });
  for (let i = endA; i < Math.min(a.length, endA + 2); i++) out.push({ kind: 'ctx', text: a[i] });
  return out;
};

const diffToLines = (diff: AgentDiff): DiffLine[] => {
  if (!diff) return [];
  if (diff.kind === 'edit') return lineDiff(diff.oldString, diff.newString);
  if (diff.kind === 'write') return lineDiff(diff.oldContent, diff.newContent);
  if (diff.kind === 'multiedit') {
    const out: DiffLine[] = [];
    diff.edits.forEach((e, i) => {
      if (i > 0) out.push({ kind: 'ctx', text: '⋯' });
      out.push(...lineDiff(e.oldString, e.newString));
    });
    return out;
  }
  return [];
};

interface PermissionDiffModalProps {
  pending: null | { requestId: string; tool: string; relPath?: string; diff: AgentDiff };
  onApprove: () => void;
  onReject: () => void;
}

const DIFF_LINE_CAP = 400;

const PermissionDiffModal = ({ pending, onApprove, onReject }: PermissionDiffModalProps) => {
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const isNewFile = pending?.diff?.kind === 'write' && !pending.diff.oldContent;
  const title = isNewFile ? '새 파일 생성' : pending?.tool === 'Write' ? '파일 덮어쓰기' : '파일 수정';
  const allLines = pending ? diffToLines(pending.diff) : [];
  const lines = allLines.slice(0, DIFF_LINE_CAP);
  const truncated = allLines.length - lines.length;

  return (
    <Modal visible={!!pending} transparent animationType="slide" onRequestClose={onReject}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <View style={{ backgroundColor: '#0E121B', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '82%', borderTopWidth: 1, borderColor: '#1C2230' }}>
          {/* 헤더 */}
          <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{title}</Text>
            {pending?.relPath ? (
              <Text style={{ color: '#93C5FD', fontSize: 12.5, fontFamily: mono, marginTop: 6 }} numberOfLines={1}>{pending.relPath}</Text>
            ) : null}
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 6 }}>에이전트가 이 변경을 적용하려고 합니다. 검토 후 승인하세요.</Text>
          </View>

          {/* diff 본문 */}
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingVertical: 6 }}>
            {lines.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 13, padding: 18 }}>표시할 변경 내용이 없습니다.</Text>
            ) : (
              lines.map((ln, i) => {
                const bg = ln.kind === 'del' ? 'rgba(248,81,73,0.13)' : ln.kind === 'add' ? 'rgba(52,211,153,0.13)' : 'transparent';
                const color = ln.kind === 'del' ? '#FCA5A5' : ln.kind === 'add' ? '#6EE7B7' : '#64748B';
                const sign = ln.kind === 'del' ? '-' : ln.kind === 'add' ? '+' : ' ';
                return (
                  <View key={i} style={{ flexDirection: 'row', backgroundColor: bg, paddingHorizontal: 14 }}>
                    <Text style={{ color, fontFamily: mono, fontSize: 12, width: 14 }}>{sign}</Text>
                    <Text style={{ color, fontFamily: mono, fontSize: 12, flex: 1 }}>{ln.text}</Text>
                  </View>
                );
              })
            )}
            {truncated > 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12, padding: 14 }}>… 외 {truncated}줄 (생략됨)</Text>
            ) : null}
          </ScrollView>

          {/* 액션 */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#1C2230' }}>
            <Pressable
              onPress={onReject}
              style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#3A2030', backgroundColor: '#1A1014', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#F87171', fontSize: 15, fontWeight: '600' }}>거부</Text>
            </Pressable>
            <Pressable
              onPress={onApprove}
              style={{ flex: 1.4, height: 46, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>승인</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
