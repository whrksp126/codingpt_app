// convCache.ts — 채팅 v2 대화의 기기 로컬 캐시(chat-v2-design.md §10.9).
//
// 왜 두는가: 폰은 PC 와 멀리 있다. 탭을 열 때마다 빈 화면에서 시작해 릴레이 왕복을 기다리면 "방금 보던
//  대화"조차 1~2초 뒤에 나타난다. 캐시를 먼저 그리고 `conv.since(캐시 headSeq)` 로 화해한다 — **정본은 데몬**이고
//  캐시는 틀려도 되는 사본이다(틀리면 since 가 고치거나 open 으로 통째로 다시 받는다).
//
// 모양:
//  · 색인 = AsyncStorage(작은 값) — 어떤 대화가 캐시돼 있고 언제 썼는지.
//  · 본문 = 파일 `DocumentDir/cpt-conv/<계정>-<host>-<threadId>.json` — thread 당 최근 300 이벤트.
//    AsyncStorage 에 본문을 넣지 않는다: Android 는 한 행 2MB·전체 6MB 상한이라 대화 몇 개로 저장소가 통째로 막힌다.
//
// 규율:
//  · **로그아웃 시 전부 삭제**(다른 계정이 이전 계정의 대화를 보면 안 된다).
//  · 종단간 암호화 정책이 `required` 면 **캐시하지 않는다** — 평문 대화를 디스크에 남기지 않겠다는 설정이다.
//  · 실패는 전부 조용히 넘긴다. 캐시가 없으면 조금 느릴 뿐이고, 캐시 때문에 화면이 죽으면 안 된다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import type { ConvEvent, Thread } from '../workspace/conv/convModel';

export const CACHE_INDEX_KEY = 'cpt.conv.cache.v1';
export const CACHE_DIR = 'cpt-conv';
/** 캐시해 두는 대화 수 상한 — 넘으면 가장 오래 안 쓴 것부터 지운다. */
export const CACHE_MAX_THREADS = 40;
const VERSION = 1;

export interface CacheSnapshot {
  v: number;
  threadId: string;
  thread: Thread | null;
  events: ConvEvent[];
  headSeq: number;
  floorSeq: number;
  at: number;
}

interface IndexRow { file: string; account: string; host: string; threadId: string; at: number; headSeq: number }
type Index = Record<string, IndexRow>;

/** 파일 이름에 쓸 수 있는 글자만 남긴다 — 계정·호스트·threadId 는 밖에서 온 값이다(경로 탈출 금지). */
export function safePart(v: unknown): string {
  return String(v == null ? '' : v).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || '_';
}

export function cacheName(account: unknown, host: unknown, threadId: string): string {
  return `${safePart(account)}-${safePart(host == null ? 'local' : host)}-${safePart(threadId)}.json`;
}

function dir(): string | null {
  try {
    const d = ReactNativeBlobUtil.fs.dirs.DocumentDir;
    return d ? `${d}/${CACHE_DIR}` : null;
  } catch (_) { return null; }
}

/** 캐시해도 되는가 — 암호화 정책이 required 면 아니다. 정책을 못 읽으면 캐시한다(기본은 preferred). */
export function cacheAllowed(): boolean {
  try {
    const st = require('./e2ee').default.getStatus();
    return !(st && st.policy === 'required');
  } catch (_) { return true; }
}

async function readIndex(): Promise<Index> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Index) : {};
  } catch (_) { return {}; }
}
async function writeIndex(ix: Index): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(ix)); } catch (_) { /* noop */ }
}

// 색인은 읽고-고치고-쓰는 값이다 → 동시에 두 저장이 돌면 한쪽이 덮인다. 한 줄로 세운다.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => { /* 다음 작업이 앞의 실패에 묶이지 않게 */ });
  return next;
}

