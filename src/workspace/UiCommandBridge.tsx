// UiCommandBridge — 원격 ui_command 프레임(agent stream WSS 동승)을 화면 조작으로 실행하는 브리지.
//   PC/에이전트가 보낸 {type:'ui_command', uiId, cmd, params, executor} 를 받아 워크스페이스 셸을
//   조작하고, executor=true 면 같은 소켓으로 {type:'ui_result'} 를 회신한다(SSE 폴백은 회신 불가 → 미처리).
//   params.ws = 워크스페이스 cwd(localPath). 대상이 활성이 아니면 setActive 후 커밋을 기다려 조작한다.
import { useEffect, useRef } from 'react';
import { useWorkspaceShell, WsRuntime } from '../contexts/WorkspaceShellContext';
import notificationService, { UiCommandFrame } from '../services/notificationService';
import type { WorkspaceMeta } from '../services/workspaceService';
import * as T from './tiling';
import { getPaneRect } from './paneRegistry';
import { getPreviewControl, getIdeControl } from './uiControls';
import { getAutomation } from '../services/previewAutomation';
import { setHandoffLocal } from './handoffActions';
import type { PreviewManifest } from '../services/previewSession';

// WorkspaceView smartAdd 와 동일 상수(자동 배치 판정).
const HEAD_H = 34;
const MIN_W = 300;
const MIN_H = 220;

// direction → 분할 side 매핑(left/right/up→top/down→bottom).
const SIDE_MAP: Record<string, Exclude<T.Side, null>> = { left: 'left', right: 'right', up: 'top', down: 'bottom' };

// 혼합 탭 표면 키 — PaneView keyOf 미러(tid 우선. 생성 경로가 모두 tid 를 부여하므로 사실상 tid).
const tabKeyOf = (t: T.TerminalTab) => t.tid || `${t.kind}:${t.openPath ?? t.url ?? ''}`;

// 프리뷰 표면 탐색 결과 — 독립 leaf 우선, 없으면 터미널 pane 의 혼합 preview 탭.
type PreviewHit =
  | { kind: 'leaf'; leaf: T.PreviewLeaf }
  | { kind: 'tab'; leaf: T.TerminalLeaf; index: number };

function findPreview(rt: WsRuntime): PreviewHit | null {
  let leafHit: T.PreviewLeaf | null = null;
  let tabHit: { leaf: T.TerminalLeaf; index: number } | null = null;
  T.eachLeaf(rt.layout, (l) => {
    if (!leafHit && l.kind === 'preview') leafHit = l;
    if (!tabHit && l.kind === 'terminal') {
      const i = l.tabs.findIndex((t) => t.kind === 'preview');
      if (i >= 0) tabHit = { leaf: l, index: i };
    }
  });
  if (leafHit) return { kind: 'leaf', leaf: leafHit };
  if (tabHit) return { kind: 'tab', leaf: (tabHit as { leaf: T.TerminalLeaf; index: number }).leaf, index: (tabHit as { leaf: T.TerminalLeaf; index: number }).index };
  return null;
}

// browser.* 대상 프리뷰 표면 키 — 포커스 pane(프리뷰 leaf/활성 프리뷰 탭) 우선, 없으면 첫 프리뷰.
function findPreviewSurfaceKey(rt: WsRuntime): string | null {
  const focusLeaf = rt.focusId ? T.findLeaf(rt.layout, rt.focusId) : null;
  if (focusLeaf?.kind === 'preview') return focusLeaf.tid || focusLeaf.id;
  if (focusLeaf?.kind === 'terminal') {
    const t = focusLeaf.tabs[focusLeaf.active];
    if (t && t.kind === 'preview') return tabKeyOf(t);
  }
  const hit = findPreview(rt);
  if (!hit) return null;
  return hit.kind === 'leaf' ? (hit.leaf.tid || hit.leaf.id) : tabKeyOf(hit.leaf.tabs[hit.index]);
}

// IDE 표면 탐색 — 독립 leaf 우선, 없으면 터미널 pane 의 혼합 ide 탭. (findPreview 미러)
type IdeHit =
  | { kind: 'leaf'; leaf: T.IdeLeaf }
  | { kind: 'tab'; leaf: T.TerminalLeaf; index: number };

