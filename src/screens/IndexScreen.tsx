import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { useLesson } from '../contexts/LessonContext';
import { useStore } from '../contexts/StoreContext';
import { useHearts } from '../contexts/HeartContext';

import AuthNavigator from '../navigation/AuthNavigator';
import RootNavigator from '../navigation/RootNavigator';

/**
 * 인덱스 게이트 스크린
 * - 앱 최초 진입 시: 로그인 상태 확인
 * - 로그인된 경우: 홈에 들어가기 전에 필요한 데이터들을 모두 병렬 프리패치
 * - 로그아웃 상태: 로그인 화면 표시
 * - 로그인 성공(토큰 저장) 후에는 다시 이 화면으로 돌아와 동일 로직 수행
 */
const IndexScreen: React.FC = () => {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const { refreshUser } = useUser();
  const { reloadStoreData } = useStore();
  const { reloadLessons } = useLesson();
  const { refresh: refreshHearts } = useHearts();

  // 프리패치 진행/완료 상태
  const [prefetchDone, setPrefetchDone] = useState(false);
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    // 아직 로그인 여부 판단 중이면 대기
    if (authLoading) return;

    // 로그인되지 않은 경우 로그인 화면 표시
    if (!isLoggedIn) {
      setPrefetchDone(false);
      hasPrefetchedRef.current = false;
      return;
    }

    // 로그인 상태: 홈 진입 전 필요한 리소스 병렬 로딩
    const prefetch = async () => {
      if (hasPrefetchedRef.current) return;
      hasPrefetchedRef.current = true;
      try {
        // await Promise.all([
        //   refreshUser(),      // 유저 프로필 + 잔디(heatmap) + 학습일수 계산
        //   reloadStoreData(),  // 상점/상품 카테고리 전체
        //   refreshHearts(),   // 하트 상태/남은시간
        //   reloadLessons(),  // 수강/레슨 트리, 진행률 등
        // ]);
        setPrefetchDone(true);
      } catch (e) {
        // 토큰 만료/네트워크 실패 등: 다음 렌더에서 AuthNavigator가 보이게끔
        setPrefetchDone(false);
        hasPrefetchedRef.current = false;
      }
    };
    prefetch();
  }, [authLoading, isLoggedIn, refreshUser, reloadStoreData]);
  
  // 1) 아직 로그인 상태 판단 중이면 스피너
  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
        <Text className="mt-2 text-[#606060]">로그인 상태 확인 중...</Text>
      </View>
    );
  }

  // 2) 로그아웃 상태면 로그인 네비게이터
  if (!isLoggedIn) {
    return <AuthNavigator />; // 로그인 성공 시 AuthContext가 isLoggedIn=true로 바뀌고 다시 Index 로직 실행됨
  }

  // 3) 로그인 상태면서 프리패치가 아직이면 로딩 스켈레톤
  // if (!prefetchDone) {
  //   return (
  //     <View className="flex-1 items-center justify-center bg-white">
  //       <ActivityIndicator size="large" />
  //       <Text className="mt-2 text-[#606060]">학습 데이터를 준비 중이에요...</Text>
  //     </View>
  //   );
  // }

  // 4) 프리패치 완료 → RootNavigator(새 하단 탭 포함) 표시
  return <RootNavigator />;
};

export default IndexScreen;