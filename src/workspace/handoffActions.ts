// handoffActions.ts — 프리뷰 세션 핸드오프(pull/push) 오케스트레이션.
//  프레임 왕복은 notificationService, 실제 캡처/복원(셸 접근 필요)은 UiCommandBridge 가
//  setHandoffLocal 로 주입한 로컬 핸들러가 담당한다(UI 버튼·CLI 공용 진입점).
import type { PreviewManifest } from '../services/previewSession';
import { saveSnapshot, listSnapshots, loadSnapshot, type SnapshotMeta, type IdeState } from '../services/previewSnapshots';
import { getDeviceLabel } from '../services/daemonService';

type Restore = (m: PreviewManifest) => Promise<unknown>;
type Capture = () => Promise<PreviewManifest | null>;
type CaptureIde = () => IdeState | null;
type RestoreIde = (ide: IdeState) => void;

let _restore: Restore | null = null;
let _capture: Capture | null = null;
let _captureIde: CaptureIde | null = null;
let _restoreIde: RestoreIde | null = null;

/** UiCommandBridge 가 마운트 시 셸 접근 캡처/복원 핸들러를 등록. */
export function setHandoffLocal(h: { restore: Restore; capture: Capture; captureIde?: CaptureIde; restoreIde?: RestoreIde } | null): void {
  _restore = h?.restore ?? null;
  _capture = h?.capture ?? null;
  _captureIde = h?.captureIde ?? null;
  _restoreIde = h?.restoreIde ?? null;
}

// ── PC 저장 스냅샷 모델 ────────────────────────────────────────────────
//  올리기 = 현재 프리뷰 캡처 → 연결된 PC(호스트) 워크스페이스에 스냅샷 저장.
//  내려받기 = PC 스냅샷 목록 조회 → 선택 → 해당 매니페스트 복원.

/** 올리기(스냅샷 저장) — 현재 프리뷰 + IDE 상태를 PC 워크스페이스에 저장(작업 전체 이어하기). */
export async function saveSnapshotAction(wsLocalPath: string, host: number | null): Promise<{ ok: boolean; error?: string; label?: string }> {
  if (!_capture) return { ok: false, error: '준비 중이에요' };
  let manifest: PreviewManifest | null = null;
  try { manifest = await _capture(); } catch (_) { manifest = null; }
  const ide: IdeState | null = _captureIde ? _captureIde() : null;
  if (!manifest && !ide) return { ok: false, error: '저장할 프리뷰나 IDE가 없어요' };
  try {
    const meta = await saveSnapshot(wsLocalPath, host, { manifest, ide }, getDeviceLabel());
    return { ok: true, label: meta.label };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

/** 스냅샷 목록 조회(내려받기 시트용). */
export async function listSnapshotsAction(wsLocalPath: string, host: number | null): Promise<SnapshotMeta[]> {
  try { return await listSnapshots(wsLocalPath, host); } catch (_) { return []; }
}

/** 내려받기(스냅샷 복원) — 선택한 스냅샷을 이 기기에 복원(프리뷰 + IDE). */
export async function applySnapshotAction(wsLocalPath: string, host: number | null, id: string): Promise<{ ok: boolean; error?: string }> {
  let bundle: Awaited<ReturnType<typeof loadSnapshot>> = null;
  try { bundle = await loadSnapshot(wsLocalPath, host, id); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  if (!bundle) return { ok: false, error: '스냅샷을 불러올 수 없어요' };
  let err: string | null = null;
  if (bundle.manifest && _restore) { try { await _restore(bundle.manifest); } catch (e: any) { err = String(e?.message || e); } }
  if (bundle.ide && _restoreIde) { try { _restoreIde(bundle.ide); } catch (_) { /* IDE 복원 실패는 무시(프리뷰 우선) */ } }
  return err ? { ok: false, error: err } : { ok: true };
}
