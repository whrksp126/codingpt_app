// 앱 업데이트 감지 — "터미널이 빨간 글씨로 거절할 때" 가 아니라 **그 전에** 알려주기 위한 공용 정본.
//
// 왜 이 파일이 있나(2026-09-07 사용자 보고):
//   구버전 앱으로 접속했는데 어디에도 안내가 없다가, 터미널을 여는 순간에야 데몬이
//   "[앱/PC 버전이 오래됐습니다]" 를 빨간 글씨로 뱉었다. 그때는 이미 기능이 막힌 뒤다.
//   업데이트 확인이 **설정 화면을 열었을 때만** 돌고 있었던 게 원인이다(SettingsModal 안에 갇혀 있었다).
//
// 여기서 하는 일:
//   · 앱 시작 / 포그라운드 복귀 때 조회(6시간 스로틀 — 부팅마다 두들기지 않는다)
//   · 결과를 구독 가능한 스냅샷으로 들고 있어 배너·터미널 실패 화면·설정이 **한 벌**을 본다
//   · minVersion(서버 킬스위치)보다 낮으면 required=true — 미루기 없이 업데이트해야 하는 상태
//
// 조회 실패는 "최신" 이 아니라 **모름**으로 둔다. 네트워크 한 번 실패했다고 안내를 지우면
// 있던 배너가 깜빡이며 사라진다.
import { AppState, Platform, Linking } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { BACK_URL } from '../utils/service';

export interface UpdateSnapshot {
  /** 스토어 최신 버전(모르면 ''). */
  latest: string;
  /** 이 기기에 설치된 버전. */
  current: string;
  /** 최신이 더 높다 = 업데이트 있음. */
  available: boolean;
  /** 서버가 정한 최소 버전보다 낮다 = 미루면 안 되는 상태. */
  required: boolean;
  /** 스토어 링크(서버 제공). 없으면 기본 스토어 URL. */
  url: string;
}

const STORE_FALLBACK = {
  ios: 'https://apps.apple.com/app/id6751457159',
  android: 'https://play.google.com/store/apps/details?id=com.ghmate.codingpt.app',
};

/** semver 비교 — a 가 b 보다 높으면 true. */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

const platformKey = (): 'ios' | 'android' => (Platform.OS === 'ios' ? 'ios' : 'android');

let snapshot: UpdateSnapshot = { latest: '', current: '', available: false, required: false, url: '' };
let dismissedFor = '';      // 사용자가 "나중에" 한 버전 — 그 버전에 대해서만 배너를 숨긴다
let lastCheckedAt = 0;
let inFlight: Promise<UpdateSnapshot> | null = null;
const listeners = new Set<() => void>();

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (_) { /* 리스너 하나가 죽어도 나머지는 간다 */ } }); };

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getSnapshot(): UpdateSnapshot { return snapshot; }

/** 배너를 지금 띄워야 하나 — 필수 업데이트는 "나중에" 를 무시한다. */
export function shouldPrompt(): boolean {
  if (!snapshot.available) return false;
  if (snapshot.required) return true;
  return dismissedFor !== snapshot.latest;
}

/** 이 버전에 대해서만 배너를 접는다(다음 릴리스가 나오면 다시 뜬다). */
export function dismiss(): void {
  if (snapshot.required) return; // 필수는 접을 수 없다
  dismissedFor = snapshot.latest;
  emit();
}

export function storeUrl(): string {
  return snapshot.url || STORE_FALLBACK[platformKey()];
}

export function openStore(): void {
  Linking.openURL(storeUrl()).catch(() => { /* 스토어 앱이 없거나 링크 불가 — 조용히 무시 */ });
}

async function fetchLatest(): Promise<UpdateSnapshot> {
  const current = String(DeviceInfo.getVersion() || '');
  try {
    const res = await fetch(`${BACK_URL}/api/app/version?platform=${platformKey()}`);
    const json = await res.json();
    const d = json?.data ?? json;
    const latest = String(d?.version || '');
    const minVersion = String(d?.minVersion || '');
    const url = String(d?.url || '');
    if (!latest) return snapshot; // 모름 — 기존 스냅샷 유지
    return {
      latest,
      current,
      available: isNewerVersion(latest, current),
      required: !!minVersion && isNewerVersion(minVersion, current),
      url,
    };
  } catch (_) {
    return snapshot; // 조회 실패 = 모름. "최신" 으로 단정하지 않는다
  }
}

/** 업데이트 확인. force=false 면 6시간 스로틀. 동시 호출은 한 건으로 합쳐진다. */
export async function check(force = false): Promise<UpdateSnapshot> {
  if (!force && Date.now() - lastCheckedAt < CHECK_INTERVAL_MS && snapshot.latest) return snapshot;
  if (inFlight) return inFlight;
  inFlight = fetchLatest()
    .then((next) => {
      lastCheckedAt = Date.now();
      const changed = next.latest !== snapshot.latest || next.available !== snapshot.available || next.required !== snapshot.required;
      snapshot = next;
      if (changed) emit();
      return snapshot;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

let started = false;
/** 앱 시작 시 1회. 이후 포그라운드 복귀마다 재확인(스로틀 적용). */
export function startAutoCheck(): () => void {
  if (started) return () => { /* 이미 돌고 있다 */ };
  started = true;
  check(true).catch(() => { /* noop */ });
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') check(false).catch(() => { /* noop */ });
  });
  return () => { sub.remove(); started = false; };
}

export default { subscribe, getSnapshot, shouldPrompt, dismiss, openStore, storeUrl, check, startAutoCheck, isNewerVersion };
