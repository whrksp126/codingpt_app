export const ENABLE_NEW_LESSON_ANIMATIONS = true;
export const ENABLE_AUTO_SCROLL = true;
export const ENABLE_SLIDE_TRANSITION = true;
export const ENABLE_CONFETTI = true;
export const ENABLE_HAPTICS = true;

// 타임스탬프 기반 타이핑/노래방 자막 하이라이트 효과.
// 실제 텍스트와 TTS 타임스탬프 텍스트가 어긋나는 문제로 비활성화.
// (timestamps 데이터 자체는 보존 — 정합성 해결 후 true 로 복구하면 바로 동작)
export const ENABLE_TYPING_HIGHLIGHT = false;

// TTS 가 있는 콘텐츠는 고정 duration 타이머 대신 실제 재생 종료(onEnd) 이벤트를
// 기다린 뒤 "유지 시간"(visibility.time 재해석)만큼 더 보여주고 다음으로 진행.
// TTS 없는 슬라이드는 기존 배치 스케줄러 경로 유지(회귀 방지).
export const ENABLE_EVENT_DRIVEN_TTS = true;
