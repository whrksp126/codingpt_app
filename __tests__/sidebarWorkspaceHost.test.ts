// 사이드바의 PC별 워크스페이스 목록 — "PC 에선 보이는데 폰에선 안 보이는" 증상 고정.
//
// 왜 이 파일이 있나(2026-09-07 사용자 보고):
//   PC 에 등록해 쓰고 있는 워크스페이스가, 폰 사이드바에서 그 PC 를 골라도 **목록이 텅 비어** 있었다.
//   메인 화면(필터 없음)에는 보여서 "데이터는 있는데 사이드바만 못 본다" 는 모양이었다.
//   진범은 서버였다 — JWT 생성 경로(/api/workspaces)가 hostDeviceId 를 안 심었다. 그리고 클라의
//   폴백 규칙이 "귀속 없음 = 내 기기 것" 이었는데, 폰에서 PC 를 고르면 '내 기기' 가 아니라 false 라
//   어느 PC 아래에도 안 걸렸다. iOS/안드로이드 공용 코드라 두 플랫폼 모두 같은 증상이었다.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');

// 컨텍스트 전체를 띄우려면 RN 트리가 필요하므로, 판정 규칙을 원문에서 떠와 그대로 실행한다.
//  (규칙이 바뀌면 이 테스트가 먼저 깨진다 — 그게 목적이다.)
type Ws = { id: string; compute: string; hostDeviceId?: number | null };
type Dev = { id: number; isCurrent?: boolean };

const forDevice = (
  list: Ws[],
  pcDevices: Dev[],
  id: number | string | null,
  currentDeviceId: number | null,
): Ws[] => {
  const locals = list.filter((w) => w.compute === 'local');
  if (id == null) return locals;
  const isMine = pcDevices.some((d) => String(d.id) === String(id)
    && (d.isCurrent || String(d.id) === String(currentDeviceId)));
  const onlyOnePc = pcDevices.length === 1;
  return locals.filter((w) => {
    if (w.hostDeviceId == null) return isMine || onlyOnePc;
    return String(w.hostDeviceId) === String(id);
  });
};

const PC = { id: 393 };
const WS_NO_HOST: Ws = { id: 'p-1', compute: 'local' };            // 귀속이 빠진 워크스페이스
const WS_HOSTED: Ws = { id: 'p-2', compute: 'local', hostDeviceId: 393 };

describe('PC별 워크스페이스 목록', () => {
  test('★ 폰에서 PC 를 골라도 귀속 없는 워크스페이스가 보인다 (PC 가 하나뿐일 때)', () => {
    // 폰의 현재 기기 id 는 394(컨트롤러) — PC 393 은 '내 기기' 가 아니다. 예전엔 여기서 사라졌다.
    const rows = forDevice([WS_NO_HOST], [PC], 393, 394);
    expect(rows.map((w) => w.id)).toEqual(['p-1']);
  });

  test('PC 자신에서도 당연히 보인다(기존 동작 유지)', () => {
    const rows = forDevice([WS_NO_HOST], [{ id: 393, isCurrent: true }], 393, 393);
    expect(rows.map((w) => w.id)).toEqual(['p-1']);
  });

  test('귀속이 있으면 그 PC 아래에만 보인다', () => {
    const two = [{ id: 393 }, { id: 500 }];
    expect(forDevice([WS_HOSTED], two, 393, 394).map((w) => w.id)).toEqual(['p-2']);
    expect(forDevice([WS_HOSTED], two, 500, 394)).toEqual([]);
  });

  test('PC 가 여럿이면 귀속 없는 것을 아무 PC 에나 붙이지 않는다(유령 방지)', () => {
    const two = [{ id: 393 }, { id: 500 }];
    expect(forDevice([WS_NO_HOST], two, 500, 394)).toEqual([]);
  });

  test('클라우드 워크스페이스는 PC 목록에 섞이지 않는다', () => {
    const cloud: Ws = { id: 'p-c', compute: 'cloud' };
    expect(forDevice([cloud, WS_HOSTED], [PC], 393, 394).map((w) => w.id)).toEqual(['p-2']);
  });
});

describe('규칙이 실제 소스와 같은지', () => {
  test('WorkspaceShellContext 가 단일 PC 폴백을 갖고 있다', () => {
    const s = fs.readFileSync(path.join(SRC, 'contexts/WorkspaceShellContext.tsx'), 'utf8');
    expect(s).toContain('const onlyOnePc = pcDevices().length === 1;');
    expect(s).toContain('if (w.hostDeviceId == null) return isMine || onlyOnePc;');
  });

  test('워크스페이스 등록이 귀속 PC 를 함께 보낸다', () => {
    const sheet = fs.readFileSync(path.join(SRC, 'components/PcWorkspaceSheet.tsx'), 'utf8');
    expect(sheet).toContain('hostDeviceId: host ?? null');
    const svc = fs.readFileSync(path.join(SRC, 'services/workspaceService.ts'), 'utf8');
    expect(svc).toMatch(/CreateWorkspaceInput[\s\S]*hostDeviceId\?: number \| null;/);
  });
});
