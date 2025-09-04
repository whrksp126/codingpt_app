# 🚀 고급 모달 시스템 사용 가이드

> **React Native용 스택 기반 모달 관리 시스템**  
> await 기반의 결과 반환, 동적 모달 생성, 애니메이션 효과를 제공합니다.

## 📋 목차
- [빠른 시작](#-빠른-시작)
- [기본 사용법](#-기본-사용법)
- [모달 스택 관리](#-모달-스택-관리)
- [모달 컴포넌트 만들기](#-모달-컴포넌트-만들기)
- [고급 옵션](#-고급-옵션)
- [실제 사용 예시](#-실제-사용-예시)
- [API 레퍼런스](#-api-레퍼런스)

---

## 🚀 빠른 시작

### 1️⃣ App.tsx에 ModalProvider 추가
```tsx
import { ModalProvider } from './src/contexts/ModalContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <UserProvider>
        <StoreProvider>
          <AuthProvider>
            <NavigationProvider>
              <LessonProvider>
                <ModalProvider>  {/* 👈 여기에 추가! */}
                  <AppNavigator />
                </ModalProvider>
              </LessonProvider>
            </NavigationProvider>
          </AuthProvider>
        </StoreProvider>
      </UserProvider>
    </SafeAreaProvider>
  );
}
```

### 2️⃣ 간단한 모달 열기
```tsx
import { useModal } from '../contexts/ModalContext';
import ConfirmModal from '../components/Modal/ConfirmModal';

const MyScreen = () => {
  const { openModal } = useModal();

  const handleDelete = async () => {
    const result = await openModal(ConfirmModal, {
      message: '정말 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
    });
    
    if (result.confirmed) {
      console.log('삭제 확인됨!');
      // 삭제 로직 실행
    }
  };

  return (
    <Button onPress={handleDelete} title="삭제하기" />
  );
};
```

---

## 📖 기본 사용법

### 🔹 단일 모달 열기
```tsx
const { openModal } = useModal();

// 기본 사용
const result = await openModal(MyModal, {
  title: '제목',
  data: { id: 1, name: '테스트' }
});

// 옵션과 함께 사용
const result = await openModal(MyModal, {
  title: '제목'
}, {
  enableBackdropClose: false,  // 배경 클릭으로 닫기 비활성화
  backgroundColor: 'bg-blue-500/50',  // 배경색 변경
});
```

### 🔹 모달 결과 처리
```tsx
const handleShowModal = async () => {
  try {
    const result = await openModal(MyModal, { data: 'test' });
    
    // 결과에 따른 처리
    if (result.success) {
      console.log('성공:', result.data);
    } else if (result.action === 'cancel') {
      console.log('취소됨');
    } else if (result.action === 'backdrop_close') {
      console.log('배경 클릭으로 닫힘');
    }
  } catch (error) {
    console.log('모달이 닫혔습니다.');
  }
};
```

---

## 📚 모달 스택 관리

### 🔹 모달 스택이란?
여러 모달을 쌓아서 관리하는 시스템입니다.  
예: 첫 번째 모달 → 두 번째 모달 → 세 번째 모달 (스택처럼 쌓임)

### 🔹 pushModal - 모달 추가
```tsx
const { pushModal } = useModal();

// 첫 번째 모달
const firstResult = await pushModal(FirstModal, { step: 1 });

// 두 번째 모달 (첫 번째 위에 쌓임)
const secondResult = await pushModal(SecondModal, { step: 2 });
```

### 🔹 popModal - 이전 모달로 돌아가기
```tsx
const { popModal } = useModal();

// 현재 모달 닫고 이전 모달로 돌아가기
const result = await popModal({ action: 'back' });
```

### 🔹 실제 사용 예시
```tsx
const handleMultiStep = async () => {
  // 1단계: 정보 입력
  const step1 = await openModal(InputModal, {
    title: '정보를 입력하세요'
  });
  
  if (!step1.success) return;
  
  // 2단계: 확인 (1단계 위에 쌓임)
  const step2 = await pushModal(ConfirmModal, {
    message: `입력된 정보: ${step1.data.name}`
  });
  
  if (step2.confirmed) {
    // 최종 처리
    await saveData(step1.data);
  } else {
    // 2단계에서 "수정" 선택 시 1단계로 돌아가기
    await popModal();
  }
};
```

---

## 🛠 모달 컴포넌트 만들기

### 🔹 기본 구조
```tsx
import React from 'react';
import { View, Text } from 'react-native';
import DefaultBtn from '../Button/DefaultBtn';

// 1. Props 인터페이스 정의
interface MyModalProps {
  // 모달에 전달할 데이터
  title: string;
  message: string;
  data?: any;
  
  // 필수 props (자동으로 전달됨)
  onClose: (result?: any) => void;
  modalId?: string;
}

// 2. 모달 컴포넌트 작성
const MyModal: React.FC<MyModalProps> = ({
  title,
  message,
  data,
  onClose,
  modalId,
}) => {
  // 3. 버튼 핸들러 작성
  const handleConfirm = () => {
    onClose({ 
      success: true, 
      data: '결과 데이터',
      action: 'confirm' 
    });
  };

  const handleCancel = () => {
    onClose({ 
      success: false, 
      action: 'cancel' 
    });
  };

  // 4. UI 렌더링
  return (
    <View className="flex-col gap-[20px] w-[320px] p-[24px] rounded-[16px] bg-white">
      <Text className="text-[24px] font-[700] text-center">{title}</Text>
      <Text className="text-[16px] text-[#666] text-center">{message}</Text>
      
      <View className="flex-row gap-[12px]">
        <View className="flex-1">
          <DefaultBtn
            onPress={handleCancel}
            text="취소"
            buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#F5F5F5]"
            textClassName="text-[16px] font-[600] text-[#666]"
            flex={false}  // 모달에서는 flex={false} 사용
          />
        </View>
        <View className="flex-1">
          <DefaultBtn
            onPress={handleConfirm}
            text="확인"
            buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#58CC02]"
            textClassName="text-[16px] font-[600] text-white"
            flex={false}  // 모달에서는 flex={false} 사용
          />
        </View>
      </View>
    </View>
  );
};

export default MyModal;
```

### 🔹 결과 반환 패턴
```tsx
// ✅ 성공 결과
onClose({ 
  success: true, 
  data: resultData,
  action: 'success' 
});

// ❌ 에러 결과
onClose({ 
  success: false, 
  error: '에러 메시지',
  action: 'error' 
});

// 🚫 취소 결과
onClose({ 
  success: false, 
  action: 'cancel' 
});

// 🔙 뒤로가기 결과 (모달 스택에서)
onClose({ 
  action: 'back',
  data: '이전 모달로 돌아가는 데이터'
});

// 🖱️ 배경 클릭 결과 (자동으로 반환됨)
// action: 'backdrop_close'
// success: false
// message: '배경을 클릭하여 모달이 닫혔습니다.'
```

---

## ⚙️ 고급 옵션

### 🔹 모달 옵션 설정
```tsx
const result = await openModal(MyModal, {
  title: '제목'
}, {
  enableBackdropClose: false,        // 배경 클릭으로 닫기 (기본: true)
  backgroundColor: 'bg-blue-500/50', // 배경색 (기본: 'bg-black/40')
  contentClassName: 'w-[400px]',     // 컨텐츠 스타일 (기본: '')
  animationType: 'slide',            // 애니메이션 (기본: 'fade')
  statusBarTranslucent: false,       // 상태바 투명 (기본: true)
});
```

### 🔹 모달 스택 관리
```tsx
const { getModalStack, closeAllModals } = useModal();

// 현재 모달 스택 확인
const currentStack = getModalStack();
console.log('현재 모달 개수:', currentStack.length);

// 모든 모달 닫기
const handleCloseAll = () => {
  closeAllModals();
};
```

---

## 💡 실제 사용 예시

### 🔹 삭제 확인 모달
```tsx
const handleDeleteItem = async (itemId: string) => {
  const result = await openModal(ConfirmModal, {
    title: '삭제 확인',
    message: '이 항목을 삭제하시겠습니까?',
    confirmText: '삭제',
    cancelText: '취소',
  });

  if (result.confirmed) {
    await deleteItem(itemId);
    showToast('삭제되었습니다.');
  }
};
```

### 🔹 다단계 폼 모달
```tsx
const handleUserRegistration = async () => {
  // 1단계: 기본 정보 입력
  const step1 = await openModal(UserInfoModal, {
    title: '기본 정보를 입력하세요'
  });
  
  if (!step1.success) return;
  
  // 2단계: 추가 정보 입력
  const step2 = await pushModal(AdditionalInfoModal, {
    title: '추가 정보를 입력하세요',
    userInfo: step1.data
  });
  
  if (!step2.success) {
    // 2단계에서 취소 시 1단계로 돌아가기
    await popModal();
    return;
  }
  
  // 3단계: 최종 확인
  const step3 = await pushModal(ConfirmModal, {
    message: `입력된 정보가 맞습니까?\n이름: ${step1.data.name}\n이메일: ${step2.data.email}`,
    confirmText: '가입하기',
    cancelText: '수정하기'
  });
  
  if (step3.confirmed) {
    await registerUser({ ...step1.data, ...step2.data });
    showToast('가입이 완료되었습니다!');
  } else {
    // 수정을 위해 1단계로 돌아가기
    await popModal();
    await popModal();
  }
};
```

### 🔹 설정 모달
```tsx
const handleSettings = async () => {
  const result = await openModal(SettingsModal, {
    currentSettings: userSettings
  }, {
    enableBackdropClose: false,  // 실수로 닫히지 않도록
    backgroundColor: 'bg-black/60'
  });
  
  if (result.saved) {
    await updateSettings(result.data);
    showToast('설정이 저장되었습니다.');
  }
};
```

---

## 📚 API 레퍼런스

### 🔹 useModal 훅
```tsx
const {
  openModal,      // 새 모달 열기 (기존 모달들 모두 닫음)
  pushModal,      // 모달 스택에 추가
  popModal,       // 현재 모달 닫고 이전 모달로 돌아가기
  closeModal,     // 현재 모달 닫기 (popModal과 동일)
  closeAllModals, // 모든 모달 닫기
  getModalStack,  // 현재 모달 스택 반환
} = useModal();
```

### 🔹 모달 옵션 타입
```tsx
interface ModalOptions {
  enableBackdropClose?: boolean;    // 배경 클릭으로 닫기 (기본: true)
  backgroundColor?: string;         // 배경색 (기본: 'bg-black/40')
  contentClassName?: string;        // 컨텐츠 스타일 클래스 (기본: '')
  animationType?: 'fade' | 'slide' | 'none';  // 애니메이션 (기본: 'fade')
  statusBarTranslucent?: boolean;   // 상태바 투명 (기본: true)
}
```

### 🔹 DefaultBtn 컴포넌트
```tsx
<DefaultBtn
  onPress={handlePress}           // 필수: 버튼 클릭 핸들러
  text="버튼 텍스트"               // 필수: 버튼에 표시할 텍스트
  disabled={false}                // 선택: 비활성화 여부
  buttonClassName="..."           // 선택: 버튼 스타일 클래스
  textClassName="..."             // 선택: 텍스트 스타일 클래스
  enableHapticFeedback={true}     // 선택: 햅틱 피드백 (기본: true)
  enableSound={true}              // 선택: 사운드 효과 (기본: true)
  flex={true}                     // 선택: flex-1 적용 여부 (기본: true)
/>
```

---

## 🎯 핵심 포인트

### ✅ DO (해야 할 것)
- 모달에서는 `flex={false}` 사용
- 결과는 명확한 구조로 반환 (`success`, `action`, `data`)
- `try-catch`로 모달 결과 처리
- 모달 스택은 논리적인 순서로 구성

### ❌ DON'T (하지 말아야 할 것)
- 모달에서 `flex={true}` 사용 (레이아웃 깨짐)
- 결과 없이 `onClose()` 호출
- 모달 스택을 무한정 쌓기
- 배경 클릭으로 닫으면 안 되는 중요한 모달에서 `enableBackdropClose: true` 사용

---

## 🚀 시작하기

1. **App.tsx에 ModalProvider 추가**
2. **간단한 모달 컴포넌트 만들기**
3. **useModal 훅으로 모달 열기**
4. **결과 처리하기**

이제 복잡한 모달 플로우도 쉽게 관리할 수 있습니다! 🎉
