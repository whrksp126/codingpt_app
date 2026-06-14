import AsyncStorage from '@react-native-async-storage/async-storage';

const ANON_ID_KEY = 'onboardingAnonId';
const ONBOARDING_SEEN_KEY = 'onboardingSeen';

// crypto 없이 RFC4122 v4 형식의 식별자 생성(마케팅 리드 식별용 — 보안 토큰 아님).
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 기기별 익명 ID 로드(없으면 생성 후 저장). 로그인 전 온보딩 설문 식별 키.
export async function getOrCreateAnonId(): Promise<string> {
  const existing = await AsyncStorage.getItem(ANON_ID_KEY);
  if (existing) return existing;
  const id = uuidv4();
  await AsyncStorage.setItem(ANON_ID_KEY, id);
  return id;
}

// 온보딩 완료 플래그 — 한 번 거친 기기는 재진입 시 온보딩 스킵하고 로그인만 노출.
export async function getOnboardingSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === 'true';
}

export async function setOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
}
