import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import {
  getIdeProject, saveIdeProject, IdeProject, stopDevPreview,
} from '../services/ideService';
import { getAgentFile } from '../services/agentService';
import { useAgentSession } from './AgentSessionContext';

/**
 * 모바일 IDE 프로젝트 소스를 "워크스페이스 단위로 미리 로드 + 항상 동기화"하는 컨텍스트.
 *
 * 왜 컨텍스트인가:
 *  - 예전 구조는 MobileIDE 화면이 마운트될 때마다 getIdeProject 로 통째로 로드(스피너) 했다.
 *    IDE 를 열 때마다 재로드 + 닫혀 있는 동안의 에이전트 변경을 놓침.
 *  - 이 컨텍스트는 IndexScreen 위(AgentSessionProvider 내부)에 상주하므로 IDE 개폐와 무관하게 살아 있다.
 *    · 활성 워크스페이스가 정해지면 백그라운드로 프로젝트를 미리 로드(캐시) → IDE 진입이 즉시.
 *    · 에이전트가 파일을 만들/고치면(IDE 가 닫혀 있어도) contents/트리에 반영하고 objectstore 에 자동 저장.
 *  - MobileIDE 는 이 컨텍스트의 project/contents 를 그대로 소비(단일 소스)하고, 편집 UI 만 얹는다.
 *
 * 저장 소유권 분리(이중 저장 방지):
 *  · IDE 가 열려 있는 동안(editorActive=true): MobileIDE 가 사용자/에이전트 편집을 저장.
 *  · IDE 가 닫혀 있는 동안: 이 컨텍스트가 에이전트 편집을 디바운스 저장.
 */

type ProjectCache = { project: IdeProject; contents: Record<string, string> };
type FileChangeCb = (relPath: string, content: string) => void;

interface IdeProjectValue {
  // 현재 활성(또는 IDE 가 요청한) 프로젝트 상태
  projectId: string | null;
  project: IdeProject | null;
  contents: Record<string, string>;
  loading: boolean;
  error: string | null;
  ready: boolean; // 현재 projectId 의 소스가 로드됨

  // MobileIDE 가 그대로 쓰는 setter (useState 와 동일 시그니처)
  setProject: React.Dispatch<React.SetStateAction<IdeProject | null>>;
  setContents: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  ensureProject: (projectId: string) => void; // IDE 진입 시 이 프로젝트를 활성화
  reload: (projectId?: string) => Promise<void>; // 강제 재로드(가져오기 후 등)
  subscribeFileChange: (cb: FileChangeCb) => () => void; // 에이전트 변경 → 에디터 라이브 반영용
  setEditorActive: (active: boolean) => void; // IDE 개폐 신호(저장 소유권 전환)

  // ── 모바일 IDE 오버레이(언마운트하지 않고 보임/숨김만) ──
  // 닫아도 화면 인스턴스가 살아 있어 직전 상태(탭/브라우저/터미널/스크롤)가 그대로 유지된다.
  ideMounted: boolean;   // 한 번이라도 열렸는가(이후 계속 마운트 유지)
  ideVisible: boolean;   // 현재 보이는가
  ideParams: IdeOpenParams | null;
  openIde: (params: IdeOpenParams) => void;
  closeIde: () => void;
}

export type IdeOpenParams = {
  ide: {
    projectId: string;
    projectName?: string;
    entryFile?: string;
    initialTabs?: string[];
    activeTab?: string;
    openTerminal?: boolean; // 진입 즉시 하단 터미널 패널을 연다(내 PC 터미널 바로 진입 등)
    highlights?: Record<string, Array<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>>;
  };
  lessonId?: number;
};

const IdeProjectContext = createContext<IdeProjectValue | null>(null);

