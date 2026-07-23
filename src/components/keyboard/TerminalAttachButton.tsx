import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator } from 'react-native';
import { Paperclip } from 'phosphor-react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';

import { uploadAttachmentBase64 } from '../../services/attachmentUpload';
import { showAppAlert } from '../AppAlert';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../animations/haptics';
import type { KeyTarget } from './KeyAssist';

// ── 터미널 이미지 첨부 버튼(보조키 바) — 특수키 패널 전환 버튼 바로 우측 ──
//  탭 → 앨범/카메라 시트(AppAlert) → react-native-image-picker → 데몬 fs.write(base64) 업로드
//  (`.codingpt/attachments/<yyyymmdd-hhmmss>-<rand4>.jpg`, 해당 터미널 워크스페이스 호스트로 직결
//   — 업로드 규약은 attachmentUpload 공용 헬퍼, Design Mode 크롭샷과 공유)
//  → 응답 absPath 를 `'<absPath>' `(작은따옴표+뒤 공백) 로 터미널 입력에 삽입(input 델타 경로 재사용).
//  업로드 상태는 모듈 스토어 — 시트/키보드 전환으로 바가 잠깐 내려가 버튼이 리마운트돼도 스피너 유지.
//  주의: KeyAssist 가 이 컴포넌트를 렌더하므로 여기선 KeyAssist 를 "타입으로만" import(런타임 순환 방지).

let busy = false;
const listeners = new Set<() => void>();
const setBusy = (v: boolean) => { busy = v; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

async function pickAndUpload(target: KeyTarget, source: 'library' | 'camera'): Promise<void> {
  try {
    setBusy(true);
    // 계약 §5 고정 옵션 — quality 0.8, 긴 변 2048, base64 포함.
    const opts = { mediaType: 'photo', quality: 0.8, maxWidth: 2048, maxHeight: 2048, includeBase64: true } as const;
    const res: ImagePickerResponse = source === 'camera'
      ? await launchCamera({ ...opts, saveToPhotos: false })
      : await launchImageLibrary({ ...opts, selectionLimit: 1 });
    if (res.didCancel) return;
    if (res.errorCode) throw new Error(res.errorMessage || '이미지를 불러올 수 없어요.');
    const a = res.assets && res.assets[0];
    if (!a || !a.base64) return;
    const ctx = target.attachCtx?.();
    if (!ctx) throw new Error('터미널 워크스페이스를 찾을 수 없어요.');
    // 업로드 — 워크스페이스 호스트 PC 로 직결(hostDeviceId). 경로 규약은 공용 헬퍼(계약 §2).
    const abs = await uploadAttachmentBase64(a.base64, ctx.host);
    // 작은따옴표 감싸기 + 뒤 공백 1개(계약 §2) — 공백 포함 경로도 셸에서 그대로 사용 가능.
    target.insertText?.(`'${abs}' `);
  } catch (e: any) {
    showAppAlert({ title: '이미지 첨부', message: String(e?.message || e) });
  } finally {
    setBusy(false);
  }
}

export default function TerminalAttachButton({ target, keyBg, iconColor, h }: {
  target: KeyTarget; keyBg: string; iconColor: string; h: number;
}) {
  const uploading = useSyncExternalStore(subscribe, () => busy);
  const onPress = () => {
    if (uploading) return;
    haptic.keyPress();
    // 소스 선택 시트 — 기존 AppAlert 스타일 재사용(등장 시 키보드/패널은 내려감 — 기존 스펙).
    showAppAlert({
      title: '이미지 첨부',
      message: '이미지를 PC 에 올리고 경로를 터미널에 붙여넣어요.',
      buttons: [
        { text: '사진 앨범', onPress: () => { void pickAndUpload(target, 'library'); } },
        { text: '카메라', onPress: () => { void pickAndUpload(target, 'camera'); } },
        { text: '취소', style: 'cancel' },
      ],
    });
  };
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={3}
      style={{ minWidth: h + 3, height: h, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: keyBg, elevation: 1, opacity: uploading ? 0.7 : 1 }}
    >
      {uploading ? <ActivityIndicator size="small" color={iconColor} /> : <Paperclip size={18} color={iconColor} />}
    </PressableScale>
  );
}