function findIde(rt: WsRuntime): IdeHit | null {
  let leafHit: T.IdeLeaf | null = null;
  let tabHit: { leaf: T.TerminalLeaf; index: number } | null = null;
  T.eachLeaf(rt.layout, (l) => {
    if (!leafHit && l.kind === 'ide') leafHit = l;
    if (!tabHit && l.kind === 'terminal') {
      const i = l.tabs.findIndex((t) => t.kind === 'ide');
      if (i >= 0) tabHit = { leaf: l, index: i };
    }
  });
  if (leafHit) return { kind: 'leaf', leaf: leafHit };
  if (tabHit) return { kind: 'tab', leaf: (tabHit as { leaf: T.TerminalLeaf; index: number }).leaf, index: (tabHit as { leaf: T.TerminalLeaf; index: number }).index };
  return null;
}

// 표면(preview/ide) 제어 채널 키 — leaf 면 tid||id, 혼합 탭이면 탭 키.
const previewHitKey = (hit: PreviewHit) => hit.kind === 'leaf' ? (hit.leaf.tid || hit.leaf.id) : tabKeyOf(hit.leaf.tabs[hit.index]);
const ideHitKey = (hit: IdeHit) => hit.kind === 'leaf' ? hit.leaf.id : tabKeyOf(hit.leaf.tabs[hit.index]);

// 명령 파라미터의 type(terminal|preview|ide) → 새 leaf 생성(WorkspaceView smartAdd 의 leaf 생성 미러).
function makeLeaf(type: string, p: Record<string, any>): T.Leaf {
  if (type === 'preview') return { id: T.newPaneId(), kind: 'preview', url: typeof p.url === 'string' ? p.url : '' };
  if (type === 'ide') return { id: T.newPaneId(), kind: 'ide', openPath: typeof p.path === 'string' && p.path ? p.path : null };
  // 터미널 = 풀에 새 window 요청('new' + fresh — 미배치 터미널 입양 금지).
  return { id: T.newPaneId(), kind: 'terminal', tabs: [{ win: 'new', title: '', fresh: true }], active: 0 };
}

