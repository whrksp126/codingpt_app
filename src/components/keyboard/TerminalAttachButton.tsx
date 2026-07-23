import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator } from 'react-native';
import { Paperclip } from 'phosphor-react-native';

import { pickAnyFiles } from '../../services/attachmentPicker';
import { uploadAttachmentNamed } from '../../services/attachmentUpload';
import { showAppAlert } from '../AppAlert';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../animations/haptics';
import type { KeyTarget } from './KeyAssist';

// ── 터미널 파일 첨부 버튼(보조키 바) — 특수키 패널 전환 버튼 바로 우측 ──
//  탭 → (모달 없이) 시스템 파일 탐색기 바로 열림(@react-native-documents/picker, 모든 파일·다중선택)
//   → 각 파일 base64 → 데몬 fs.write(base64) 업로드(`.codingpt/attachments/<ts>-<원본파일명>`,
//    해당 터미널 워크스페이스 호스트로 직결) → 응답 absPath 들을 `'<absPath>' `(작은따옴표+공백)로
//    터미널 입력에 삽입(input 델타 경로 재사용, 공백 포함 경로도 셸에서 그대로 사용 가능).
//  이미지/앨범/카메라 구분 없음 — Android·iOS 모두 OS 파일 선택기로 임의 파일을 고른다(6MB/파일 상한).
//  업로드 상태는 모듈 스토어 — 시트/키보드 전환으로 바가 잠깐 내려가 버튼이 리마운트돼도 스피너 유지.
//  주의: KeyAssist 가 이 컴포넌트를 렌더하므로 여기선 KeyAssist 를 "타입으로만" import(런타임 순환 방지).

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 데몬 fs.write base64 디코드 후 상한과 동일

let busy = false;
const listeners = new Set<() => void>();
const setBusy = (v: boolean) => { busy = v; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

async function pickAndUpload(target: KeyTarget): Promise<void> {
  try {
    setBusy(true);
    // 시스템 파일 탐색기 바로 열림(다중선택). 취소 시 빈 배열.
    const files = await pickAnyFiles();
    if (!files.length) return;
    const ctx = target.attachCtx?.();
    if (!ctx) throw new Error('터미널 워크스페이스를 찾을 수 없어요.');
    // 6MB 초과 파일은 업로드 불가(데몬 상한) — 걸러내고 나머지만 올린 뒤 안내.
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const okFiles = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const paths: string[] = [];
    for (const f of okFiles) {
      const abs = await uploadAttachmentNamed(f.name, f.base64, ctx.host);
      paths.push(`'${abs}'`);
    }
    if (paths.length) target.insertText?.(`${paths.join(' ')} `);
    if (tooBig.length) {
      const names = tooBig.map((f) => f.name).join(', ');
      showAppAlert({ title: '파일 첨부', message: `6MB 를 넘는 파일은 제외했어요: ${names}` });
    }
  } catch (e: any) {
    showAppAlert({ title: '파일 첨부', message: String(e?.message || e) });
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
    void pickAndUpload(target); // 모달 없이 바로 파일 탐색기
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
