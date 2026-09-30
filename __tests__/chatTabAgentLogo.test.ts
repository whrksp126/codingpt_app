// 채팅 탭 아이콘 = 그 대화의 에이전트 로고 — 로고가 있는 에이전트 목록이 아이콘 분기의 근거다.
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Svg: 'Svg', Path: 'Path' }));
import { AGENT_LOGO_BRANDS } from '../src/workspace/AgentLogo';

test('주요 에이전트는 로고가 있다(없으면 말풍선으로 대체)', () => {
  for (const b of ['claude', 'codex', 'gemini']) expect(AGENT_LOGO_BRANDS.has(b)).toBe(true);
  expect(AGENT_LOGO_BRANDS.has('unknown-agent')).toBe(false);
});
