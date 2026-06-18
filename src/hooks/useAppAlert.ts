import { useCallback } from 'react';
import { useModal } from '../contexts/ModalContext';
import AppConfirmModal from '../components/Modal/AppConfirmModal';

type ConfirmOpts = { title?: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean };
type AlertOpts = { title?: string; message?: string; confirmText?: string };

// 다크 커스텀 알림/확인 — 네이티브 Alert.alert 대체.
// confirm() → Promise<boolean>(확인=true), alert() → Promise<void>.
export function useAppAlert() {
  const { openModal } = useModal();

  const confirm = useCallback((opts: ConfirmOpts): Promise<boolean> =>
    openModal<{ confirmed?: boolean }>(AppConfirmModal, { mode: 'confirm', ...opts })
      .then((r) => !!r?.confirmed)
      .catch(() => false),
  [openModal]);

  const alert = useCallback((opts: AlertOpts | string, message?: string): Promise<void> => {
    const o: AlertOpts = typeof opts === 'string' ? { title: opts, message } : opts;
    return openModal(AppConfirmModal, { mode: 'alert', ...o }).then(() => undefined).catch(() => undefined);
  }, [openModal]);

  return { confirm, alert };
}
