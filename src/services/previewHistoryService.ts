// previewHistoryService — 프리뷰 주소창 방문 기록 + 검색어 추천 데이터 계층.
//  PC(codingpt_pc/src/js/preview-history.js)와 파일 포맷/경로 규약을 공유한다:
//   정본 = 워크스페이스 "호스트 PC" 의 ~/.codingpt/preview-history/u<계정id>--<ws슬러그>.json
//   · 백엔드 DB 무사용 — 모든 기기가 어차피 호스트 데몬에 붙으므로 기존 fs.read/fs.write
//     릴레이만으로 전 기기가 같은 기록을 공유한다.
//   · 파일명이 계정 id 로 키잉 → 계정 전환 시 이전 계정 기록이 보이지 않는다.
//  검색어 추천 = Google Suggest 공개 엔드포인트(RN fetch 는 CORS 무관).
import daemonService from './daemonService';

export type PreviewHistEntry = { u: string; t?: string; f?: string; n?: number; ts?: number };

const CAP = 300; // 워크스페이스당 보관 상한(마지막 방문 오래된 것부터 소거)
const CACHE_TTL = 15000; // 타이핑 중 재읽기 억제
const cache = new Map<string, { at: number; entries: PreviewHistEntry[] }>();

const slugOf = (p: string) => String(p || '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'root';
const fileOf = (uid: number | string, cwd: string) => `.codingpt/preview-history/u${uid}--${slugOf(cwd)}.json`;

async function load(uid: number | string, cwd: string, host?: number | null): Promise<PreviewHistEntry[]> {
  const file = fileOf(uid, cwd);
  const c = cache.get(file);
  if (c && Date.now() - c.at < CACHE_TTL) return c.entries;
  let entries: PreviewHistEntry[] = [];
  try {
    const r = await daemonService.fsRead(file, { host });
    const j = JSON.parse(String(r?.content || '{}'));
    if (Array.isArray(j.entries)) entries = j.entries;
  } catch (_) { /* 파일 없음 = 첫 사용 */ }
  cache.set(file, { at: Date.now(), entries });
  return entries;
}

async function save(uid: number | string, cwd: string, host: number | null | undefined, entries: PreviewHistEntry[]) {
  const file = fileOf(uid, cwd);
  cache.set(file, { at: Date.now(), entries });
  const body = JSON.stringify({ v: 1, entries });
  try {
    await daemonService.fsWrite(file, body, host);
  } catch (_) {
    try { await daemonService.fsMkdir('.codingpt/preview-history', host); } catch (_) { /* 이미 존재 등 */ }
    try { await daemonService.fsWrite(file, body, host); } catch (_) { /* 기록 실패는 조용히 */ }
  }
}

// 방문 기록 — 페이지 로드 완료 시 호출. url 별 방문수·최근시각 upsert(제목/파비콘 갱신).
export async function recordVisit(
  uid: number | string | null | undefined,
  cwd: string,
  host: number | null | undefined,
  entry: { url: string; title?: string; favicon?: string },
) {
  try {
    if (uid == null || !cwd) return;
    const u = String(entry.url || '');
    if (!/^https?:\/\//i.test(u)) return;
    if (/^https?:\/\/(www\.)?google\.[^/]+\/search/i.test(u)) return; // 검색결과 페이지는 소음
    const entries = (await load(uid, cwd, host)).slice();
    const i = entries.findIndex((e) => e && e.u === u);
    const prev = i >= 0 ? entries.splice(i, 1)[0] : null;
    entries.unshift({
      u,
      t: entry.title || prev?.t || '',
      f: entry.favicon || prev?.f || '',
      n: (prev?.n || 0) + 1,
      ts: Date.now(),
    });
    await save(uid, cwd, host, entries.slice(0, CAP));
  } catch (_) { /* 기능 부가물 — 실패 무시 */ }
}

// 기록 매칭 — 호스트 접두 일치 > url/제목 포함, 동점이면 방문수·최근성. q 없으면 최근 방문 순.
export async function queryHistory(
  uid: number | string | null | undefined,
  cwd: string,
  host: number | null | undefined,
  q: string,
  limit = 5,
): Promise<PreviewHistEntry[]> {
  try {
    if (uid == null || !cwd) return [];
    const entries = await load(uid, cwd, host);
    const s = String(q || '').trim().toLowerCase();
    const scored: { e: PreviewHistEntry; score: number }[] = [];
    for (const e of entries) {
      if (!e || !e.u) continue;
      let score = 1;
      if (s) {
        const url = e.u.toLowerCase();
        const hostPart = url.replace(/^https?:\/\/(www\.)?/, '');
        if (hostPart.startsWith(s)) score = 3;
        else if (url.includes(s) || (e.t || '').toLowerCase().includes(s)) score = 2;
        else continue;
      }
      scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score || (b.e.n || 0) - (a.e.n || 0) || (b.e.ts || 0) - (a.e.ts || 0));
    return scored.slice(0, limit).map((x) => x.e);
  } catch (_) { return []; }
}

// Google Suggest — 입력어 기반 검색어 추천(무키·무료 공개 엔드포인트).
export async function googleSuggest(q: string, limit = 5): Promise<string[]> {
  const s = String(q || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return [];
  try {
    const res = await fetch(
      'https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q=' + encodeURIComponent(s),
    );
    const j = await res.json();
    const arr = Array.isArray(j) && Array.isArray(j[1]) ? (j[1] as string[]) : [];
    return arr.filter((t) => t && t !== s).slice(0, limit);
  } catch (_) { return []; }
}
