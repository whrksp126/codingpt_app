// previewSnapshots.ts — 프리뷰 세션 스냅샷을 "연결된 PC(호스트)의 워크스페이스" 에 파일로 저장/조회.
//  홈서버(objectstore) 미사용 — 데몬 fs RPC 로 워크스페이스 안 히든 폴더에 직접 쓴다(쿠키=자격증명은 PC 에만).
//   <ws>/.codingpt/snapshots/index.json  = [{id,label,createdAt,device,url}] (최신순, 최대 MAX)
//   <ws>/.codingpt/snapshots/<id>.json    = { ...meta, manifest }
//   <ws>/.codingpt/.gitignore = "*"  (쿠키 커밋 방지)
import daemonService from './daemonService';
import type { PreviewManifest } from './previewSession';

const MAX = 20;
const clean = (p: string) => p.replace(/\/+$/, '');
const dirOf = (ws: string) => `${clean(ws)}/.codingpt/snapshots`;

export interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: number;
  device: string;
  url: string;
}

function labelFor(url: string): string {
  if (!url) return '프리뷰';
  const m = /^:(\d+)(.*)$/.exec(url);
  if (m) return ':' + m[1] + (m[2] ? m[2].split(/[?#]/)[0] : '');
  try { const u = url.replace(/^https?:\/\//, ''); return u.slice(0, 40); } catch (_) { return url.slice(0, 40); }
}

async function readIndex(ws: string, host?: number | null): Promise<SnapshotMeta[]> {
  try {
    const r = await daemonService.fsRead(`${dirOf(ws)}/index.json`, { host: host ?? null });
    const arr = JSON.parse(r.content || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

async function writeIndex(ws: string, list: SnapshotMeta[], host?: number | null): Promise<void> {
  await daemonService.fsWrite(`${dirOf(ws)}/index.json`, JSON.stringify(list), host ?? null);
}

/** 현재 프리뷰 매니페스트를 스냅샷으로 저장(연결된 PC 워크스페이스). 저장된 메타 반환. */
export async function saveSnapshot(ws: string, host: number | null, manifest: PreviewManifest, device: string): Promise<SnapshotMeta> {
  await daemonService.fsMkdir(dirOf(ws), host);
  try { await daemonService.fsWrite(`${clean(ws)}/.codingpt/.gitignore`, '*\n', host); } catch (_) { /* gitignore 실패 무시 */ }
  const id = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  const url = manifest.externalUrl || (manifest.logical ? ':' + manifest.logical.port + (manifest.logical.path || '') : '');
  const meta: SnapshotMeta = { id, label: labelFor(url), createdAt: Date.now(), device, url };
  await daemonService.fsWrite(`${dirOf(ws)}/${id}.json`, JSON.stringify({ ...meta, manifest }), host);
  let list = [meta, ...(await readIndex(ws, host)).filter((s) => s.id !== id)];
  const pruned = list.slice(MAX);
  list = list.slice(0, MAX);
  for (const p of pruned) { try { await daemonService.fsDelete(`${dirOf(ws)}/${p.id}.json`, host); } catch (_) { /* noop */ } }
  await writeIndex(ws, list, host);
  return meta;
}

/** 스냅샷 목록(메타만) — 내려받기 시트에서 선택용. */
export async function listSnapshots(ws: string, host?: number | null): Promise<SnapshotMeta[]> {
  return readIndex(ws, host);
}

/** 특정 스냅샷의 전체 매니페스트 로드(복원용). */
export async function loadSnapshot(ws: string, host: number | null, id: string): Promise<PreviewManifest | null> {
  try {
    const r = await daemonService.fsRead(`${dirOf(ws)}/${id}.json`, { host: host ?? null });
    const obj = JSON.parse(r.content || '{}');
    return obj.manifest || null;
  } catch (_) { return null; }
}

/** 스냅샷 삭제. */
export async function deleteSnapshot(ws: string, host: number | null, id: string): Promise<void> {
  try { await daemonService.fsDelete(`${dirOf(ws)}/${id}.json`, host); } catch (_) { /* noop */ }
  const list = (await readIndex(ws, host)).filter((s) => s.id !== id);
  await writeIndex(ws, list, host);
}
