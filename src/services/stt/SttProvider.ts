// ── 음성입력(STT) 추상화 레이어 ──
// provider 를 교체 가능하게(네이티브 온디바이스 / 나중에 외부 API) 감싸는 최소 계약.
//  UI(SttPanel)는 이 인터페이스만 바라보고, 실제 인식은 등록된 provider 가 담당한다.

/** 인식 세션 시작 옵션 — 콜백은 provider 가 세그먼트 진행에 따라 호출한다. */
export interface SttStartOptions {
  /** BCP-47 로케일(기본 'ko-KR'). */
  locale?: string;
  /** 인식 바이어스용 문맥 단어(코딩 기술용어 등) — 지원 provider 만 사용. */
  contextualStrings?: string[];
  /** 중간(부분) 인식 텍스트 — 상태 표시에만 사용(입력창엔 넣지 않음). */
  onPartial(text: string): void;
  /** 확정된 세그먼트 텍스트 — 이 텍스트를 입력 타깃에 append 한다. */
  onFinal(text: string): void;
  /** 인식 오류. */
  onError(e: { code?: string; message: string }): void;
  /** 입력 볼륨 레벨(0~1 근사) — 마이크 애니메이션용(선택). */
  onVolume?(level: number): void;
  /** 인식 세션 종료(자동 재시작은 provider 내부에서 처리). */
  onEnd?(): void;
}

export interface SttProviderCapabilities {
  /** 부분(partial) 결과를 실시간 스트리밍하는가. */
  streaming: boolean;
  /** 온디바이스(오프라인) 처리 가능 여부. */
  onDevice: boolean;
  /** 한/영 코드스위칭(혼합 발화) 강도. */
  codeSwitching: 'weak' | 'medium' | 'strong';
}

export interface SttProvider {
  /** 안정 식별자(레지스트리 키). */
  id: string;
  /** UI 표시명. */
  label: string;
  capabilities: SttProviderCapabilities;
  /** 이 기기/플랫폼에서 사용 가능한가(엔진 존재·로케일 지원 등). */
  isAvailable(): Promise<boolean>;
  /** 마이크/음성인식 권한 요청 — 승인 시 true. */
  requestPermission(): Promise<boolean>;
  /** 인식 시작(연속 인식 — stop 전까지 세그먼트 자동 재시작). */
  start(opts: SttStartOptions): Promise<void>;
  /** 인식 정지. */
  stop(): Promise<void>;
}
