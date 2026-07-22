// handoffActions.ts — 프리뷰 세션 핸드오프(pull/push) 오케스트레이션.
//  프레임 왕복은 notificationService, 실제 캡처/복원(셸 접근 필요)은 UiCommandBridge 가
//  setHandoffLocal 로 주입한 로컬 핸들러가 담당한다(UI 버튼·CLI 공용 진입점).
import notificationService from '../services/notificationService';
import type { PreviewManifest } from '../services/previewSession';
import { saveSnapshot, listSnapshots, loadSnapshot, type SnapshotMeta } from '../services/previewSnapshots';
import { getDeviceLabel } from '../services/daemonService';

type Restore = (m: PreviewManifest) => Promise<unknown>;
type Capture = () => Promise<PreviewManifest | null>;

let _restore: Restore | null = null;
let _capture: Capture | null = null;

/** UiCommandBridge 가 마운트 시 셸 접근 캡처/복원 핸들러를 등록. */
export function setHandoffLocal(h: { restore: Restore; capture: Capture } | null): void {
  _restore = h?.restore ?? null;
  _capture = h?.capture ?? null;
}

/** 이어받기(pull) — 다른 기기 프리뷰를 이 기기로. */
export async function pullPreviewSession(): Promise<{ ok: boolean; error?: string; from?: { deviceName?: string } }> {
  const payload = await notificationService.requestHandoff('preview');
  if (!payload?.ok || !payload.manifest) return { ok: false, error: payload?.error || '이어받을 프리뷰가 없어요' };
  if (!_restore) return { ok: false, error: '준비 중이에요' };
  try { await _restore(payload.manifest as PreviewManifest); return { ok: true, from: payload.from }; }
  catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

/** 보내기(push) — 이 기기 프리뷰를 지정 기기로. (레거시 실시간 경로 — UI 는 스냅샷 모델 사용) */
export async function pushPreviewSession(target: { deviceId?: number; clientKey?: string }, wsLocalPath?: string): Promise<{ ok: boolean; error?: string }> {
  if (!_capture) return { ok: false, error: '준비 중이에요' };
  let manifest: PreviewManifest | null = null;
  try { manifest = await _capture(); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  if (!manifest) return { ok: false, error: '보낼 프리뷰가 없어요' };
  const ack = await notificationService.pushHandoff(target, manifest, wsLocalPath);
  return ack?.ok ? { ok: true } : { ok: false, error: ack?.error || '보내기 실패' };
}

// ── PC 저장 스냅샷 모델 ────────────────────────────────────────────────
//  올리기 = 현재 프리뷰 캡처 → 연결된 PC(호스트) 워크스페이스에 스냅샷 저장.
//  내려받기 = PC 스냅샷 목록 조회 → 선택 → 해당 매니페스트 복원.

/** 올리기(스냅샷 저장) — 현재 프리뷰를 PC 워크스페이스에 저장. */
export async function saveSnapshotAction(wsLocalPath: string, host: number | null): Promise<{ ok: boolean; error?: string; label?: string }> {
  if (!_capture) return { ok: false, error: '준비 중이에요' };
  let manifest: PreviewManifest | null = null;
  try { manifest = await _capture(); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  if (!manifest) return { ok: false, error: '저장할 프리뷰가 없어요' };
  try {
    const meta = await saveSnapshot(wsLocalPath, host, manifest, getDeviceLabel());
    return { ok: true, label: meta.label };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

/** 스냅샷 목록 조회(내려받기 시트용). */
export async function listSnapshotsAction(wsLocalPath: string, host: number | null): Promise<SnapshotMeta[]> {
  try { return await listSnapshots(wsLocalPath, host); } catch (_) { return []; }
}

/** 내려받기(스냅샷 복원) — 선택한 스냅샷을 이 기기 프리뷰로 복원. */
export async function applySnapshotAction(wsLocalPath: string, host: number | null, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!_restore) return { ok: false, error: '준비 중이에요' };
  let manifest: PreviewManifest | null = null;
  try { manifest = await loadSnapshot(wsLocalPath, host, id); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  if (!manifest) return { ok: false, error: '스냅샷을 불러올 수 없어요' };
  try { await _restore(manifest); return { ok: true }; }
  catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}
