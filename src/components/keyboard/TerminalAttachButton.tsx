import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator } from 'react-native';
import { Paperclip } from 'phosphor-react-native';

import { pickAndUploadAttachments, subscribeAttachBusy, getAttachBusy } from '../../services/attachFlow';
import { showAppAlert } from '../AppAlert';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../animations/haptics';
import type { KeyTarget } from './KeyAssist';
import * as i18n from '../../i18n/index.ts';

// ── 터미널 파일 첨부 버튼(보조키 바) — 특수키 패널 전환 버튼 바로 우측 ──
//  탭 → (모달 없이) 시스템 파일 탐색기 바로 열림 → 업로드 → 절대경로 삽입.
//  ★ 플로우 자체는 `services/attachFlow.ts` 가 정본이다(채팅 컴포저 `+` 메뉴와 **같은 한 벌**을 쓴다 —
//   과거엔 이 파일에만 있어서 채팅에서 보조바를 없애면 첨부가 사라졌다). 여기선 타깃 어댑터만 담당.
//  주의: KeyAssist 가 이 컴포넌트를 렌더하므로 여기선 KeyAssist 를 "타입으로만" import(런타임 순환 방지).

export default function TerminalAttachButton({ target, keyBg, iconColor, h }: {
  target: KeyTarget; keyBg: string; iconColor: string; h: number;
}) {
  const uploading = useSyncExternalStore(subscribeAttachBusy, getAttachBusy);
  const onPress = () => {
    if (uploading) return;
    haptic.keyPress();
    const ctx = target.attachCtx?.();
    if (!ctx) { showAppAlert({ title: i18n.t('파일 첨부'), message: i18n.t('터미널 워크스페이스를 찾을 수 없어요.') }); return; }
    // 모달 없이 바로 파일 탐색기 → 업로드 → 이 터미널 입력(input 델타 경로)에 삽입.
    void pickAndUploadAttachments({ host: ctx.host, insert: (t) => target.insertText?.(t) });
  };
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={3}
      style={{ minWidth: h + 3, height: h, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: keyBg, elevation: 1 }}
      // 평상시 흐림은 baseOpacity 로 — style.opacity 는 PressableScale 의 animStyle 이 덮는다.
      baseOpacity={uploading ? 0.7 : 1}
    >
      {uploading ? <ActivityIndicator size="small" color={iconColor} /> : <Paperclip size={18} color={iconColor} />}
    </PressableScale>
  );
}