export default function UiCommandBridge() {
  const S = useWorkspaceShell();
  // 핸들러가 항상 최신 셸 상태/함수를 보도록 ref 경유(WorkspaceShellContext 기존 패턴).
  const SRef = useRef(S); SRef.current = S;

  useEffect(() => {
    // params.ws(localPath) → 워크스페이스 매칭. 없으면 throw(executor 는 ok:false 회신).
    const findWs = (p: Record<string, any>): WorkspaceMeta => {
      const ws = SRef.current.workspaces.find((w) => !!w.localPath && w.localPath === p.ws);
      if (!ws) throw new Error(`워크스페이스를 찾을 수 없어요: ${String(p.ws || '')}`);
      return ws;
    };

    // 대상이 활성이 아니면 setActive 먼저 — 커밋(activeWsIdRef 갱신) 대기 후 pane 조작
    //  (SidebarContent jumpNotif 의 setTimeout 지연과 동일한 이유).
    const ensureActive = async (wsId: string): Promise<void> => {
      if (SRef.current.activeWsId === wsId) return;
      SRef.current.setActive(wsId);
      await new Promise((r) => setTimeout(r, 120));
    };

    // ws 스코프 명령 공통 준비 — 매칭 + 활성화 + 런타임 확보.
    const target = async (p: Record<string, any>): Promise<{ ws: WorkspaceMeta; rt: WsRuntime }> => {
      const ws = findWs(p);
      await ensureActive(ws.id);
      const rt = SRef.current.wsRuntime(ws.id);
      if (!rt || !rt.layout) throw new Error('워크스페이스 런타임이 없어요');
      return { ws, rt };
    };

    // 표면 hit(독립 leaf | 터미널 pane 의 혼합 탭) 닫기 — leaf 는 pane 통째, 혼합 탭은 그 탭만 제거.
    const closeSurfaceHit = (
      wsId: string,
      hit: { kind: 'leaf'; leaf: T.Leaf } | { kind: 'tab'; leaf: T.TerminalLeaf; index: number },
    ): void => {
      if (hit.kind === 'leaf') { SRef.current.closePane(wsId, hit.leaf.id); return; }
      const tabs = hit.leaf.tabs.filter((_, i) => i !== hit.index);
      if (tabs.length === 0) { SRef.current.closePane(wsId, hit.leaf.id); return; }
      const active = Math.max(0, Math.min(hit.leaf.active, tabs.length - 1));
      SRef.current.setTerminalTabs(hit.leaf.id, tabs, active);
    };

    // 프리뷰 컨트롤이 restore 를 등록할 때까지 대기(새 프리뷰 마운트 레이스) — 최대 timeoutMs.
    const waitPreviewControl = (key: string, timeoutMs: number) => new Promise<ReturnType<typeof getPreviewControl>>((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const c = getPreviewControl(key);
        if (c?.restore) { resolve(c); return; }
        if (Date.now() - t0 > timeoutMs) { resolve(c); return; }
        setTimeout(tick, 80);
      };
      tick();
    });

    // IDE 컨트롤 등록 대기(새 IDE 분할 생성/혼합 탭 첫 마운트 레이스) — waitPreviewControl 미러.
    const waitIdeControl = (key: string, timeoutMs: number) => new Promise<ReturnType<typeof getIdeControl>>((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const c = getIdeControl(key);
        if (c) { resolve(c); return; }
        if (Date.now() - t0 > timeoutMs) { resolve(c); return; }
        setTimeout(tick, 80);
      };
      tick();
    });

    // 활성 워크스페이스의 프리뷰를 매니페스트로 캡처(pull 소스/push).
    const captureActive = async (): Promise<PreviewManifest | null> => {
      const wsId = SRef.current.activeWsId;
      if (!wsId) return null;
      const rt = SRef.current.wsRuntime(wsId);
      if (!rt || !rt.layout) return null;
      const key = findPreviewSurfaceKey(rt);
      if (!key) return null;
      const ctl = getPreviewControl(key);
      if (!ctl?.capture) return null;
      const cap = (await ctl.capture()) as { manifest?: PreviewManifest } | null;
      return (cap && cap.manifest) || null;
    };

    // 매니페스트를 활성 워크스페이스에 복원(프리뷰 표면 확보 후 restore).
    const restoreLocal = async (manifest: PreviewManifest): Promise<unknown> => {
      const wsId = SRef.current.activeWsId;
      if (!wsId) throw new Error('활성 워크스페이스가 없어요');
      const rt = SRef.current.wsRuntime(wsId);
      if (!rt || !rt.layout) throw new Error('워크스페이스 런타임이 없어요');
      let key: string;
      const hit = findPreview(rt);
      if (hit) {
        if (hit.kind === 'tab') { SRef.current.setTerminalTabs(hit.leaf.id, hit.leaf.tabs, hit.index); }
        SRef.current.focusPane(hit.leaf.id);
        key = previewHitKey(hit);
      } else {
        const focusId = rt.focusId || T.firstLeafId(rt.layout);
        if (!focusId) throw new Error('배치할 pane 이 없어요');
        const node: T.Leaf = { id: T.newPaneId(), kind: 'preview', url: '' };
        SRef.current.insertLeaf(focusId, 'right', node);
        key = node.id;
      }
      const ctl = await waitPreviewControl(key, 4000);
      if (!ctl?.restore) throw new Error('프리뷰가 준비되지 않았어요');
      return ctl.restore(manifest);
    };

    // 활성 IDE 상태(열린 활성 파일 + 줄) 캡처 — 스냅샷 IDE 파트.
    const captureIdeLocal = (): { path: string; line: number } | null => {
      const wsId = SRef.current.activeWsId;
      if (!wsId) return null;
      const rt = SRef.current.wsRuntime(wsId);
      if (!rt || !rt.layout) return null;
      const hit = findIde(rt);
      if (!hit) return null;
      const ctl = getIdeControl(ideHitKey(hit));
      const files = ctl?.listOpenFiles ? ctl.listOpenFiles() : [];
      const active = files.find((f) => f.active) || files[0];
      if (!active || !active.path) return null;
      return { path: active.path, line: 0 };
    };

    // IDE 상태 복원 — IDE 표면 확보 후 파일 열기(줄 이동).
    const restoreIdeLocal = (ide: { path: string; line: number }): void => {
      const wsId = SRef.current.activeWsId;
      if (!wsId) return;
      const rt = SRef.current.wsRuntime(wsId);
      if (!rt || !rt.layout) return;
      let ideLeaf: T.IdeLeaf | null = null;
      T.eachLeaf(rt.layout, (l) => { if (!ideLeaf && l.kind === 'ide') ideLeaf = l; });
      if (ideLeaf) {
        const leaf = ideLeaf as T.IdeLeaf;
        SRef.current.patchLeaf(leaf.id, { openPath: ide.path });
        getIdeControl(leaf.id)?.openFile(ide.path, ide.line || undefined);
      } else {
        const anchor = rt.focusId || T.firstLeafId(rt.layout);
        if (!anchor) return;
        const node: T.Leaf = { id: T.newPaneId(), kind: 'ide', openPath: ide.path };
        SRef.current.insertLeaf(anchor, 'right', node);
      }
    };

    // pull/push UI·프레임 진입점에 로컬 핸들러 등록.
    setHandoffLocal({ restore: restoreLocal, capture: captureActive, captureIde: captureIdeLocal, restoreIde: restoreIdeLocal });

    // ── 명령 핸들러 맵 ──
    const handle = async (f: UiCommandFrame): Promise<unknown> => {
      const p = f.params || {};
      switch (f.cmd) {
        // 풀 변경 통지 — 활성 워크스페이스 풀 리컨실 즉시 트리거.
        case 'pool.changed': {
          SRef.current.reconcilePoolNow();
          return undefined;
        }

        // 작업 상태 갱신 — 사이드바 워크스페이스 행 뱃지 표시용(화면 전환 없음).
        case 'status.changed': {
          const ws = findWs(p);
          const status = Array.isArray(p.status) ? p.status.map(String) : [];
          SRef.current.setWsStatusInfo(ws.id, status.length || p.logTail || typeof p.progress === 'number' ? {
            status,
            progress: typeof p.progress === 'number' ? p.progress : null,
            logTail: typeof p.logTail === 'string' ? p.logTail : null,
          } : null);
          return undefined;
        }

        // 워크스페이스 선택(id = 워크스페이스 id).
        case 'wsSelect': {
          const id = String(p.id || '');
          if (!id || !SRef.current.workspaces.some((w) => w.id === id)) throw new Error(`워크스페이스를 찾을 수 없어요: ${id}`);
          SRef.current.setActive(id);
          return undefined;
        }

        // 레이아웃 트리 조회 — 순수 JSON 회신.
        case 'layoutTree': {
          const { rt } = await target(p);
          return { tree: rt.layout, focusId: rt.focusId, device: 'mobile' };
        }

        // 지정 pane(생략=포커스) 을 방향 분할해 새 표면 삽입.
        case 'layoutSplit': {
          const { rt } = await target(p);
          const side = SIDE_MAP[String(p.direction || '')];
          if (!side) throw new Error(`direction 이 올바르지 않아요: ${String(p.direction || '')}`);
          const anchor = (typeof p.paneId === 'string' && p.paneId) || rt.focusId || T.firstLeafId(rt.layout);
          if (!anchor || !T.findLeaf(rt.layout, anchor)) throw new Error('대상 pane 을 찾을 수 없어요');
          const node = makeLeaf(String(p.type || 'terminal'), p);
          SRef.current.insertLeaf(anchor, side, node);
          return { paneId: node.id };
        }

        // 자동 배치 새 표면 — WorkspaceView smartAdd 재현(포커스 pane 우측/하단, 공간 없으면 혼합 탭).
        case 'newPane': {
          const { rt } = await target(p);
          const kind = String(p.type || 'terminal');
          const focusId = rt.focusId || T.firstLeafId(rt.layout);
          if (!focusId) throw new Error('배치할 pane 이 없어요');
          const focusLeaf = T.findLeaf(rt.layout, focusId);
          const r = getPaneRect(focusId);
          const canH = !!r && r.w / 2 >= MIN_W;
          const canV = !!r && (r.h - HEAD_H) / 2 >= MIN_H;
          let side: 'right' | 'bottom' | null = null;
          if (canH && canV) side = r!.w >= r!.h ? 'right' : 'bottom';
          else if (canH) side = 'right';
          else if (canV) side = 'bottom';
          if (!side && focusLeaf?.kind === 'terminal') {
            // 공간 부족 + 터미널 pane = 같은 영역 탭 추가(혼합 탭).
            const tab: T.TerminalTab = kind === 'terminal'
              ? { win: 'new', title: '', fresh: true }
              : kind === 'ide'
                ? { kind: 'ide', openPath: typeof p.path === 'string' && p.path ? p.path : null, tid: T.newPaneId() }
                : { kind: 'preview', url: typeof p.url === 'string' ? p.url : '', tid: T.newPaneId() };
            const tabs: T.TerminalTab[] = [...focusLeaf.tabs, tab];
            SRef.current.setTerminalTabs(focusId, tabs, tabs.length - 1);
            SRef.current.focusPane(focusId);
            return { paneId: focusId };
          }
          const node = makeLeaf(kind, p);
          SRef.current.insertLeaf(focusId, side || (r && r.h > r.w ? 'bottom' : 'right'), node);
          return { paneId: node.id };
        }

        case 'focusPane': {
          const { rt } = await target(p);
          const paneId = String(p.paneId || '');
          if (!paneId || !T.findLeaf(rt.layout, paneId)) throw new Error(`pane 을 찾을 수 없어요: ${paneId}`);
          SRef.current.focusPane(paneId);
          return undefined;
        }

        case 'closeSurface': {
          const { ws, rt } = await target(p);
          const paneId = String(p.paneId || '');
          if (!paneId || !T.findLeaf(rt.layout, paneId)) throw new Error(`pane 을 찾을 수 없어요: ${paneId}`);
          // 원격에서 온 close 적용 — 프리뷰가 포함돼도 재전파하지 않는다(루프 차단).
          notificationService.setApplyingRemoteClose(true);
          try { SRef.current.closePane(ws.id, paneId); } finally { notificationService.setApplyingRemoteClose(false); }
          return undefined;
        }

        case 'setRatio': {
          await target(p);
          const path = Array.isArray(p.path) ? p.path : null;
          if (!path || !path.every((k: any) => k === 'first' || k === 'second')) throw new Error('path 가 올바르지 않아요');
          const ratio = Number(p.ratio);
          if (!isFinite(ratio)) throw new Error('ratio 가 올바르지 않아요');
          SRef.current.setRatio(path as Array<'first' | 'second'>, ratio);
          return undefined;
        }

        // 프리뷰 열기 — 열린 프리뷰(leaf/혼합 탭)가 있으면 반드시 그 표면에 navigate+포커스(계약 §4).
        //  URL 해석(':5173'/포트 표기 → 데브서버 프록시)은 PreviewBody.load 가 담당(제어 채널 경유).
        case 'previewOpen': {
          const { rt } = await target(p);
          const url = String(p.url || '');
          if (!url) throw new Error('url 이 필요해요');
          const hit = findPreview(rt);
          if (hit) {
            // 표면 승계/마운트 직후엔 컨트롤이 아직 미등록일 수 있다 — 동기 조회(?.load)는 조용히
            //  no-op 돼 "기존 표면이 있는데 아무 일도 안 일어나는" 버그가 됐다. 등록을 기다렸다 로드.
            if (hit.kind === 'leaf') {
              SRef.current.patchLeaf(hit.leaf.id, { url });
            } else {
              const tabs = hit.leaf.tabs.map((t, i) => (i === hit.index ? { ...t, url } : t));
              SRef.current.setTerminalTabs(hit.leaf.id, tabs, hit.index); // 탭 활성화(본문 마운트)
            }
            SRef.current.focusPane(hit.leaf.id);
            const ctl = await waitPreviewControl(previewHitKey(hit), 4000);
            if (ctl) ctl.load(url);
            return { paneId: hit.leaf.id };
          }
          // 없으면 포커스 pane 우측 분할로 새로 연다(새 PreviewBody 가 마운트 시 url 을 스스로 로드).
          //  기기-타겟 라우팅이라 이 명령은 항상 "대상 기기 1곳"에서만 실행된다(구 broadcast 비-executor
          //  조용한 탭 편입 분기는 폐기 — 대상 기기에선 프리뷰를 눈에 띄게 여는 게 맞다).
          const focusId = rt.focusId || T.firstLeafId(rt.layout);
          if (!focusId) throw new Error('배치할 pane 이 없어요');
          const node: T.Leaf = { id: T.newPaneId(), kind: 'preview', url };
          SRef.current.insertLeaf(focusId, 'right', node);
          return { paneId: node.id };
        }

        // 첫 프리뷰 표면에 URL 로드(없으면 실패 — 생성은 previewOpen).
        case 'previewNavigate': {
          const { rt } = await target(p);
          const url = String(p.url || '');
          if (!url) throw new Error('url 이 필요해요');
          const hit = findPreview(rt);
          if (!hit) throw new Error('열린 프리뷰가 없어요');
          if (hit.kind === 'leaf') {
            SRef.current.patchLeaf(hit.leaf.id, { url });
            getPreviewControl(hit.leaf.tid || hit.leaf.id)?.load(url);
            return { paneId: hit.leaf.id };
          }
          const tab = hit.leaf.tabs[hit.index];
          const tabs = hit.leaf.tabs.map((t, i) => (i === hit.index ? { ...t, url } : t));
          // 활성 탭을 프리뷰로 강제 전환하지 않는다("처음 열 때만 보여주기" 정책) — 현재 활성 탭을 유지한
          //  채 url 만 갱신하고 백그라운드 프리뷰 인스턴스에 로드. 사용자가 프리뷰 탭을 직접 열면 반영됨.
          SRef.current.setTerminalTabs(hit.leaf.id, tabs, hit.leaf.active);
          getPreviewControl(tabKeyOf(tab))?.load(url);
          return { paneId: hit.leaf.id };
        }

        // 프리뷰 리로드 — PreviewBody 의 WebView.reload 를 제어 채널로 호출.
        case 'previewReload': {
          const { rt } = await target(p);
          const hit = findPreview(rt);
          if (!hit) throw new Error('열린 프리뷰가 없어요');
          const key = hit.kind === 'leaf' ? (hit.leaf.tid || hit.leaf.id) : tabKeyOf(hit.leaf.tabs[hit.index]);
          const ctl = getPreviewControl(key);
          if (!ctl) throw new Error('프리뷰가 아직 로드되지 않았어요');
          ctl.reload();
          return undefined;
        }

        // IDE 파일 열기 — IDE leaf 있으면 그 인스턴스 openFile(라이브) + openPath 패치, 없으면 분할 생성.
        case 'ideOpen': {
          const { rt } = await target(p);
          const path = String(p.path || '');
          if (!path) throw new Error('path 가 필요해요');
          const line = typeof p.line === 'number' ? p.line : undefined;
          let ideLeaf: T.IdeLeaf | null = null;
          T.eachLeaf(rt.layout, (l) => { if (!ideLeaf && l.kind === 'ide') ideLeaf = l; });
          if (ideLeaf) {
            const leaf = ideLeaf as T.IdeLeaf;
            SRef.current.patchLeaf(leaf.id, { openPath: path });
            getIdeControl(leaf.id)?.openFile(path, line);
            SRef.current.focusPane(leaf.id);
            return { paneId: leaf.id };
          }
          const anchor = rt.focusId || T.firstLeafId(rt.layout);
          if (!anchor) throw new Error('배치할 pane 이 없어요');
          const node: T.Leaf = { id: T.newPaneId(), kind: 'ide', openPath: path };
          SRef.current.insertLeaf(anchor, 'right', node);
          return { paneId: node.id };
        }

        // git diff 가상 문서(ui.ideDiff, 계약 §3) — IDE 표면(leaf/혼합 탭)에 읽기 전용 diff 탭 표시.
        //  같은 path 재호출은 IdeBody.openDiff 가 내용 갱신+포커스(중복 탭 금지). 표면 없으면 분할 생성.
        case 'ideDiff': {
          const { rt } = await target(p);
          const path = String(p.path || '');
          if (!path) throw new Error('path 가 필요해요');
          const diffText = typeof p.diffText === 'string' ? p.diffText : '';
          const hit = findIde(rt);
          let paneId: string;
          let key: string;
          if (hit) {
            // 혼합 탭이면 그 탭을 활성화(본문 마운트 — 컨트롤 등록 트리거).
            if (hit.kind === 'tab') SRef.current.setTerminalTabs(hit.leaf.id, hit.leaf.tabs, hit.index);
            paneId = hit.leaf.id;
            key = ideHitKey(hit);
          } else {
            const anchor = rt.focusId || T.firstLeafId(rt.layout);
            if (!anchor) throw new Error('배치할 pane 이 없어요');
            const node: T.Leaf = { id: T.newPaneId(), kind: 'ide', openPath: null };
            SRef.current.insertLeaf(anchor, 'right', node);
            paneId = node.id;
            key = node.id;
          }
          SRef.current.focusPane(paneId);
          const ctl = await waitIdeControl(key, 4000);
          if (!ctl?.openDiff) throw new Error('IDE 가 준비되지 않았어요');
          ctl.openDiff(path, diffText, !!p.truncated);
          return { paneId };
        }

        // 프리뷰 닫기 — 첫 프리뷰 표면(leaf/혼합 탭) 제거. (Phase 1: 각 기기 로컬 — sid 무시)
        case 'previewClose': {
          const { ws, rt } = await target(p);
          const hit = findPreview(rt);
          if (!hit) return undefined; // 없으면 멱등 성공
          // 원격에서 온 close 적용 — 이 닫힘은 재전파하지 않는다(루프 차단).
          notificationService.setApplyingRemoteClose(true);
          try { closeSurfaceHit(ws.id, hit); } finally { notificationService.setApplyingRemoteClose(false); }
          return undefined;
        }

        // 개발자도구 토글 — 보고 있는 기기(executor)의 프리뷰 인스턴스. on 생략 시 반전.
        case 'previewDevtools': {
          const { rt } = await target(p);
          const hit = findPreview(rt);
          if (!hit) throw new Error('열린 프리뷰가 없어요');
          const ctl = getPreviewControl(previewHitKey(hit));
          if (!ctl?.devtools) throw new Error('프리뷰가 아직 로드되지 않았어요');
          const on = typeof p.on === 'boolean' ? p.on : undefined;
          return { on: ctl.devtools(on) };
        }

        // Design Mode 요소 선택 시작/취소(ui.previewInspect, 라운드2 §2) — executor 기기의 프리뷰에
        //  1회성 선택 모드. off=취소. 선택 결과는 비동기(사용자 클릭 → [디자인] 줄 터미널 삽입)라
        //  여기선 모드 시작만 확인해 { on } 회신. 혼합 탭이면 그 탭을 활성화해 픽커가 보이게 한다.
        case 'previewInspect': {
          const { rt } = await target(p);
          const hit = findPreview(rt);
          if (!hit) throw new Error('열린 프리뷰가 없어요');
          if (hit.kind === 'tab') SRef.current.setTerminalTabs(hit.leaf.id, hit.leaf.tabs, hit.index);
          SRef.current.focusPane(hit.leaf.id);
          const ctl = await waitPreviewControl(previewHitKey(hit), 4000);
          if (!ctl?.inspect) throw new Error('프리뷰가 아직 로드되지 않았어요');
          return { on: ctl.inspect(!!p.off) };
        }

        // 프리뷰 현재 상태 조회(executor) — url/제목/뷰포트/기기.
        case 'previewInfo': {
          const { rt } = await target(p);
          const hit = findPreview(rt);
          if (!hit) throw new Error('열린 프리뷰가 없어요');
          const ctl = getPreviewControl(previewHitKey(hit));
          const info = ctl?.info ? ctl.info() : {};
          return { ...info, device: 'mobile' };
        }

        // IDE pane 닫기 — 첫 IDE 표면 제거. (Phase 1: 각 기기 로컬)
        case 'ideClose': {
          const { ws, rt } = await target(p);
          const hit = findIde(rt);
          if (!hit) return undefined;
          closeSurfaceHit(ws.id, hit);
          return undefined;
        }

        // 열린 파일 탭 하나 닫기 — IdeControl.closeFile(라이브).
        case 'ideCloseFile': {
          const { rt } = await target(p);
          const path = String(p.path || '');
          if (!path) throw new Error('path 가 필요해요');
          const hit = findIde(rt);
          if (!hit) throw new Error('열린 IDE 가 없어요');
          const ctl = getIdeControl(ideHitKey(hit));
          const closed = ctl?.closeFile ? ctl.closeFile(path) : false;
          return { skipped: !closed };
        }

        // 지금 열린 파일 목록(executor) — IdeControl.listOpenFiles.
        case 'ideList': {
          const { rt } = await target(p);
          const hit = findIde(rt);
          if (!hit) throw new Error('열린 IDE 가 없어요');
          const ctl = getIdeControl(ideHitKey(hit));
          const files = ctl?.listOpenFiles ? ctl.listOpenFiles() : [];
          return { files, device: 'mobile' };
        }

        // 핸드오프: 활성 프리뷰 캡처(pull 소스/CLI). ws 있으면 그 워크스페이스 활성화 후.
        case 'surfaceCapture': {
          const kind = p.kind === 'ide' ? 'ide' : 'preview';
          if (kind === 'ide') throw new Error('IDE 핸드오프 미지원');
          if (p.ws) { const ws = SRef.current.workspaces.find((w) => !!w.localPath && w.localPath === p.ws); if (ws) await ensureActive(ws.id); }
          const manifest = await captureActive();
          if (!manifest) throw new Error('프리뷰가 없어요');
          return { manifest, kind: 'preview' };
        }

        // 핸드오프: 매니페스트를 이 기기에 복원(push 타겟/CLI). ws 있으면 그 워크스페이스 활성화 후.
        case 'previewHandoff': {
          if (!p.manifest) throw new Error('manifest 가 필요해요');
          if (p.ws) { const ws = SRef.current.workspaces.find((w) => !!w.localPath && w.localPath === p.ws); if (ws) await ensureActive(ws.id); }
          await restoreLocal(p.manifest as PreviewManifest);
          return { ok: true };
        }

        default: {
          // browser.* — 프리뷰 페이지 자동화(snapshot/click/type/fill/eval/wait/get/screenshot).
          //  대상 = 활성 ws 의 첫(포커스 우선) 프리뷰 표면. 실행은 등록된 인스턴스(previewAutomation)로 위임
          //  (페이지 명령은 pageAgent 주입, screenshot 만 RN 측 captureRef).
          if (f.cmd.startsWith('browser.')) {
            const { rt } = await target(p);
            const key = findPreviewSurfaceKey(rt);
            if (!key) throw new Error('열린 프리뷰가 없어요');
            const auto = getAutomation(key);
            if (!auto) throw new Error('프리뷰가 아직 로드되지 않았어요');
            const method = f.cmd.slice('browser.'.length);
            if (method === 'screenshot') return auto.screenshot();
            // browser.console(계약 §3) — 상시 후크(__cptConsole) 링버퍼를 기존 eval 경로로 조회/비움,
            //  level/pattern/limit 필터는 RN 측에서 적용해 { entries, device } 로 회신.
            if (method === 'console') {
              if (p.clear) {
                await auto.run('eval', { js: '(window.__cptConsole&&window.__cptConsole.clear(),true)' });
                return { cleared: true, device: 'mobile' };
              }
              const raw = await auto.run('eval', { js: '(window.__cptConsole?window.__cptConsole.dump():[])' });
              let entries: { lv?: string; msg?: string; ts?: number; n?: number }[] = Array.isArray(raw) ? raw : [];
              const level = typeof p.level === 'string' && p.level ? p.level : null;
              if (level) entries = entries.filter((en) => !!en && en.lv === level);
              if (typeof p.pattern === 'string' && p.pattern) {
                let re: RegExp;
                try { re = new RegExp(p.pattern); } catch (_) { throw new Error('pattern 정규식이 올바르지 않아요'); }
                entries = entries.filter((en) => re.test(String(en?.msg || '')));
              }
              const limit = Number(p.limit) > 0 ? Math.floor(Number(p.limit)) : 100;
              return { entries: entries.slice(-limit), device: 'mobile' };
            }
            // browser.network(라운드2 §1) — 상시 후크(__cptNet) 링버퍼를 browser.console 과 동일하게
            //  eval 로 조회/비움, pattern(u 정규식)/status(4xx|5xx|err|숫자)/limit 필터는 RN 측 적용.
            if (method === 'network') {
              if (p.clear) {
                await auto.run('eval', { js: '(window.__cptNet&&window.__cptNet.clear(),true)' });
                return { cleared: true, device: 'mobile' };
              }
              const raw = await auto.run('eval', { js: '(window.__cptNet?window.__cptNet.dump():[])' });
              let entries: { n?: number; ts?: number; m?: string; u?: string; s?: number; ms?: number; err?: string }[] = Array.isArray(raw) ? raw : [];
              if (typeof p.pattern === 'string' && p.pattern) {
                let re: RegExp;
                try { re = new RegExp(p.pattern); } catch (_) { throw new Error('pattern 정규식이 올바르지 않아요'); }
                entries = entries.filter((en) => re.test(String(en?.u || '')));
              }
              const stat = p.status != null && p.status !== '' ? String(p.status) : null;
              if (stat) {
                entries = entries.filter((en) => {
                  const s = Number(en?.s || 0);
                  if (stat === '4xx') return s >= 400 && s <= 499;
                  if (stat === '5xx') return s >= 500 && s <= 599;
                  if (stat === 'err') return s === 0 || !!en?.err;
                  return s === Number(stat);
                });
              }
              const limit = Number(p.limit) > 0 ? Math.floor(Number(p.limit)) : 50;
              return { entries: entries.slice(-limit), device: 'mobile' };
            }
            return auto.run(method, p);
          }
          throw new Error(`지원하지 않는 명령: ${f.cmd}`);
        }
      }
    };

    notificationService.setUiCommandListener((f) => {
      void (async () => {
        try {
          const result = await handle(f);
          if (f.executor) notificationService.sendUiResult(f.uiId, true, result);
        } catch (e: any) {
          // executor 가 아니면 적용만 시도하고 실패는 조용히 무시.
          if (f.executor) notificationService.sendUiResult(f.uiId, false, undefined, String(e?.message || e));
        }
      })();
    });
    return () => { notificationService.setUiCommandListener(null); setHandoffLocal(null); };
  }, []);

  return null;
}
