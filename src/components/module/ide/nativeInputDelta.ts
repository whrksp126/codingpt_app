// 터미널 네이티브 입력칸(TextInput) → 셸로 보낼 변화량 계산.
//
// 입력칸은 지금까지 친 글자를 들고 있고, 바뀔 때마다 "앞에서부터 같은 데까지" 이후를 지우고(\x7f) 새 꼬리를 보낸다.
//
// ★ 2026-11-22 영상(삼성 키보드, claude 입력): 프롬프트가 64자를 넘는 순간부터 글자를 칠 때마다 이미 보낸 문장이 통째로
//  다시 붙었다. 64자가 넘으면 입력칸을 비우던 코드가 진범이다. 조합 중에 칸을 비워도 키보드(IME)는 자기 편집 상태를
//  그대로 들고 있다가 다음 키에 옛 글자를 전부 다시 써 넣는다. 그러면 기준이 '' 라 그 전체가 "새 꼬리"로 나갔다.
//  지워도 키를 칠 때마다 또 비우니 매 글자마다 전체가 한 번씩 더 붙었다.
//  처방: 조합 도중에는 절대 비우지 않는다(Enter 처럼 조합이 끝난 순간에만 비운다). 비운 뒤 키보드가 옛 내용을 되살려
//  오면 그건 이미 보낸 글자이므로 기준을 옛 내용으로 돌린다(웹뷰 경로의 __staleBuf 와 같은 규칙).

export type NativeInputState = {
  /** 셸에 이미 보낸 것으로 보는 입력칸 내용 */
  sent: string;
  /** 마지막으로 비우기 직전 내용 — 키보드가 되살려 오는지 다음 한 번만 본다 */
  stale: string;
};

export const emptyNativeInput = (): NativeInputState => ({ sent: '', stale: '' });

/** 입력칸을 비울 때(Enter 등). 비우기 직전 내용을 기억해 둔다. */
export function clearNativeInput(st: NativeInputState): NativeInputState {
  return { sent: '', stale: st.sent.length >= 2 ? st.sent : '' };
}

/** 입력칸 값이 next 로 바뀜 → 지울 개수와 보낼 꼬리. */
export function nativeInputDelta(st: NativeInputState, next: string): { del: number; add: string; state: NativeInputState } {
  let base = st.sent;
  if (st.stale) {
    const old = st.stale;
    if (base === '' && next.length >= 2) {
      let cp = 0;
      const n = Math.min(next.length, old.length);
      while (cp < n && next[cp] === old[cp]) cp++;
      // 옛 내용을 (마지막 조합 글자 몇 개만 빼고) 통째로 앞에 달고 왔다 = 되살림
      if (cp >= Math.max(2, old.length - 3)) base = old;
    }
  }
  let i = 0;
  while (i < base.length && i < next.length && base[i] === next[i]) i++;
  return { del: base.length - i, add: next.slice(i), state: { sent: next, stale: '' } };
}
