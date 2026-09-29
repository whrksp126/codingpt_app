/**
 * 채팅 v2 로컬 캐시(chat-v2-design.md §10.9).
 *
 * 고정하는 것:
 *  · 파일 이름 = `<계정>-<host>-<threadId>.json`, 밖에서 온 값으로 경로를 탈출할 수 없다.
 *  · 암호화 정책이 required 면 **쓰지도 읽지도 않는다**(평문 대화를 디스크에 남기지 않는다).
 *  · 로그아웃(clearAll)하면 파일·색인이 전부 사라진다.
 *  · 다른 대화의 파일이 같은 이름으로 접혀도 본문의 threadId 가 다르면 쓰지 않는다.
 */
// 공용 목(jest.setup.js)의 blob-util 에는 파일 API 가 없다 → 이 파일 안에서 메모리 파일시스템으로 바꿔 끼운다.
const mockFiles = new Map<string, string>();
const mockDirs = new Set<string>();
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { DocumentDir: '/doc' },
      exists: jest.fn(async (p: string) => mockFiles.has(p) || mockDirs.has(p)),
      mkdir: jest.fn(async (p: string) => { if (mockDirs.has(p)) throw new Error('exists'); mockDirs.add(p); }),
      readFile: jest.fn(async (p: string) => { if (!mockFiles.has(p)) throw new Error('ENOENT'); return mockFiles.get(p); }),
      writeFile: jest.fn(async (p: string, data: string) => { mockFiles.set(p, data); }),
      unlink: jest.fn(async (p: string) => {
        if (mockDirs.has(p)) { mockDirs.delete(p); for (const k of [...mockFiles.keys()]) if (k.startsWith(p + '/')) mockFiles.delete(k); return; }
        if (!mockFiles.has(p)) throw new Error('ENOENT');
        mockFiles.delete(p);
      }),
    },
  },
}));
const mockE2ee = { getStatus: jest.fn(() => ({ policy: 'preferred' })) };
jest.mock('../src/services/e2ee', () => ({ __esModule: true, default: mockE2ee }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import convCache, { CACHE_INDEX_KEY, CACHE_MAX_THREADS, cacheName, safePart } from '../src/services/convCache';
import type { ConvEvent } from '../src/workspace/conv/convModel';

const ev = (seq: number): ConvEvent => ({ seq, ts: seq, op: 'msg', msg: { key: 'k' + seq, seq, role: 'assistant', kind: 'text', text: 't' + seq } as any });
const snap = (head: number) => ({ thread: { id: 't1', title: '제목' }, events: [ev(head - 1), ev(head)], headSeq: head, floorSeq: head - 1 });

beforeEach(async () => {
  mockFiles.clear(); mockDirs.clear();
  await AsyncStorage.clear();
  mockE2ee.getStatus.mockReset().mockReturnValue({ policy: 'preferred' });
});

test('파일 이름 — 계정·호스트·대화 id, 위험한 글자는 접는다', () => {
  expect(cacheName(12, 7, 'a1b2-c3')).toBe('12-7-a1b2-c3.json');
  expect(cacheName(12, null, 'x')).toBe('12-local-x.json');
  expect(cacheName('../../etc', 7, '../passwd')).toBe('.._.._etc-7-.._passwd.json');
  expect(cacheName('a/b', 7, 'c\\d')).not.toMatch(/[\\/]/);
  expect(safePart('')).toBe('_');
});

test('저장 → 읽기 왕복 + 색인', async () => {
  expect(await convCache.saveConv(12, 7, 't1', snap(10), 1000)).toBe(true);
  expect([...mockFiles.keys()]).toEqual(['/doc/cpt-conv/12-7-t1.json']);
  const got = await convCache.loadConv(12, 7, 't1');
  expect(got).toMatchObject({ v: 1, threadId: 't1', headSeq: 10, floorSeq: 9, at: 1000 });
  expect(got!.events.map((e) => e.seq)).toEqual([9, 10]);
  expect(await convCache.listCached()).toEqual([{ file: '12-7-t1.json', account: '12', host: '7', threadId: 't1', at: 1000, headSeq: 10 }]);
});

test('다른 계정·다른 PC 의 캐시는 서로 보이지 않는다', async () => {
  await convCache.saveConv(12, 7, 't1', snap(10));
  expect(await convCache.loadConv(13, 7, 't1')).toBeNull();
  expect(await convCache.loadConv(12, 8, 't1')).toBeNull();
});

test('★ 암호화 정책 required — 쓰지도 읽지도 않는다', async () => {
  await convCache.saveConv(12, 7, 't1', snap(10));
  mockE2ee.getStatus.mockReturnValue({ policy: 'required' });
  expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
  expect(await convCache.saveConv(12, 7, 't2', snap(5))).toBe(false);
  expect([...mockFiles.keys()]).toEqual(['/doc/cpt-conv/12-7-t1.json']);
});

test('★ 로그아웃 — 전부 삭제', async () => {
  await convCache.saveConv(12, 7, 't1', snap(10));
  await convCache.saveConv(12, 7, 't2', snap(4));
  await convCache.clearAll();
  expect(mockFiles.size).toBe(0);
  expect(await AsyncStorage.getItem(CACHE_INDEX_KEY)).toBeNull();
  expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
  // 지운 뒤에도 다시 쓸 수 있다(폴더를 새로 만든다).
  expect(await convCache.saveConv(12, 7, 't3', snap(2))).toBe(true);
});

test('대화 하나만 지운다', async () => {
  await convCache.saveConv(12, 7, 't1', snap(10));
  await convCache.saveConv(12, 7, 't2', snap(4));
  await convCache.removeConv(12, 7, 't1');
  expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
  expect((await convCache.loadConv(12, 7, 't2'))!.headSeq).toBe(4);
  expect((await convCache.listCached()).map((r) => r.threadId)).toEqual(['t2']);
});

test('깨진 파일은 없는 것으로 치고 지운다', async () => {
  mockDirs.add('/doc/cpt-conv');
  mockFiles.set('/doc/cpt-conv/12-7-t1.json', '{"v":1,"threadId":"t1","events":[');
  expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
  expect(mockFiles.has('/doc/cpt-conv/12-7-t1.json')).toBe(false);
});

test('이름이 접혀 겹친 다른 대화의 파일은 쓰지 않는다', async () => {
  await convCache.saveConv(12, 7, 'a/b', snap(3));          // 파일 이름 12-7-a_b.json
  expect(await convCache.loadConv(12, 7, 'a_b')).toBeNull(); // 같은 파일 이름, 다른 대화
  expect((await convCache.loadConv(12, 7, 'a/b'))!.headSeq).toBe(3);
});

test('버전이 다른 파일은 버린다', async () => {
  mockDirs.add('/doc/cpt-conv');
  mockFiles.set('/doc/cpt-conv/12-7-t1.json', JSON.stringify({ v: 99, threadId: 't1', events: [], headSeq: 1, floorSeq: 1 }));
  expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
});

test('상한을 넘으면 가장 오래 안 쓴 것부터 지운다', async () => {
  for (let i = 0; i < CACHE_MAX_THREADS + 3; i++) await convCache.saveConv(12, 7, 't' + i, snap(5), 1000 + i);
  const rows = await convCache.listCached();
  expect(rows.length).toBe(CACHE_MAX_THREADS);
  expect(rows.some((r) => r.threadId === 't0')).toBe(false);
  expect(rows.some((r) => r.threadId === 't2')).toBe(false);
  expect(rows[0].threadId).toBe('t' + (CACHE_MAX_THREADS + 2));
  expect(mockFiles.size).toBe(CACHE_MAX_THREADS);
});

test('동시에 저장해도 색인이 덮이지 않는다', async () => {
  await Promise.all([1, 2, 3, 4, 5].map((i) => convCache.saveConv(12, 7, 'p' + i, snap(3), 2000 + i)));
  expect((await convCache.listCached()).map((r) => r.threadId).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('파일시스템이 없어도(네이티브 미링크) 죽지 않는다', async () => {
  const fs = require('react-native-blob-util').default.fs;
  const keep = fs.dirs.DocumentDir;
  fs.dirs.DocumentDir = undefined;
  try {
    expect(await convCache.saveConv(12, 7, 't1', snap(10))).toBe(false);
    expect(await convCache.loadConv(12, 7, 't1')).toBeNull();
    await expect(convCache.clearAll()).resolves.toBeUndefined();
  } finally { fs.dirs.DocumentDir = keep; }
});
