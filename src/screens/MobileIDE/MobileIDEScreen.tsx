import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Keyboard, Image, Switch,
  PanResponder, useWindowDimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X } from '../../assets/SvgIcon';
import {
  SidebarIcon, TerminalIcon, PanelRightIcon, BrowserIcon, SparkleIcon, ListIcon, FullscreenIcon,
  PlayIcon, PauseIcon, StepIcon, StopIcon, BugIcon,
} from '../../components/module/ide/ideIcons';

// 디버그 재생 배속 (촘촘: 매우 느림 ~ 매우 빠름)
const DEBUG_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
import { FileTypeIcon } from '../../components/module/ide/fileTypeIcons';
import CodeEditorWebView, { CodeEditorHandle } from '../../components/module/ide/CodeEditorWebView';
import { haptic } from '../../animations/haptics';
import {
  getIdeProject, createInlinePreview, buildPreviewUrl, runCode, runnableLanguage,
  debuggableLanguage, runCommandText, getIdeAsset, IdeProject,
} from '../../services/ideService';
import { streamAgentQuery, getAgentFile, AgentEvent } from '../../services/agentService';

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

const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();
const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);
// 미리보기 대상 이미지(편집 불가). svg 는 텍스트로 편집하므로 제외.
const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p);

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

export default function MobileIDEScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { ide, lessonId } = route.params || {};
  const projectId: string = ide?.projectId;
  const projectName: string = ide?.projectName || '작업영역';
  const entryFile: string | undefined = ide?.entryFile;
  // 관리자가 소스 모달에서 저장한 "보기 상태" — 열어둘 탭(순서)/활성 탭/파일별 하이라이트 구간.
  const initialTabs: string[] | undefined = ide?.initialTabs;
  const savedActiveTab: string | undefined = ide?.activeTab;
  const savedHighlights: Record<string, Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>> = ide?.highlights || {};

  const [project, setProject] = useState<IdeProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contents, setContents] = useState<Record<string, string>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  const [showExplorer, setShowExplorer] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(false); // 터미널 넓게 보기(에디터 덮기) 토글
  const [showAgent, setShowAgent] = useState(false);

  // ── 바이브코딩 에이전트 ──
  const [agentMessages, setAgentMessages] = useState<AgentMsg[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSelection, setAgentSelection] = useState<{ file: string; startLine: number; endLine: number } | null>(null);
  const agentSessionRef = useRef<string | null>(null);     // resume 용 세션 id
  const agentAbortRef = useRef<null | (() => void)>(null);  // 진행 중 스트림 중단
  const agentToolIndexRef = useRef<Record<string, number>>({}); // toolUseId → 메시지 index
  const agentToolRelRef = useRef<Record<string, string | undefined>>({}); // toolUseId → 워크스페이스 상대경로
  const selectionRef = useRef<{ file: string; startLine: number; endLine: number; code: string } | null>(null);
  const agentUidRef = useRef(0);
  const agentUid = () => `a${++agentUidRef.current}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // 에디터 설정
  const [wrap, setWrap] = useState(true); // 자동 줄바꿈
  const [lineNumbers, setLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showSettings, setShowSettings] = useState(false);

  // 터미널 — 엔트리를 스트림(cmd/out/err) + 출처(run/debug)별로 보관.
  //   VS Code 정렬: 문제=에러(진단) · 출력=프로그램 stdout · 디버그 콘솔=디버그 세션 · 터미널=일반 실행
  type TermLine = { stream: 'cmd' | 'out' | 'err'; kind: 'run' | 'debug'; text: string };
  const [bottomTab, setBottomTab] = useState<'문제' | '출력' | '디버그' | '터미널'>('터미널');
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false); // 배속 드롭다운
  const [cmdInput, setCmdInput] = useState(''); // 터미널 명령 입력
  const [running, setRunning] = useState(false);
  // 터미널 패널 높이(드래그로 조절) + 출력 자동 하단 추적
  const { height: winHeight } = useWindowDimensions();
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

  // 브라우저 프리뷰
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // 미니 브라우저 컨트롤
  const previewWebRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [addressEditing, setAddressEditing] = useState(false);

  // 주소창 입력 → URL 이면 이동, 아니면 검색
  const navigateTo = useCallback((raw: string) => {
    const t = (raw || '').trim();
    if (!t) return;
    let url: string;
    if (/^https?:\/\//i.test(t)) url = t;
    else if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) url = `https://${t}`;
    else url = `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    setAddressEditing(false);
    setPreviewError(null);
    setPreviewUrl(url);
  }, []);

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
        }
      } catch (_) { /* noop */ }
      settingsLoadedRef.current = true;
    })();
  }, []);

  // 설정 변경 시 저장 (로드 완료 후에만)
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    AsyncStorage.setItem(IDE_SETTINGS_KEY, JSON.stringify({ wrap, lineNumbers, fontSize })).catch(() => {});
  }, [wrap, lineNumbers, fontSize]);

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

  // 프로젝트 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!projectId) { setError('프로젝트 정보가 없습니다.'); setLoading(false); return; }
      setLoading(true);
      const res = await getIdeProject(projectId);
      if (!alive) return;
      if (res.success && res.data) {
        const p = res.data;
        setProject(p);
        const map: Record<string, string> = {};
        p.files.forEach((f) => { map[f.path] = f.content; });
        setContents(map);
        // 관리자가 저장한 탭/활성 탭이 있으면 그대로 복원(존재하는 파일/에셋만)
        const fileExists = (pth: string) =>
          p.files.some((f) => f.path === pth) || p.assets.some((a) => a.path === pth);
        const savedTabs = (initialTabs || []).filter(fileExists);
        if (savedTabs.length) {
          setOpenTabs(savedTabs);
          setActivePath(savedActiveTab && savedTabs.includes(savedActiveTab) ? savedActiveTab : savedTabs[0]);
        } else {
          // 저장된 상태 없으면 진입 파일 자동 오픈
          const entry =
            (entryFile && p.files.find((f) => f.path === entryFile)?.path) ||
            p.files.find((f) => /index\.html?$/i.test(f.path))?.path ||
            p.files.find((f) => /\.html?$/i.test(f.path))?.path ||
            p.files[0]?.path ||
            null;
          if (entry) { setOpenTabs([entry]); setActivePath(entry); }
        }
      } else {
        setError(res.error || '소스를 불러오지 못했습니다.');
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId, entryFile]);

  const tree = useMemo(
    () => buildTree(project?.files || [], project?.assets || []),
    [project],
  );

  const openFile = useCallback((path: string) => {
    // 이미지는 프리뷰 탭으로, 텍스트는 에디터 탭으로 — 둘 다 탭으로 연다
    setOpenTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActivePath(path);
    setShowAgent(false);
    if (isImagePath(path)) loadImage(path);
  }, [loadImage]);

  const closeTab = (path: string) => {
    setOpenTabs((t) => {
      const idx = t.indexOf(path);
      const next = t.filter((p) => p !== path);
      if (activePath === path) setActivePath(next[idx] || next[idx - 1] || null);
      return next;
    });
  };

  const setActiveContent = useCallback((val: string) => {
    setActivePath((cur) => {
      if (cur) setContents((c) => ({ ...c, [cur]: val }));
      return cur;
    });
  }, []);

  const filesPayload = useCallback(
    () => (project?.files || []).map((f) => ({ path: f.path, content: contents[f.path] ?? f.content })),
    [project, contents],
  );

  // ── 에이전트 → 에디터 동기화 ──
  // 에이전트가 워크스페이스 파일을 만들거나 고치면 그 내용을 읽어 에디터 탭으로 반영.
  const syncAgentFile = useCallback(async (relPath: string) => {
    if (!relPath) return;
    const res = await getAgentFile(relPath);
    if (res.success && res.data) {
      const content = res.data.content;
      setContents((c) => ({ ...c, [relPath]: content }));
      setOpenTabs((t) => (t.includes(relPath) ? t : [...t, relPath]));
      // 탐색기 트리에도 반영 — project.files 에 없으면 추가(에이전트가 만든 새 파일)
      setProject((p) => {
        if (!p) return p;
        if (p.files.some((f) => f.path === relPath) || p.assets.some((a) => a.path === relPath)) return p;
        const language = (relPath.split('.').pop() || '').toLowerCase();
        return { ...p, files: [...p.files, { path: relPath, language, content }] };
      });
    }
  }, []);

  // SDK 이벤트 → 채팅/에디터 반영
  const handleAgentEvent = useCallback((evt: AgentEvent) => {
    switch (evt.type) {
      case 'agent_init':
        agentSessionRef.current = evt.sessionId;
        break;
      case 'text':
        setAgentMessages((m) => [...m, { id: agentUid(), role: 'assistant', text: evt.text }]);
        break;
      case 'thinking':
        setAgentMessages((m) => [...m, { id: agentUid(), role: 'thinking', text: evt.text }]);
        break;
      case 'tool_use':
        agentToolRelRef.current[evt.toolUseId] = evt.relPath || undefined;
        setAgentMessages((m) => {
          agentToolIndexRef.current[evt.toolUseId] = m.length;
          return [...m, {
            id: agentUid(), role: 'tool', tool: evt.tool,
            relPath: evt.relPath || undefined,
            command: evt.tool === 'Bash' ? evt.input?.command : undefined,
          }];
        });
        break;
      case 'tool_result': {
        const idx = agentToolIndexRef.current[evt.toolUseId];
        if (idx != null) {
          setAgentMessages((m) => {
            if (!m[idx]) return m;
            const copy = m.slice();
            copy[idx] = { ...copy[idx], ok: evt.ok, output: evt.content } as AgentMsg;
            return copy;
          });
        }
        // 파일 도구 성공 → 에디터 동기화(+팔로우는 사용자가 칩 탭 시)
        const rel = agentToolRelRef.current[evt.toolUseId];
        if (evt.ok && rel) syncAgentFile(rel);
        break;
      }
      case 'done':
        setAgentRunning(false);
        break;
      case 'error':
        setAgentMessages((m) => [...m, { id: agentUid(), role: 'assistant', text: `⚠️ ${evt.message}` }]);
        setAgentRunning(false);
        break;
    }
  }, [syncAgentFile]);

  // 에이전트 전송 — 선택 코드가 있으면 프롬프트에 주입("들어가는 선")
  const sendAgent = useCallback(async () => {
    const raw = agentInput.trim();
    if (!raw || agentRunning) return;
    const sel = selectionRef.current;
    let prompt = raw;
    if (sel && sel.code) {
      prompt = `다음은 \`${sel.file}\` 의 ${sel.startLine}-${sel.endLine}번째 줄입니다:\n\`\`\`\n${sel.code}\n\`\`\`\n\n${raw}`;
    }
    setAgentInput('');
    setAgentMessages((m) => [...m, { id: agentUid(), role: 'user', text: raw }]);
    setAgentRunning(true);
    agentToolIndexRef.current = {};
    agentToolRelRef.current = {};
    try {
      agentAbortRef.current = await streamAgentQuery(
        prompt,
        handleAgentEvent,
        (err) => {
          setAgentMessages((m) => [...m, { id: agentUid(), role: 'assistant', text: `⚠️ ${err}` }]);
          setAgentRunning(false);
        },
        () => setAgentRunning(false),
        { sessionId: agentSessionRef.current || undefined },
      );
    } catch (e) {
      setAgentMessages((m) => [...m, { id: agentUid(), role: 'assistant', text: `⚠️ ${e instanceof Error ? e.message : '에이전트 호출 실패'}` }]);
      setAgentRunning(false);
    }
  }, [agentInput, agentRunning, handleAgentEvent]);

  // 에디터 선택 변경 → 프롬프트 주입용 selection 캡처
  const onEditorSelection = useCallback((sel: { startLine: number; endLine: number; code: string }) => {
    if (sel.code && activePathRef.current) {
      selectionRef.current = { file: activePathRef.current, startLine: sel.startLine, endLine: sel.endLine, code: sel.code };
      setAgentSelection({ file: activePathRef.current, startLine: sel.startLine, endLine: sel.endLine });
    } else {
      selectionRef.current = null;
      setAgentSelection(null);
    }
  }, []);

  // 에이전트가 만진 파일을 에디터로 열기(팔로우)
  const openAgentFile = useCallback((relPath: string) => {
    setOpenTabs((t) => (t.includes(relPath) ? t : [...t, relPath]));
    setActivePath(relPath);
    setShowAgent(false);
  }, []);

  // 파일 전환 시 이전 선택은 무효
  useEffect(() => { selectionRef.current = null; setAgentSelection(null); }, [activePath]);

  // 언마운트 시 진행 중 스트림 중단
  useEffect(() => () => { try { agentAbortRef.current?.(); } catch (_) { /* noop */ } }, []);

  // ── 터미널 명령 입력 실행 ──
  // 현재 단계: 입력 명령에서 "알려진 파일"을 찾아 그 파일을 실행(예: python index.py, node app.js).
  //   (임의 셸 명령은 가상환경 도입 시 확장 — 설계 메모 참고)
  const runTerminalCommand = useCallback((raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    addTerm('cmd', 'run', `$ ${cmd}`);
    setCmdInput('');
    // 토큰 중 프로젝트에 존재하는 파일을 찾음(정확 경로 또는 베이스명 매칭)
    let target: string | null = null;
    for (const t of cmd.split(/\s+/)) {
      if (contents[t] !== undefined) { target = t; break; }
      const hit = Object.keys(contents).find((p) => baseOf(p) === t || p.endsWith('/' + t));
      if (hit) { target = hit; break; }
    }
    const lang = target ? runnableLanguage(target) : null;
    if (!target || !lang) {
      addTerm('err', 'run', `지원하지 않는 명령입니다. 현재는 파일 실행만 가능합니다 (예: python index.py, node app.js)`);
      return;
    }
    setRunning(true);
    runCode(
      contents[target], lang,
      (msg) => {
        if (msg.type === 'output' && msg.data) addTerm('out', 'run', String(msg.data));
        else if (msg.type === 'error' && msg.data) addTerm('err', 'run', String(msg.data));
      },
      (err) => { addTerm('err', 'run', String(err)); setRunning(false); },
      () => setRunning(false),
    );
  }, [contents, addTerm]);

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

  // ── 브라우저 프리뷰 ──
  const openPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewError(null);
    try {
      const res = await createInlinePreview(projectId, filesPayload(), entryFile);
      if (res.success && res.data?.sessionId) {
        setPreviewUrl(buildPreviewUrl(res.data.sessionId, res.data.entryFile || 'index.html'));
      } else {
        setPreviewError(`세션 생성 실패: ${res.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      setPreviewError(`프리뷰 예외: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [projectId, entryFile, filesPayload]);

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
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ marginRight: 12 }}>
          <X width={22} height={22} fill="#fff" />
        </Pressable>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>모바일 <Text style={{ fontWeight: '800' }}>IDE</Text></Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {/* 에이전트가 열리면 탐색기/터미널은 화면에서 가려지므로 토글도 비활성 표시 */}
          <TopBarButton active={showExplorer && !showAgent} onPress={() => setShowExplorer((v) => !v)}><SidebarIcon filled={showExplorer && !showAgent} /></TopBarButton>
          <TopBarButton active={showTerminal && !showAgent} onPress={() => { setShowTerminal((v) => !v); setTerminalExpanded(false); }}><TerminalIcon filled={showTerminal && !showAgent} /></TopBarButton>
          <TopBarButton active={showAgent} onPress={() => setShowAgent((v) => !v)}><PanelRightIcon filled={showAgent} /></TopBarButton>
          <TopBarButton active={!!previewUrl} onPress={openPreview}><BrowserIcon filled={!!previewUrl} /></TopBarButton>
          <TopBarButton active={showSettings} onPress={() => setShowSettings((v) => !v)}><ListIcon filled={showSettings} /></TopBarButton>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#64748B', marginTop: 10 }}>프로젝트 불러오는 중…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#F87171', textAlign: 'center' }}>{error}</Text>
        </View>
      ) : showAgent ? (
        <AgentPanel
          projectName={projectName}
          openTabs={openTabs}
          messages={agentMessages}
          input={agentInput}
          onChangeInput={setAgentInput}
          onSend={sendAgent}
          running={agentRunning}
          onOpenFile={openAgentFile}
          selection={agentSelection}
        />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* 탐색기 */}
            {showExplorer && (
              <View style={{ width: 220, borderRightWidth: 1, borderRightColor: '#1C2230', backgroundColor: '#0A0D14' }}>
                <Text style={{ color: '#64748B', fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 }}>탐색기</Text>
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
                          <Pressable onPress={() => closeTab(p)} hitSlop={6}><X width={12} height={12} fill={active ? '#fff' : '#64748B'} /></Pressable>
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
                      onSelectionChange={onEditorSelection}
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
                      return (
                        <>
                          {bottomTab === '터미널' && (
                            <Text style={{ color: '#64748B', fontSize: 12, fontFamily: mono, paddingVertical: 4 }}>○ user@CodingPT ~/{projectName}/</Text>
                          )}
                          {shown.map((e, i) => (
                            <Text key={i} style={{ color: lineColor(e), fontSize: 12, fontFamily: mono }}>{e.text}</Text>
                          ))}
                        </>
                      );
                    })()}
                  </ScrollView>

                  {/* 터미널 명령 입력 — 직접 명령을 입력해 실행(현재: 파일 실행) */}
                  {bottomTab === '터미널' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1C2230', gap: 8, backgroundColor: '#0A0D14' }}>
                      <Text style={{ color: '#34D399', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>$</Text>
                      <TextInput
                        value={cmdInput}
                        onChangeText={setCmdInput}
                        onSubmitEditing={() => runTerminalCommand(cmdInput)}
                        placeholder="명령어 입력 (예: python index.py)"
                        placeholderTextColor="#475569"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        spellCheck={false}
                        returnKeyType="go"
                        editable={!running}
                        blurOnSubmit={false}
                        style={{ flex: 1, color: '#E5E7EB', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', padding: 0 }}
                      />
                    </View>
                  )}
                </View>
              )}

            </View>
          </View>

          {/* 특수문자 키보드 액세서리 — 키보드 위 화면 전체 폭에 고정.
              탐색기/패널 레이아웃(row)과 무관하게 row 밖에 두어 항상 최하단 전체 폭에 표시(키보드 액세서리이므로). */}
          {activePath && !isImagePath(activePath) && keyboardVisible && (
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
          </View>
        </>
      )}

      {/* 브라우저 프리뷰 오버레이 */}
      {(previewUrl || previewLoading || previewError) && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' }}>
          <SafeAreaView edges={['top']} style={{ backgroundColor: '#16181D' }}>
            {/* 상단: 타이틀 + 닫기 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 40 }}>
              <BrowserIcon size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 }}>미리보기</Text>
              <Pressable onPress={() => { setPreviewUrl(null); setPreviewError(null); }} hitSlop={8}><X width={20} height={20} fill="#fff" /></Pressable>
            </View>
            {/* 브라우저 컨트롤: 뒤로/앞으로/새로고침 + 주소·검색창 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8, gap: 6 }}>
              <Pressable onPress={() => previewWebRef.current?.goBack()} disabled={!canGoBack} hitSlop={6} style={{ opacity: canGoBack ? 1 : 0.35, padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>‹</Text>
              </Pressable>
              <Pressable onPress={() => previewWebRef.current?.goForward()} disabled={!canGoForward} hitSlop={6} style={{ opacity: canGoForward ? 1 : 0.35, padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>›</Text>
              </Pressable>
              <Pressable onPress={() => previewWebRef.current?.reload()} hitSlop={6} style={{ padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 17 }}>↻</Text>
              </Pressable>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2F3A', borderRadius: 18, paddingHorizontal: 14, height: 34 }}>
                <TextInput
                  value={addressText}
                  onChangeText={setAddressText}
                  onFocus={() => setAddressEditing(true)}
                  onSubmitEditing={(e) => navigateTo(e.nativeEvent.text)}
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
          </SafeAreaView>
          {previewError ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0A0D14' }}>
              <Text style={{ color: '#F87171', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>페이지를 표시할 수 없습니다</Text>
              <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>{previewError}</Text>
              <Pressable onPress={openPreview} style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1F2430' }}>
                <Text style={{ color: '#93C5FD', fontSize: 13 }}>미리보기 다시 열기</Text>
              </Pressable>
            </View>
          ) : previewLoading || !previewUrl ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>
          ) : (
            <WebView
              ref={previewWebRef}
              source={{ uri: previewUrl }}
              originWhitelist={['*']}
              mixedContentMode="always"
              javaScriptEnabled
              domStorageEnabled
              onNavigationStateChange={(s) => {
                setCanGoBack(s.canGoBack);
                setCanGoForward(s.canGoForward);
                if (!addressEditing) setAddressText(s.url);
              }}
              onError={(e) => setPreviewError(`로드 오류: ${e.nativeEvent.description || ''} (code ${e.nativeEvent.code})`)}
              onHttpError={(e) => setPreviewError(`HTTP ${e.nativeEvent.statusCode} — ${e.nativeEvent.url || ''}`)}
              style={{ flex: 1 }}
            />
          )}
        </View>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// 도구 칩 표시 라벨
const toolLabel = (m: Extract<AgentMsg, { role: 'tool' }>): string => {
  if (m.tool === 'Bash') return `$ ${m.command || ''}`;
  if (m.tool === 'Write') return `파일 생성 · ${m.relPath || ''}`;
  if (m.tool === 'Edit' || m.tool === 'MultiEdit') return `파일 수정 · ${m.relPath || ''}`;
  if (m.tool === 'Read') return `읽기 · ${m.relPath || ''}`;
  return m.relPath ? `${m.tool} · ${m.relPath}` : m.tool;
};

// ── Agent 패널 — 채팅 + 도구 실행 시각화 + 에디터 팔로우 ──
interface AgentPanelProps {
  projectName: string;
  openTabs: string[];
  messages: AgentMsg[];
  input: string;
  onChangeInput: (t: string) => void;
  onSend: () => void;
  running: boolean;
  onOpenFile: (relPath: string) => void;
  selection: { file: string; startLine: number; endLine: number } | null;
}

const AgentPanel = ({
  openTabs, messages, input, onChangeInput, onSend, running, onOpenFile, selection,
}: AgentPanelProps) => {
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);
  const canSend = input.trim().length > 0 && !running;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0A0D14' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#3B82F6', paddingBottom: 4 }}>Agent</Text>
        {running && <ActivityIndicator size="small" color="#60A5FA" style={{ marginLeft: 10 }} />}
      </View>

      {messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <SparkleIcon size={52} color="#cbd5e1" />
          <Text style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>
            이 프로젝트에서{'\n'}어떤 도움이 필요하세요?
          </Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 10 }}>
          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: '#1D4ED8', borderRadius: 14, borderTopRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
                </View>
              );
            }
            if (m.role === 'assistant') {
              return (
                <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                  <Text style={{ color: '#E2E8F0', fontSize: 14, lineHeight: 21 }}>{m.text}</Text>
                </View>
              );
            }
            if (m.role === 'thinking') {
              return (
                <Text key={m.id} style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', alignSelf: 'flex-start', maxWidth: '92%' }} numberOfLines={2}>
                  💭 {m.text}
                </Text>
              );
            }
            // tool
            const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
            const tappable = !!m.relPath;
            const statusColor = m.ok === undefined ? '#64748B' : m.ok ? '#34D399' : '#F87171';
            const statusMark = m.ok === undefined ? '…' : m.ok ? '✓' : '✕';
            return (
              <Pressable
                key={m.id}
                disabled={!tappable}
                onPress={() => m.relPath && onOpenFile(m.relPath)}
                style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: '#11151F', borderWidth: 1, borderColor: '#1C2230', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: statusColor, fontSize: 12 }}>{statusMark}</Text>
                  <Text style={{ color: '#CBD5E1', fontSize: 12.5, fontFamily: mono, flexShrink: 1 }} numberOfLines={1}>{toolLabel(m)}</Text>
                  {tappable && <Text style={{ color: '#60A5FA', fontSize: 11 }}>열기 ›</Text>}
                </View>
                {m.tool === 'Bash' && m.output ? (
                  <Text style={{ color: '#94A3B8', fontSize: 11.5, fontFamily: mono, marginTop: 5 }} numberOfLines={6}>
                    {m.output.replace(/\n$/, '')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <View style={{ backgroundColor: '#2A2F3A', borderRadius: 14, padding: 12 }}>
          {/* 선택 코드 컨텍스트("들어가는 선") */}
          {selection ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#15243F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 8, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#93C5FD', fontSize: 12 }}>＠ {baseOf(selection.file)}:{selection.startLine}-{selection.endLine}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
              {openTabs.map((p) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1F2430', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginRight: 6 }}>
                  <FileTypeIcon name={p} size={14} />
                  <Text style={{ color: '#CBD5E1', fontSize: 12 }}>{baseOf(p)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TextInput
            value={input}
            onChangeText={onChangeInput}
            placeholder="Agent 한테 물어보기"
            placeholderTextColor="#64748B"
            multiline
            editable={!running}
            style={{ color: '#fff', fontSize: 14, minHeight: 60, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: '#64748B', fontSize: 22 }}>＋</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.5 }}
            >
              {running ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18 }}>↑</Text>}
            </Pressable>
          </View>
        </View>
        <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 8 }}>AI는 정보 제공 시 실수를 할 수 있습니다.</Text>
      </View>
    </KeyboardAvoidingView>
  );
};
