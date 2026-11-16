// prod 앞단 nginx 는 1MB 넘는 요청을 413 HTML 로 막는다(2026-11-16 실측) — 첨부는 조각마다 1MB 아래로 가야 한다.
const mockWrites: { content: string; append?: boolean }[] = [];
let mockStored = Buffer.alloc(0);
jest.mock('../src/services/daemonService', () => ({
  __esModule: true,
  default: {
    fsWrite: jest.fn(async (_p: string, content: string, _h: any, o: any) => {
      mockWrites.push({ content, append: o?.append });
      const b = Buffer.from(content, 'base64');
      mockStored = o?.append ? Buffer.concat([mockStored, b]) : b;
      return { path: 'x', absPath: '/Users/u/.codingpt/attachments/x', size: mockStored.length };
    }),
    fsMkdir: jest.fn(async () => ({ path: 'x' })),
  },
}));
jest.mock('react-native-blob-util', () => ({ __esModule: true, default: { fs: { dirs: { CacheDir: '/tmp' } } } }));
jest.mock('../src/i18n/index.ts', () => ({ t: (s: string) => s }));

import { uploadAttachmentFile } from '../src/services/attachmentUpload';

describe('첨부 조각 업로드', () => {
  beforeEach(() => { mockWrites.length = 0; mockStored = Buffer.alloc(0); });
  it.each([1, 1000, 384 * 1024, 384 * 1024 + 1, Math.round(1.78 * 1024 * 1024), Math.round(6.89 * 1024 * 1024)])('%d 바이트 — 조각마다 1MB 아래, 이어 붙이면 원본', async (n) => {
    const src = Buffer.alloc(n);
    for (let i = 0; i < n; i++) src[i] = (i * 7 + 3) & 255;
    const abs = await uploadAttachmentFile({ name: 'a b.mp4', base64: src.toString('base64'), size: n }, 1);
    expect(abs).toContain('/.codingpt/attachments/');
    for (const w of mockWrites) expect(w.content.length).toBeLessThanOrEqual(512 * 1024);
    expect(mockWrites[0].append).toBeFalsy();
    expect(Buffer.compare(mockStored, src)).toBe(0);
  });
});
