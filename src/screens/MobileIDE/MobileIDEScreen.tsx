import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Keyboard, Image, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { X } from '../../assets/SvgIcon';
import {
  SidebarIcon, TerminalIcon, PanelRightIcon, BrowserIcon, SparkleIcon, ListIcon, FullscreenIcon,
} from '../../components/module/ide/ideIcons';
import { FileTypeIcon } from '../../components/module/ide/fileTypeIcons';
import CodeEditorWebView, { CodeEditorHandle } from '../../components/module/ide/CodeEditorWebView';
import { haptic } from '../../animations/haptics';
import {
  getIdeProject, createInlinePreview, buildPreviewUrl, runCode, runnableLanguage,
  getIdeAsset, IdeProject,
} from '../../services/ideService';

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // 에디터 설정
  const [wrap, setWrap] = useState(true); // 자동 줄바꿈
  const [lineNumbers, setLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showSettings, setShowSettings] = useState(false);

  // 터미널
  const [bottomTab, setBottomTab] = useState<'문제' | '출력' | '터미널'>('터미널');
  const [termLines, setTermLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

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
        // 진입 파일 자동 오픈
        const entry =
          (entryFile && p.files.find((f) => f.path === entryFile)?.path) ||
          p.files.find((f) => /index\.html?$/i.test(f.path))?.path ||
          p.files.find((f) => /\.html?$/i.test(f.path))?.path ||
          p.files[0]?.path ||
          null;
        if (entry) { setOpenTabs([entry]); setActivePath(entry); }
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

  // ── 실행 ──
  const runActive = useCallback(async () => {
    if (!activePath) return;
    const lang = runnableLanguage(activePath);
    setShowTerminal(true);
    setBottomTab('터미널');
    if (!lang) {
      setTermLines((l) => [...l, `$ 이 파일은 실행 대상이 아닙니다. 브라우저 프리뷰로 확인하세요: ${baseOf(activePath)}`]);
      return;
    }
    setRunning(true);
    setTermLines((l) => [...l, `$ ${lang === 'python' ? 'python' : 'node'} ${baseOf(activePath)}`]);
    const code = contents[activePath] ?? '';
    await runCode(
      code, lang,
      (msg) => {
        if (msg.type === 'output' && msg.data) setTermLines((l) => [...l, ...String(msg.data).replace(/\n$/, '').split('\n')]);
        else if (msg.type === 'error' && msg.data) setTermLines((l) => [...l, ...String(msg.data).replace(/\n$/, '').split('\n')]);
      },
      (err) => { setTermLines((l) => [...l, `[오류] ${err}`]); setRunning(false); },
      () => setRunning(false),
    );
  }, [activePath, contents]);

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

  const activeIsRunnable = activePath ? !!runnableLanguage(activePath) : false;

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
        <AgentPanel projectName={projectName} openTabs={openTabs} />
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
              {/* 탭 바 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#1C2230', backgroundColor: '#0A0D14' }}>
                {openTabs.map((p) => {
                  const active = p === activePath;
                  return (
                    <Pressable key={p} onPress={() => setActivePath(p)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#1C2230', backgroundColor: active ? '#11151F' : 'transparent', borderBottomWidth: active ? 2 : 0, borderBottomColor: '#3B82F6' }}>
                      <FileTypeIcon name={p} />
                      <Text style={{ color: active ? '#fff' : '#94A3B8', fontSize: 13 }}>{baseOf(p)}</Text>
                      <Pressable onPress={() => closeTab(p)} hitSlop={6}><X width={12} height={12} fill={active ? '#fff' : '#64748B'} /></Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>

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
                    : { height: 240 },
                ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 16 }}>
                    {(['문제', '출력', '터미널'] as const).map((t) => (
                      <Pressable key={t} onPress={() => setBottomTab(t)}>
                        <Text style={{ color: bottomTab === t ? '#fff' : '#64748B', fontSize: 13, fontWeight: bottomTab === t ? '700' : '400', borderBottomWidth: bottomTab === t ? 2 : 0, borderBottomColor: '#3B82F6', paddingBottom: 2 }}>{t}</Text>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    {/* 실행: 코드를 실행해 터미널에 출력 → 터미널 탭에서만. 지우기: 출력/터미널 로그 비우기 → 출력·터미널 탭. */}
                    {bottomTab === '터미널' && (
                      <Pressable onPress={runActive} disabled={running} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: running ? 0.5 : 1 }}>
                        <Text style={{ color: activeIsRunnable ? '#34D399' : '#64748B', fontSize: 13, fontWeight: '700' }}>{running ? '실행 중…' : '▶ 실행'}</Text>
                      </Pressable>
                    )}
                    {(bottomTab === '터미널' || bottomTab === '출력') && (
                      <Pressable onPress={() => setTermLines([])} hitSlop={6}><Text style={{ color: '#64748B', fontSize: 12 }}>지우기</Text></Pressable>
                    )}
                    <Pressable onPress={() => setTerminalExpanded((v) => !v)} hitSlop={6}><FullscreenIcon size={16} color="#64748B" expanded={terminalExpanded} /></Pressable>
                    <Pressable onPress={() => { setShowTerminal(false); setTerminalExpanded(false); }} hitSlop={6}><X width={14} height={14} fill="#64748B" /></Pressable>
                  </View>
                  <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
                    {bottomTab === '문제' ? (
                      <Text style={{ color: '#475569', fontSize: 12, paddingVertical: 8 }}>문제 없음</Text>
                    ) : (
                      <>
                        <Text style={{ color: '#64748B', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingVertical: 4 }}>○ user@CodingPT ~/{projectName}/</Text>
                        {termLines.map((ln, i) => (
                          <Text key={i} style={{ color: ln.startsWith('[오류]') ? '#F87171' : '#CBD5E1', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{ln}</Text>
                        ))}
                      </>
                    )}
                  </ScrollView>
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
  );
}

// ── Agent 패널 (v1: UI 전용) ──
const AgentPanel = ({ projectName, openTabs }: { projectName: string; openTabs: string[] }) => {
  const [text, setText] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0D14' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#3B82F6', paddingBottom: 4 }}>Agent</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <SparkleIcon size={52} color="#cbd5e1" />
        <Text style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>
          이 프로젝트에서{'\n'}어떤 도움이 필요하세요?
        </Text>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <View style={{ backgroundColor: '#2A2F3A', borderRadius: 14, padding: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
            {openTabs.map((p) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1F2430', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginRight: 6 }}>
                <FileTypeIcon name={p} size={14} />
                <Text style={{ color: '#CBD5E1', fontSize: 12 }}>{baseOf(p)}</Text>
              </View>
            ))}
          </ScrollView>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Agent 한테 물어보기"
            placeholderTextColor="#64748B"
            multiline
            style={{ color: '#fff', fontSize: 14, minHeight: 60, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: '#64748B', fontSize: 22 }}>＋</Text>
            <View style={{ flex: 1 }} />
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <Text style={{ color: '#fff', fontSize: 18 }}>↑</Text>
            </View>
          </View>
        </View>
        <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 8 }}>AI는 정보 제공 시 실수를 할 수 있습니다.</Text>
      </View>
    </View>
  );
};