export async function loadConv(account: unknown, host: unknown, threadId: string): Promise<CacheSnapshot | null> {
  if (!threadId || !cacheAllowed()) return null;
  const d = dir();
  if (!d) return null;
  const file = `${d}/${cacheName(account, host, threadId)}`;
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(file))) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(file, 'utf8');
    const snap = JSON.parse(String(raw));
    // 다른 대화의 파일이 같은 이름으로 접혔을 수 있다(글자 치환) → 본문의 threadId 로 한 번 더 확인한다.
    if (!snap || snap.v !== VERSION || snap.threadId !== threadId || !Array.isArray(snap.events)) return null;
    return snap as CacheSnapshot;
  } catch (_) {
    // 깨진 파일(쓰다가 앱이 죽음)은 다음에도 깨져 있다 → 지운다.
    try { await ReactNativeBlobUtil.fs.unlink(file); } catch (_e) { /* noop */ }
    return null;
  }
}

export function saveConv(account: unknown, host: unknown, threadId: string, snap: Omit<CacheSnapshot, 'v' | 'threadId' | 'at'>, now = Date.now()): Promise<boolean> {
  return serial(async () => {
    if (!threadId || !cacheAllowed()) return false;
    const d = dir();
    if (!d) return false;
    const name = cacheName(account, host, threadId);
    try {
      await ReactNativeBlobUtil.fs.mkdir(d).catch(() => { /* 이미 있다 */ });
      const body: CacheSnapshot = { v: VERSION, threadId, thread: snap.thread, events: snap.events, headSeq: snap.headSeq, floorSeq: snap.floorSeq, at: now };
      await ReactNativeBlobUtil.fs.writeFile(`${d}/${name}`, JSON.stringify(body), 'utf8');
      const ix = await readIndex();
      ix[name] = { file: name, account: safePart(account), host: safePart(host == null ? 'local' : host), threadId, at: now, headSeq: snap.headSeq };
      const rows = Object.values(ix).sort((a, b) => b.at - a.at);
      for (const old of rows.slice(CACHE_MAX_THREADS)) {
        delete ix[old.file];
        try { await ReactNativeBlobUtil.fs.unlink(`${d}/${old.file}`); } catch (_e) { /* noop */ }
      }
      await writeIndex(ix);
      return true;
    } catch (_) { return false; }
  });
}

/** 대화 하나의 캐시를 지운다(conv.remove · control deleted). */
export function removeConv(account: unknown, host: unknown, threadId: string): Promise<void> {
  return serial(async () => {
    const d = dir();
    const name = cacheName(account, host, threadId);
    if (d) { try { await ReactNativeBlobUtil.fs.unlink(`${d}/${name}`); } catch (_) { /* 없으면 없는 대로 */ } }
    const ix = await readIndex();
    if (ix[name]) { delete ix[name]; await writeIndex(ix); }
  });
}

/** 전부 삭제 — 로그아웃. 색인에 없는 고아 파일까지 폴더째 지운다. */
export function clearAll(): Promise<void> {
  return serial(async () => {
    const d = dir();
    if (d) {
      try {
        if (await ReactNativeBlobUtil.fs.exists(d)) await ReactNativeBlobUtil.fs.unlink(d);
      } catch (_) {
        // 폴더째 못 지우면 색인에 적힌 파일이라도 하나씩 지운다.
        const ix = await readIndex();
        for (const r of Object.values(ix)) { try { await ReactNativeBlobUtil.fs.unlink(`${d}/${r.file}`); } catch (_e) { /* noop */ } }
      }
    }
    try { await AsyncStorage.removeItem(CACHE_INDEX_KEY); } catch (_) { /* noop */ }
  });
}

/** 색인 — 진단·테스트용. */
export async function listCached(): Promise<IndexRow[]> {
  return Object.values(await readIndex()).sort((a, b) => b.at - a.at);
}

export default { loadConv, saveConv, removeConv, clearAll, listCached, cacheAllowed, cacheName, safePart };
