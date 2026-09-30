import { useCallback } from 'react';
import { useModal } from '../contexts/ModalContext';
import AppConfirmModal from '../components/Modal/AppConfirmModal';

type ConfirmOpts = { title?: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean };
type AlertOpts = { title?: string; message?: string; confirmText?: string };

// 커스텀 알림/확인 — 네이티브 Alert.alert 대체(KeyAssist 접힘을 유지하려고). 가운데 다이얼로그 틀로 뜬다.
// confirm() → Promise<boolean>(확인=true), alert() → Promise<void>.
export function useAppAlert() {
  const { openModal } = useModal();

  const confirm = useCallback((opts: ConfirmOpts): Promise<boolean> =>
    openModal<{ confirmed?: boolean }>(AppConfirmModal, { mode: 'confirm', ...opts }, { presentation: 'dialog' })
      .then((r) => !!r?.confirmed)
      .catch(() => false),
  [openModal]);

  const alert = useCallback((opts: AlertOpts | string, message?: string): Promise<void> => {
    const o: AlertOpts = typeof opts === 'string' ? { title: opts, message } : opts;
    return openModal(AppConfirmModal, { mode: 'alert', ...o }, { presentation: 'dialog' }).then(() => undefined).catch(() => undefined);
  }, [openModal]);

  return { confirm, alert };
}
