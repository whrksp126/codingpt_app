// chatBeta.ts — 채팅 모드(베타) on/off. **기기 로컬 설정**이다(알림음과 같은 성격: 그 기기에서
//  어떻게 볼지). 계정/서버가 아니라 AsyncStorage 에 둔다.
//
// ★ PC `codingpt_pc/src/js/chat-model.js` 의 chatBetaEnabled/setChatBetaEnabled 미러.
//   저장 키 문자열도 **같게** 둔다 — "폰에선 켰는데 PC 는 왜?" 를 이야기할 때 서로 같은 것을 가리킨다.
//
// 왜 chatModel.ts 가 아니라 여기인가: chatModel.ts 는 헤더에 적힌 대로 **RN 의존성 0** 이라 jest 로
//  직접 돌린다. AsyncStorage 를 들이면 그 성질이 깨진다.
//
// 왜 동기 getter 인가: 판정을 쓰는 곳이 렌더 경로(pane 토글 노출·본문 전환)라 await 할 수 없다.
//  부팅 때 한 번 hydrate 해서 메모리 값을 정본으로 쓰고, 저장은 뒤에서 따라간다.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHAT_BETA_KEY = 'cpt.chatBeta.v1';

let enabled = false; // 기본 **꺼짐**(베타 — 사용자 확정 2026-08-14)
const listeners = new Set<() => void>();

/** 부팅 1회 — 저장값을 메모리로 올린다. 실패해도 기본값(꺼짐)으로 계속 간다. */
export async function hydrateChatBeta(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(CHAT_BETA_KEY);
    const next = v === '1';
    if (next !== enabled) { enabled = next; emit(); }
  } catch { /* 기본값 유지 */ }
}

export function chatBetaEnabled(): boolean {
  return enabled;
}

export function setChatBetaEnabled(on: boolean): void {
  if (enabled === !!on) return;
  enabled = !!on;
  AsyncStorage.setItem(CHAT_BETA_KEY, enabled ? '1' : '0').catch(() => { /* 다음 실행엔 옛 값 — 무해 */ });
  emit();
}

/** 켜고 끄면 열려 있는 pane 이 **즉시** 따라야 한다(설정을 닫고 다시 열 필요 없이). */
export function onChatBetaChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(): void {
  for (const fn of listeners) { try { fn(); } catch { /* 하나가 실패해도 나머지는 알린다 */ } }
}

export default { CHAT_BETA_KEY, hydrateChatBeta, chatBetaEnabled, setChatBetaEnabled, onChatBetaChange };
