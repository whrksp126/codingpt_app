import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View } from 'react-native';
import BaseModal from '../components/Modal/BaseModal';

interface ModalItem {
  id: string;
  component: React.ComponentType<any>;
  props: any;
  options: ModalOptions;
  resolve?: (result: any) => void;
  reject?: (error: any) => void;
}

interface ModalOptions {
  enableBackdropClose?: boolean;
  backgroundColor?: string;
  contentClassName?: string;
  animationType?: 'fade' | 'slide' | 'none';
  statusBarTranslucent?: boolean;
}

interface ModalContextType {
  openModal: <T = any>(
    component: React.ComponentType<any>,
    props?: any,
    options?: ModalOptions
  ) => Promise<T>;
  pushModal: <T = any>(
    component: React.ComponentType<any>,
    props?: any,
    options?: ModalOptions
  ) => Promise<T>;
  popModal: (result?: any) => void;
  closeModal: (result?: any) => void;
  closeAllModals: () => void;
  getModalStack: () => ModalItem[];
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [modalStack, setModalStack] = useState<ModalItem[]>([]);

  const generateModalId = () => {
    return `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const openModal = useCallback(<T = any>(
    component: React.ComponentType<any>,
    props: any = {},
    options: ModalOptions = {}
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const modalId = generateModalId();
      const modalItem: ModalItem = {
        id: modalId,
        component,
        props,
        options: {
          enableBackdropClose: true,
          backgroundColor: 'bg-black/40',
          contentClassName: '',
          animationType: 'fade',
          statusBarTranslucent: true,
          ...options,
        },
        resolve,
        reject,
      };

      setModalStack(prev => [modalItem]);
    });
  }, []);

  const pushModal = useCallback(<T = any>(
    component: React.ComponentType<any>,
    props: any = {},
    options: ModalOptions = {}
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const modalId = generateModalId();
      const modalItem: ModalItem = {
        id: modalId,
        component,
        props,
        options: {
          enableBackdropClose: true,
          backgroundColor: 'bg-black/40',
          contentClassName: '',
          animationType: 'fade',
          statusBarTranslucent: true,
          ...options,
        },
        resolve,
        reject,
      };

      setModalStack(prev => [...prev, modalItem]);
    });
  }, []);

  const popModal = useCallback((result?: any) => {
    return new Promise((resolve, reject) => {
      setModalStack(prev => {
        if (prev.length === 0) {
          reject(new Error('No modals to pop'));
          return prev;
        }
        
        // 현재 모달을 제거하고 이전 모달이 나타나도록 함
        const newStack = prev.slice(0, -1);
        
        // 이전 모달이 있다면 그 모달의 resolve를 호출
        if (newStack.length > 0) {
          const previousModal = newStack[newStack.length - 1];
          if (previousModal.resolve) {
            previousModal.resolve(result);
          }
        }
        
        resolve(result);
        return newStack;
      });
    });
  }, []);

  const closeModal = useCallback((result?: any) => {
    setModalStack(prev => {
      if (prev.length === 0) return prev;
      
      const lastModal = prev[prev.length - 1];
      if (lastModal.resolve) {
        lastModal.resolve(result);
      }
      
      return prev.slice(0, -1);
    });
  }, []);

  const closeAllModals = useCallback(() => {
    setModalStack(prev => {
      prev.forEach(modal => {
        if (modal.reject) {
          modal.reject(new Error('All modals closed'));
        }
      });
      return [];
    });
  }, []);

  const getModalStack = useCallback(() => {
    return modalStack;
  }, [modalStack]);

  const handleModalClose = useCallback((modalId: string, result?: any) => {
    setModalStack(prev => {
      const modalIndex = prev.findIndex(modal => modal.id === modalId);
      if (modalIndex === -1) return prev;
      
      const modal = prev[modalIndex];
      if (modal.resolve) {
        modal.resolve(result);
      }
      
      return prev.filter(modal => modal.id !== modalId);
    });
  }, []);

  const renderModals = () => {
    return modalStack.map((modal, index) => {
      const Component = modal.component;
      const isTopModal = index === modalStack.length - 1;
      
      return (
        <BaseModal
          key={modal.id}
          visible={isTopModal}
          onClose={(result) => handleModalClose(modal.id, result)}
          modalId={modal.id}
          {...modal.options}
        >
          <Component
            {...modal.props}
            onClose={(result?: any) => handleModalClose(modal.id, result)}
            modalId={modal.id}
          />
        </BaseModal>
      );
    });
  };

  const contextValue: ModalContextType = {
    openModal,
    pushModal,
    popModal,
    closeModal,
    closeAllModals,
    getModalStack,
  };

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      {renderModals()}
    </ModalContext.Provider>
  );
};

export default ModalProvider;
