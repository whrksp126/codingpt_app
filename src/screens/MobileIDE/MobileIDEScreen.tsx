import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Keyboard, Image, Switch,
  PanResponder, useWindowDimensions, Modal, Animated,
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
import { haptic } from '../../animations/haptics';
import {
  createInlinePreview, buildPreviewUrl, runCode,
  debuggableLanguage, runCommandText, getIdeAsset, saveIdeProject,
  startDevPreview, buildDevPreviewUrl, stopDevPreview,
  streamSandboxExec, isDevServerCommand,
} from '../../services/ideService';
import { AgentDiff, writeAgentFile } from '../../services/agentService';
import { useAgentSession } from '../../contexts/AgentSessionContext';
import { useIdeProject } from '../../contexts/IdeProjectContext';
import sessionService from '../../services/sessionService';
import { pickAnyFiles } from '../../services/attachmentPicker';
import { FilePlus, FolderPlus, DownloadSimple, Plus } from 'phosphor-react-native';

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
};

const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();
const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);
// 미리보기 대상 이미지(편집 불가). svg 는 텍스트로 편집하므로 제외.
const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p);

// 새 파일 확장자 → 에디터 언어(하이라이팅). 미지정은 plaintext.
const LANG_BY_EXT: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript', json: 'json', py: 'python', java: 'java',
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

