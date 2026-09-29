// 앱 시작 시 토큰 확인이 네트워크로 실패해도 로그인 화면으로 튕기지 않는다 — 서버 거절(401/403)만 로그아웃.
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn() }), { virtual: true });
import { isRejected } from '../src/contexts/AuthContext';

test('서버 거절만 세션 없음으로 본다', () => {
  expect(isRejected(401)).toBe(true);
  expect(isRejected(403)).toBe(true);
  expect(isRejected(undefined)).toBe(false); // 네트워크 실패
  expect(isRejected(500)).toBe(false);
  expect(isRejected(502)).toBe(false);
});
