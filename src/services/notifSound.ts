// 앱 실행 중(포그라운드) 새 알림 도착 시 재생할 짧은 효과음 트리거.
//  실제 재생은 NotifSound 컴포넌트(react-native-video 히든)가 구독해서 처리한다.
type Fn = () => void;
const listeners = new Set<Fn>();

export function onNotifSound(fn: Fn): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function playNotifSound(): void {
  for (const fn of listeners) { try { fn(); } catch { /* noop */ } }
}
