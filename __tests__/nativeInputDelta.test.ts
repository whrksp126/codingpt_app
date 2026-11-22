import { clearNativeInput, emptyNativeInput, nativeInputDelta, type NativeInputState } from '../src/components/module/ide/nativeInputDelta';

// 셸(claude 입력칸)을 흉내: \x7f 는 한 글자 지우기.
function shellApply(shell: string, del: number, add: string) {
  return shell.slice(0, Math.max(0, shell.length - del)) + add;
}

// 키보드(IME)가 입력칸에 보이는 값의 연속 — 삼성 키보드 한글 조합처럼 마지막 음절이 바뀌며 자란다.
function typeAll(values: string[], st: NativeInputState = emptyNativeInput(), shell = '') {
  for (const v of values) {
    const r = nativeInputDelta(st, v);
    st = r.state;
    shell = shellApply(shell, r.del, r.add);
  }
  return { st, shell };
}

describe('터미널 네이티브 입력 델타', () => {
  const S = '글자 쓰는거 잘 봐 이건 tui에서 글자가 증식하는 현상을 재현 하는거야 일단 반응이 느린갓도 느껴지지 그리고 줄밖';

  it('64자를 넘겨도 문장이 증식하지 않는다(2026-11-22 영상 재현)', () => {
    expect(S.length).toBe(64);
    const steps = [S, S.slice(0, -1) + '바꾸', S.slice(0, -1) + '바꿈', S.slice(0, -1) + '바꿈ㅇ', S.slice(0, -1) + '바꿈이'];
    const { shell } = typeAll(steps);
    expect(shell).toBe(S.slice(0, -1) + '바꿈이');
  });

  it('조합 음절 교체·지우기는 끝 글자만 고친다', () => {
    const st = typeAll(['가', '각']).st;
    expect(nativeInputDelta(st, '가나')).toEqual({ del: 1, add: '가나', state: { sent: '가나', stale: '' } });
    expect(nativeInputDelta({ sent: '가나', stale: '' }, '가')).toMatchObject({ del: 1, add: '' });
  });

  it('Enter 로 비운 뒤 키보드가 옛 내용을 되살려 와도 다시 보내지 않는다', () => {
    let { st, shell } = typeAll(['ls -al', 'ls -al']);
    shell += '\r';
    st = clearNativeInput(st);
    const r = nativeInputDelta(st, 'ls -alx');   // 삼성 키보드: 비운 칸에 옛 글자 + 새 글자
    expect(r.add).toBe('x');
    expect(r.del).toBe(0);
    expect(shellApply(shell, r.del, r.add)).toBe('ls -al\rx');
  });

  it('비운 뒤 새로 치는 글자는 그대로 보낸다', () => {
    const st = clearNativeInput(typeAll(['echo hi']).st);
    const r1 = nativeInputDelta(st, 'p');
    expect(r1).toMatchObject({ del: 0, add: 'p' });
    const r2 = nativeInputDelta(r1.state, 'pw');
    expect(r2).toMatchObject({ del: 0, add: 'w' });
  });
});