export const IdeProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeWorkspace, registerEventListener } = useAgentSession();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<IdeProject | null>(null);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);

  // IDE 오버레이 — 닫아도 언마운트하지 않고 숨기기만(상태 보존). 한 번 열리면 ideMounted 유지.
  const [ideMounted, setIdeMounted] = useState(false);
  const [ideVisible, setIdeVisible] = useState(false);
  const [ideParams, setIdeParams] = useState<IdeOpenParams | null>(null);
  const openIde = useCallback((params: IdeOpenParams) => {
    setIdeParams(params);
    setIdeMounted(true);
    setIdeVisible(true);
  }, []);
  const closeIde = useCallback(() => { setIdeVisible(false); }, []);

  // 다른 워크스페이스로 전환했다 돌아오면 즉시 복원하도록 프로젝트별 캐시 보관.
  const cacheRef = useRef<Map<string, ProjectCache>>(new Map());
  // 콜백/타이머의 stale 클로저 방지용 ref 미러
  const projectIdRef = useRef<string | null>(null);
  const projectRef = useRef<IdeProject | null>(null);
  const contentsRef = useRef<Record<string, string>>({});
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { contentsRef.current = contents; }, [contents]);

  // 활성 상태(project/contents)를 캐시에 미러 → 편집/에이전트 변경이 캐시에 항상 반영
  useEffect(() => {
    if (projectId && project) cacheRef.current.set(projectId, { project, contents });
  }, [projectId, project, contents]);

  // ── 프로젝트 활성화 ──
  // activeWorkspace 변경(바이브 세션 진입) 또는 IDE 의 ensureProject 로 활성 프로젝트가 정해진다.
  const ensureProject = useCallback((id: string) => {
    if (id) setProjectId(id);
  }, []);
  // 채팅 워크스페이스(kind:'chat')는 코딩 프로젝트가 없으므로 IDE 프리로드를 건너뛴다.
  useEffect(() => {
    if (activeWorkspace?.id && activeWorkspace.kind !== 'chat') setProjectId(activeWorkspace.id);
  }, [activeWorkspace?.id, activeWorkspace?.kind]);

  // ── 워크스페이스 이탈 시 dev 서버 종료 + IDE 리셋 ──
  // 코딩 워크스페이스를 떠나거나(랜딩/채팅 복귀) 다른 워크스페이스로 전환하면:
  //  · 직전 워크스페이스의 dev 서버를 종료한다 — "접속 중에만 dev 가동" 정책(홈서버 컴퓨팅 절약).
  //  · 상주 IDE 오버레이를 내려, 재진입을 새 인스턴스로 만든다(터미널/브라우저가 새로 열린 상태).
  // 재실행은 사용자가 다시 들어와 에이전트에게 요청하거나 터미널에서 직접 명령해 시작한다.
  // 콜백/이펙트가 최신 ideParams 를 읽도록 미러(선언 순서상 leave 이펙트보다 먼저 갱신).
  const ideParamsRef = useRef<IdeOpenParams | null>(null);
  useEffect(() => { ideParamsRef.current = ideParams; }, [ideParams]);
  const prevWsRef = useRef<{ id: string; kind?: string } | null>(null);
  useEffect(() => {
    const cur = activeWorkspace;
    const prev = prevWsRef.current;
    prevWsRef.current = cur ? { id: cur.id, kind: cur.kind } : null;
    const leftProject = !!prev && prev.kind !== 'chat' && (!cur || cur.id !== prev.id);
    // 새 활성 워크스페이스가 "지금 여는 IDE"와 같으면 오버레이를 내리지 않는다(전환하며 바로 새 IDE 를 여는 경우 —
    //  내 PC 폴더 열기처럼 setActiveWorkspace+openIde 를 한 번에 하는 흐름). 이전 dev 서버 종료는 그대로 수행.
    const openingCur = !!cur && ideParamsRef.current?.ide.projectId === cur.id;
    if (leftProject && prev) {
      // 데몬(내 PC, pc:) 은 사용자가 직접 띄운 dev 서버라 절대 종료하지 않는다(그리고 stopDev 는 userId 기준이라
      //  잘못하면 무관한 클라우드 dev 서버를 멈춤). cloud 워크스페이스만 종료.
      if (!prev.id.startsWith('pc:')) stopDevPreview(prev.id).catch(() => { /* 종료 실패는 idle TTL 이 백업 */ });
      if (!openingCur) {
        setIdeMounted(false);
        setIdeVisible(false);
        setIdeParams(null);
      }
    }
    if (!cur) { setProjectId(null); setReadyId(null); }
  }, [activeWorkspace]);

  // ── 로드(미리/요청) ──
  // 진입 시 effect 가 여러 번(StrictMode·연속 렌더) 호출돼도 같은 프로젝트는 한 번만 네트워크 로드.
  const inflightRef = useRef<Set<string>>(new Set());
  const loadProject = useCallback(async (id: string, force = false) => {
    if (!id) return;
    if (!force) {
      const cached = cacheRef.current.get(id);
      if (cached) {
        setProject(cached.project);
        setContents(cached.contents);
        setReadyId(id);
        setLoading(false);
        setError(null);
        return;
      }
      if (inflightRef.current.has(id)) return; // 이미 같은 프로젝트 로드 진행 중
    }
    inflightRef.current.add(id);
    setLoading(true);
    setError(null);
    let res;
    try { res = await getIdeProject(id); }
    finally { inflightRef.current.delete(id); }
    // 로드 도중 다른 프로젝트로 전환됐으면 버린다
    if (projectIdRef.current !== id) return;
    if (res.success && res.data) {
      const p = res.data;
      const map: Record<string, string> = {};
      p.files.forEach((f) => { map[f.path] = f.content; });
      cacheRef.current.set(id, { project: p, contents: map });
      setProject(p);
      setContents(map);
      setReadyId(id);
    } else {
      setError(res.error || '소스를 불러오지 못했습니다.');
    }
    setLoading(false);
  }, []);

  // 활성 프로젝트가 바뀌면 로드(캐시 있으면 즉시). 캐시 없을 때만 화면을 비운다(깜빡임 방지).
  useEffect(() => {
    if (!projectId) return;
    const cached = cacheRef.current.get(projectId);
    if (!cached) { setProject(null); setContents({}); setReadyId(null); }
    void loadProject(projectId);
  }, [projectId, loadProject]);

  const reload = useCallback(async (id?: string) => {
    const target = id || projectIdRef.current;
    if (target) await loadProject(target, true);
  }, [loadProject]);

  // ── 에디터 라이브 반영 구독 ──
  const subsRef = useRef<Set<FileChangeCb>>(new Set());
  const subscribeFileChange = useCallback((cb: FileChangeCb) => {
    subsRef.current.add(cb);
    return () => { subsRef.current.delete(cb); };
  }, []);

  // ── 저장 소유권 ──
  const editorActiveRef = useRef(false);
  const setEditorActive = useCallback((active: boolean) => { editorActiveRef.current = active; }, []);

  // ── 닫혀 있는 동안 에이전트 변경 자동 저장 ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const doAgentSave = useCallback(async () => {
    const pid = projectIdRef.current;
    const p = projectRef.current;
    const cMap = contentsRef.current;
    if (!pid || !p?.files?.length || savingRef.current || editorActiveRef.current) return;
    savingRef.current = true;
    try {
      const payload = p.files.map((f) => ({ path: f.path, content: cMap[f.path] ?? f.content }));
      await saveIdeProject(pid, payload);
    } catch (_) { /* noop — 다음 변경 시 재시도 */ }
    finally { savingRef.current = false; }
  }, []);
  const scheduleAgentSave = useCallback(() => {
    if (editorActiveRef.current) return; // IDE 가 열려 있으면 MobileIDE 가 저장 담당
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void doAgentSave(); }, 1500);
  }, [doAgentSave]);

  // ── 에이전트 파일 동기화(데이터 경로) ──
  // 에이전트가 워크스페이스 파일을 만들/고치면 그 내용을 읽어 contents/트리에 반영.
  // (터미널 출력 등 UI side-effect 는 MobileIDE 가 별도 구독해 처리)
  const applyAgentFile = useCallback(async (relPath: string) => {
    const pid = projectIdRef.current;
    if (!pid || !relPath) return;
    const res = await getAgentFile(relPath, pid);
    if (projectIdRef.current !== pid) return;
    if (!res.success || !res.data) return;
    const content = res.data.content;
    setContents((c) => ({ ...c, [relPath]: content }));
    setProject((p) => {
      if (!p) return p;
      if (p.files.some((f) => f.path === relPath) || p.assets.some((a) => a.path === relPath)) {
        return { ...p, files: p.files.map((f) => (f.path === relPath ? { ...f, content } : f)) };
      }
      const language = (relPath.split('.').pop() || '').toLowerCase();
      return { ...p, files: [...p.files, { path: relPath, language, content }] };
    });
    subsRef.current.forEach((cb) => { try { cb(relPath, content); } catch (_) { /* noop */ } });
    scheduleAgentSave();
  }, [scheduleAgentSave]);

  const toolRelRef = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    const off = registerEventListener((evt) => {
      if (evt.type === 'tool_use') {
        if (evt.relPath) toolRelRef.current[evt.toolUseId] = evt.relPath;
      } else if (evt.type === 'tool_result') {
        const rel = toolRelRef.current[evt.toolUseId];
        if (evt.ok && rel) void applyAgentFile(rel);
      }
    });
    return off;
  }, [registerEventListener, applyAgentFile]);

  const value: IdeProjectValue = {
    projectId,
    project,
    contents,
    loading,
    error,
    ready: !!readyId && readyId === projectId,
    setProject,
    setContents,
    ensureProject,
    reload,
    subscribeFileChange,
    setEditorActive,
    ideMounted,
    ideVisible,
    ideParams,
    openIde,
    closeIde,
  };

  return <IdeProjectContext.Provider value={value}>{children}</IdeProjectContext.Provider>;
};

export const useIdeProject = (): IdeProjectValue => {
  const ctx = useContext(IdeProjectContext);
  if (!ctx) throw new Error('useIdeProject must be used within IdeProjectProvider');
  return ctx;
};