const SpecialKey = ({ ch, onInsert }: { ch: string; onInsert: (c: string) => void }) => {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); haptic.keyPress(); }}
      onPressOut={() => setDown(false)}
      onPress={() => onInsert(ch)}
      hitSlop={3}
      style={{
        minWidth: 33, height: 37, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 7, borderRadius: 6,
        backgroundColor: down ? '#AAB2C2' : '#FFFFFF',
        elevation: 1,
      }}
    >
      <Text style={{ color: '#2B2D31', fontSize: 17, fontWeight: '600' }}>{ch}</Text>
    </Pressable>
  );
};

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
    openSession,
    newSession,
    activeWorkspace,
    activeSessionId,
  } = useAgentSession();
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
  const [cmdInput, setCmdInput] = useState(''); // 터미널 명령 입력
  const [running, setRunning] = useState(false);
  const [termCwd, setTermCwd] = useState<string | null>(null); // 샌드박스 터미널 현재 경로(cd 추적)
  const [termFocused, setTermFocused] = useState(false);       // 터미널 입력 포커스 여부(키보드 위 컨트롤 바 표시용)
  const execAbortRef = useRef<null | (() => void)>(null);      // 실행 중 명령 중지 핸들
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
  const closeBrowserTab = useCallback((id: string) => {
    if (id === 'preview') { previewGenRef.current++; stopDevPreview(projectId).catch(() => { /* idle TTL 백업 */ }); }
    setBrowserTabs((ts) => {
      const idx = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      setActiveBrowserId((cur) => (cur === id ? (next[idx]?.id || next[idx - 1]?.id || null) : cur));
      if (next.length === 0) setShowBrowser(false);
      return next;
    });
  }, [projectId]);

  // 패널 노출 시 우측에서 슬라이드 인(좌측 탐색기처럼 하단 영역 전체 차지)
  useEffect(() => {
    if (showBrowser) {
      browserX.setValue(winWidth || 400);
      Animated.timing(browserX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  }, [showBrowser, winWidth, browserX]);

  // 활성 브라우저 탭 전환 시 이전 탭의 nav 상태가 남지 않도록 초기화(새 탭의 onNavigationStateChange 가 갱신)
  useEffect(() => { setCanGoBack(false); setCanGoForward(false); }, [activeBrowserId]);

  // 키보드 표시 여부(특수문자 바 노출 제어) + 이미지 프리뷰 data URL 캐시
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // imgCache[path]: undefined=미로드, 'loading', string=dataUrl, null=실패
  const [imgCache, setImgCache] = useState<Record<string, string | null | 'loading'>>({});

  const editorRef = useRef<CodeEditorHandle>(null);

  // 설정 영속화: 로드 완료 전엔 저장하지 않도록 가드(초기 기본값으로 덮어쓰기 방지).
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { s.remove(); h.remove(); };
  }, []);

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
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);

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

  // 컨텍스트 raw 이벤트 구독 → 터미널 출력(Bash) 만 처리. 파일 동기화는 컨텍스트가 담당.
  useEffect(() => {
    const off = registerEventListener((evt) => {
      if (evt.type === 'tool_use') {
        // Bash → 실제 IDE 터미널에도 명령을 찍어 "모바일에서 실행되는" 느낌을 준다
        if (evt.tool === 'Bash' && evt.input?.command) {
          ideToolCmdRef.current[evt.toolUseId] = evt.input.command;
          addTerm('cmd', 'run', `$ ${evt.input.command}`);
          setBottomTab('터미널');
          setShowTerminal(true);
        }
      } else if (evt.type === 'tool_result') {
        // Bash 결과 → 터미널에 출력(성공=out, 실패=err)
        if (ideToolCmdRef.current[evt.toolUseId] != null && evt.content) {
          addTerm(evt.ok ? 'out' : 'err', 'run', evt.content);
        }
      }
    });
    return off;
  }, [registerEventListener, addTerm, subscribeFileChange]);

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

  // ── 터미널 명령 입력 실행 ──
  // 현재 단계: 입력 명령에서 "알려진 파일"을 찾아 그 파일을 실행(예: python index.py, node app.js).
  //   (임의 셸 명령은 가상환경 도입 시 확장 — 설계 메모 참고)
  // openPreview 는 아래에서 정의되므로 ref 로 우회(렌더 시점 TDZ 회피).
  const openPreviewRef = useRef<null | (() => void)>(null);
  const cmdInputRef = useRef<TextInput>(null);          // 인라인 프롬프트 입력(컨트롤 바에서 포커스/조작)
  const [cmdHistory, setCmdHistory] = useState<string[]>([]); // 명령 히스토리(↑↓)
  const histIdxRef = useRef(-1);                         // -1=현재 입력, 그 외=히스토리 탐색 위치

  // 실행 중 명령 중지(^C) — XHR 끊김 → 백엔드가 프로세스 그룹 SIGINT/SIGKILL.
  const stopExec = useCallback(() => {
    try { execAbortRef.current?.(); } catch (_) { /* noop */ }
    execAbortRef.current = null;
    setRunning(false);
    addTerm('err', 'run', '^C');
  }, [addTerm]);

  // 컨트롤 바: Ctrl+C(실행 중=중지 / 입력 중=줄 비우기), 히스토리 ↑↓
  const ctrlC = useCallback(() => {
    if (running) stopExec();
    else { setCmdInput(''); histIdxRef.current = -1; addTerm('cmd', 'run', '^C'); }
  }, [running, stopExec, addTerm]);
  const histPrev = useCallback(() => {
    setCmdHistory((h) => {
      if (h.length === 0) return h;
      const cur = histIdxRef.current === -1 ? h.length : histIdxRef.current;
      const idx = Math.max(0, cur - 1);
      histIdxRef.current = idx;
      setCmdInput(h[idx]);
      return h;
    });
  }, []);
  const histNext = useCallback(() => {
    setCmdHistory((h) => {
      if (histIdxRef.current === -1) return h;
      const idx = histIdxRef.current + 1;
      if (idx >= h.length) { histIdxRef.current = -1; setCmdInput(''); }
      else { histIdxRef.current = idx; setCmdInput(h[idx]); }
      return h;
    });
  }, []);

  // 샌드박스 실셸: 임의 명령을 실행하고 출력을 스트리밍. cd 는 cwd 를 갱신, dev 명령은 미리보기로 라우팅.
  const runTerminalCommand = useCallback((raw: string) => {
    const cmd = raw.trim();
    if (!cmd || running) return;
    addTerm('cmd', 'run', `$ ${cmd}`);
    setCmdInput('');
    setCmdHistory((h) => (h[h.length - 1] === cmd ? h : [...h, cmd])); // 연속 중복은 제외
    histIdxRef.current = -1;

    // npm run dev / vite 등 → 프록시된 미리보기로 라우팅(폰에서 localhost:5173 직접 접근 불가)
    if (isDevServerCommand(cmd)) {
      addTerm('out', 'run', '▶ dev 서버를 시작하고 미리보기를 엽니다…');
      openPreviewRef.current?.();
      return;
    }

    setRunning(true);
    streamSandboxExec(
      { command: cmd, cwd: termCwd || undefined, projectId },
      (evt) => {
        if (evt.type === 'output') addTerm('out', 'run', evt.data);
        else if (evt.type === 'cwd') setTermCwd(evt.cwd);
        else if (evt.type === 'error') addTerm('err', 'run', evt.message);
        else if (evt.type === 'done' && evt.timedOut) addTerm('err', 'run', '⏱️ 시간 초과로 중단되었습니다(긴 작업은 미리보기/에이전트로).');
      },
      (err) => { addTerm('err', 'run', err); setRunning(false); execAbortRef.current = null; },
      () => { setRunning(false); execAbortRef.current = null; },
    ).then((abort) => { execAbortRef.current = abort; }).catch(() => { setRunning(false); });
  }, [running, addTerm, termCwd, projectId]);

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
    const id = 'preview';
    const gen = ++previewGenRef.current; // 이 호출 세대 — 재호출 시 이전 폴링 무효화
    setShowBrowser(true);
    setBrowserTabs((ts) => {
      const base: BrowserTab = { id, title: '미리보기', url: null, address: '', loading: true, error: null, isPreview: true };
      return ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? { ...t, loading: true, url: null, error: null } : t)) : [...ts, base];
    });
    setActiveBrowserId(id);

    const loadStatic = async () => {
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
  }, [projectId, entryFile, filesPayload, updateBrowserTab]);

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
              if (browserTabs.length === 0) openPreview();
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                      language={(project?.files.find((f) => f.path === activePath)?.language) || extOf(activePath)}
                      wrap={wrap}
                      lineNumbers={lineNumbers}
                      fontSize={fontSize}
                      onChange={setActiveContent}
                      onReady={onEditorReady}
                      onBreakpointToggle={(line) => toggleBreakpoint(activePath, line)}
                    />
                  )
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#475569' }}>왼쪽 탐색기에서 파일을 여세요.</Text>
                  </View>
                )}
              </View>

              {/* 터미널/출력 패널 — 넓게 보기 시 에디터 컬럼 전체를 덮음(절대배치) */}
              {showTerminal && (
                <View style={[
                  { borderTopWidth: 1, borderTopColor: '#1C2230', backgroundColor: '#0A0D14' },
                  terminalExpanded
                    ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }
                    : { height: terminalHeight },
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
                        <Pressable onPress={() => setTermLines([])} hitSlop={6}><Text style={{ color: '#64748B', fontSize: 12 }}>지우기</Text></Pressable>
                      )}
                      <Pressable onPress={() => setTerminalExpanded((v) => !v)} hitSlop={6}><FullscreenIcon size={16} color="#64748B" expanded={terminalExpanded} /></Pressable>
                      <Pressable onPress={() => { stopDebug(); setShowTerminal(false); setTerminalExpanded(false); }} hitSlop={6}><X width={14} height={14} fill="#64748B" /></Pressable>
                    </View>
                  </View>

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
                      const lineColor = (e: TermLine) => (e.stream === 'err' ? '#F87171' : e.stream === 'cmd' ? '#94A3B8' : '#CBD5E1');
                      // VS Code 정렬:
                      //  문제=에러(진단) · 출력=프로그램 stdout · 디버그 콘솔=디버그 세션 · 터미널=일반 실행
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
                      // 디버그 콘솔 = kind:debug, 터미널 = kind:run
                      const wantKind = bottomTab === '디버그' ? 'debug' : 'run';
                      const shown = termLines.filter((e) => e.kind === wantKind);
                      if (bottomTab === '디버그' && !shown.length) return empty('디버그를 실행하면 여기에 표시됩니다.');
                      // 실제 터미널처럼: 명령 줄($ 로 시작)은 컬러 프롬프트(user@host:path$)로 렌더
                      // 경로는 샌드박스 cwd 를 프로젝트 루트 기준 상대로 표시(cd 추적 반영)
                      const cwdDisp = (() => {
                        if (!termCwd) return `~/${projectName}`;
                        const m = `/${projectId}`;
                        const i = termCwd.indexOf(m);
                        return `~/${projectName}${i >= 0 ? termCwd.slice(i + m.length) : ''}`;
                      })();
                      const promptSpans = () => [
                        <Text key="u" style={{ color: '#34D399' }}>user@CodingPT</Text>,
                        <Text key="c" style={{ color: '#64748B' }}>:</Text>,
                        <Text key="p" style={{ color: '#60A5FA' }}>{cwdDisp}</Text>,
                        <Text key="d" style={{ color: '#34D399' }}>$ </Text>,
                      ];
                      return (
                        <>
                          {shown.map((e, i) => {
                            if (e.stream === 'cmd' && e.text.startsWith('$ ')) {
                              return (
                                <Text key={i} style={{ fontSize: 12, fontFamily: mono, paddingVertical: 1 }}>
                                  {promptSpans()}
                                  <Text style={{ color: '#E2E8F0' }}>{e.text.slice(2)}</Text>
                                </Text>
                              );
                            }
                            return <Text key={i} style={{ color: lineColor(e), fontSize: 12, fontFamily: mono }}>{e.text}</Text>;
                          })}
                          {/* 라이브 프롬프트 — 출력 스트림의 마지막 줄에 커서/입력이 인라인으로(실제 터미널).
                              실행 중에도 마운트 유지(포커스/키보드 유지 → 키보드 위 Ctrl+C 도달 가능). */}
                          {bottomTab === '터미널' && (
                            <Pressable onPress={() => cmdInputRef.current?.focus()} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 1, paddingBottom: 6 }}>
                              {running
                                ? <Text style={{ fontSize: 12, fontFamily: mono, color: '#64748B' }}>● 실행 중… </Text>
                                : <Text style={{ fontSize: 12, fontFamily: mono }}>{promptSpans()}</Text>}
                              <TextInput
                                ref={cmdInputRef}
                                value={cmdInput}
                                onChangeText={setCmdInput}
                                onSubmitEditing={() => runTerminalCommand(cmdInput)}
                                onFocus={() => { setTermFocused(true); termStickRef.current = true; setTimeout(() => termScrollRef.current?.scrollToEnd({ animated: false }), 60); }}
                                onBlur={() => setTermFocused(false)}
                                autoFocus={false}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="off"
                                spellCheck={false}
                                returnKeyType="go"
                                blurOnSubmit={false}
                                style={{ flex: 1, color: '#E2E8F0', fontSize: 12, fontFamily: mono, padding: 0, minHeight: 18 }}
                              />
                            </Pressable>
                          )}
                        </>
                      );
                    })()}
                  </ScrollView>

                </View>
              )}

            </View>
          </View>

          {/* 특수문자 키보드 액세서리(에디터용) — 키보드 위 전체 폭. 터미널 포커스 중엔 숨김(터미널 바로 교체). */}
          {activePath && !isImagePath(activePath) && keyboardVisible && !termFocused && (
            <View style={{ backgroundColor: '#D2D7E1' }}>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5 }}
              >
                {SPECIAL_CHARS.map((ch) => (
                  <SpecialKey key={ch} ch={ch} onInsert={(c) => editorRef.current?.insertText(c)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* 터미널 키보드 액세서리 — 터미널 입력 포커스 시 키보드 위에. 컨트롤 키(Ctrl+C·↑·↓) + 특수문자(터미널 입력에 삽입).
              스타일은 특수문자 키패드와 동일(흰 키/밝은 바). */}
          {termFocused && keyboardVisible && (
            <View style={{ backgroundColor: '#D2D7E1' }}>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5, alignItems: 'center' }}
              >
                <AccessoryKey label="Ctrl+C" onPress={ctrlC} active={running} />
                <AccessoryKey label="↑" onPress={histPrev} />
                <AccessoryKey label="↓" onPress={histNext} />
                <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3 }} />
                {SPECIAL_CHARS.map((ch) => (
                  <SpecialKey key={ch} ch={ch} onInsert={(c) => setCmdInput((v) => v + c)} />
                ))}
              </ScrollView>
            </View>
          )}
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
          우측에서 슬라이드 등장해 헤더 아래 전체 영역을 채운다(터미널은 가려져 안 보임). */}
      {showBrowser && (
        <Animated.View style={{ position: 'absolute', top: insets.top + 48, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', transform: [{ translateX: browserX }] }}>
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
                {activeBrowser.isPreview && (
                  <Pressable onPress={openPreview} style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1F2430' }}>
                    <Text style={{ color: '#93C5FD', fontSize: 13 }}>미리보기 다시 열기</Text>
                  </Pressable>
                )}
              </View>
            ) : activeBrowser.loading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>
            ) : !activeBrowser.url ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>주소창에 URL 을 입력하거나 검색하세요.</Text>
              </View>
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
                }}
                onError={(e) => updateBrowserTab(activeBrowser.id, { error: `로드 오류: ${e.nativeEvent.description || ''} (code ${e.nativeEvent.code})`, loading: false })}
                onHttpError={(e) => updateBrowserTab(activeBrowser.id, { error: `HTTP ${e.nativeEvent.statusCode} — ${e.nativeEvent.url || ''}`, loading: false })}
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
