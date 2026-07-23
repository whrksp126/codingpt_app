import { useEffect, useState } from 'react';
import type { SttProvider } from './SttProvider';
import { NativeSttProvider } from './NativeSttProvider';

// ── STT provider 레지스트리 + 현재 선택 상태 ──
//  keyAssistSettings 와 같은 패턴(Context 없는 모듈 레벨 스토어 + 리스너)으로
//  모델 선택 UI(SttPanel)와 인식 로직이 실시간으로 같은 선택을 공유한다.

// 외부 API provider 자리표시자 — 아직 미구현(start 에서 '준비 중' throw).
//  나중에 실제 구현으로 교체하면 UI 변경 없이 활성화된다.
const OpenAiSttProviderStub: SttProvider = {
  id: 'openai',
  label: 'OpenAI',
  capabilities: { streaming: false, onDevice: false, codeSwitching: 'strong' },
  isAvailable: () => Promise.resolve(false),
  requestPermission: () => Promise.resolve(false),
  start: () => Promise.reject(new Error('준비 중입니다.')),
  stop: () => Promise.resolve(),
};

// 등록 순서 = UI 표시 순서(첫 항목이 기본).
const PROVIDERS: SttProvider[] = [NativeSttProvider, OpenAiSttProviderStub];

/** 현재 UI 에서 선택 가능한 provider 목록(레지스트리 스냅샷). */
export function listSttProviders(): SttProvider[] {
  return PROVIDERS.slice();
}

/** 실제로 이 빌드에서 활성(사용 가능) provider 인지 — 스텁/미링크는 비활성. */
export function isSttProviderEnabled(id: string): boolean {
  return id === 'native';
}

let currentId = 'native';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function getCurrentSttProvider(): SttProvider {
  return PROVIDERS.find((p) => p.id === currentId) ?? NativeSttProvider;
}

export function setCurrentSttProvider(id: string) {
  if (currentId === id) return;
  if (!PROVIDERS.some((p) => p.id === id)) return;
  currentId = id;
  notify();
}

/** 현재 선택된 provider 를 구독하는 훅(모델 선택 UI 반영용). */
export function useCurrentSttProvider(): SttProvider {
  const [p, setP] = useState<SttProvider>(getCurrentSttProvider);
  useEffect(() => {
    const l = () => setP(getCurrentSttProvider());
    listeners.add(l);
    setP(getCurrentSttProvider());
    return () => { listeners.delete(l); };
  }, []);
  return p;
}

export type { SttProvider, SttStartOptions } from './SttProvider';
export { CODING_TERMS } from './codingTerms';
