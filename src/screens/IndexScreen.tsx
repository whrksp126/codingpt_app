import React, { useEffect, useState } from 'react';
import BootSplash from 'react-native-bootsplash';

import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { useLesson } from '../contexts/LessonContext';
import { useStore } from '../contexts/StoreContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';

import AuthNavigator from '../navigation/AuthNavigator';
import RootNavigator from '../navigation/RootNavigator';
import SplashScreen from './SplashScreen';
import MobileIDEHost from './MobileIDE/MobileIDEHost';

/**
 * 인덱스 게이트 스크린
 * - 로그인 상태 확인 → 안됐으면 로그인 화면
 * - 로그인된 경우: 홈 진입 전 **실제 초기 데이터(사용자/학습/상점/프로젝트)** 가 모두 로드될 때까지
 *   스플래시에서 대기하며 현재 처리 단계와 실제 진행률을 표시한다.
 *   → 메인 화면은 데이터가 모두 세팅된 뒤에만 보인다(빈/미적용 화면 방지).
 *
 * 데이터 로딩은 각 Context(User/Store/Lesson)가 앱 시작 시 자동 수행(Lesson 은 user 의존 → user 후 자동).
 * 여기선 각 loading 플래그를 관찰해 게이팅한다.
 */
const IndexScreen: React.FC = () => {
  const { isLoggedIn, loading: authLoading, logout } = useAuth();
  const { user, loading: userLoading } = useUser();
  const { loading: lessonLoading } = useLesson();
  const { loading: storeLoading } = useStore();
  // 워크스페이스+세션 프리로드(드로어/홈 최근세션을 미리 세팅). loading 종료 = 준비됨.
  const { loading: workspacesLoading } = useWorkspaceStore();

  const [graceDone, setGraceDone] = useState(false);

  // 세션은 유효(토큰 OK)하지만 사용자 정보 로드에 실패 → 깨진 세션.
  // (예: 로컬 백엔드에 해당 토큰의 사용자 레코드가 없음 / 서버에서 탈퇴됨)
  // 빈 화면으로 진입시키지 않고 세션을 정리해 로그인 화면으로 되돌린다.
  //
  // 단, 로그인 직후엔 login()(isLoggedIn=true) → refreshUser() 순서라
  // user 가 채워지기 전 찰나가 존재한다. 즉시 로그아웃하면 그 레이스에서
  // 정상 로그인까지 끊어버리므로, 짧은 유예 동안 user 가 들어오면 취소한다.
  const sessionMaybeBroken = isLoggedIn && !authLoading && !userLoading && !user;
  useEffect(() => {
    if (!sessionMaybeBroken) return;
    const t = setTimeout(() => { logout().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [sessionMaybeBroken, logout]);

  // 네이티브 부트스플래시를 즉시 내려 JS 스플래시(진행 바)가 보이게.
  useEffect(() => {
    BootSplash.hide({ fade: true }).catch(() => {});
  }, []);

  // 실제 데이터 로딩 단계(표시 순서)
  // 사용자 단계는 loading 종료가 아니라 **user 객체 확보**를 완료 기준으로 본다.
  // (로드 실패 시 user 가 null 인 채로 done 처리되어 빈 화면 진입하는 것을 방지)
  // 워크스페이스/세션은 WorkspaceStoreContext 가 로그인 직후 프리로드 → 드로어/홈 최근세션이 즉시 채워짐.
  const steps = [
    { done: !userLoading && !!user, label: '사용자 정보를 불러오는 중' },
    { done: !lessonLoading, label: '학습 데이터를 불러오는 중' },
    { done: !storeLoading, label: '상점 정보를 불러오는 중' },
    { done: !workspacesLoading, label: '워크스페이스와 세션을 불러오는 중' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const dataReady = isLoggedIn && !authLoading && doneCount === steps.length;
  const current = steps.find((s) => !s.done);

  // 완료 후 바가 100% 채워지는 걸 보여주는 짧은 마무리(실 로드 외 추가 지연 아님 — 시각적 마감).
  useEffect(() => {
    if (!dataReady) { setGraceDone(false); return; }
    const t = setTimeout(() => setGraceDone(true), 420);
    return () => clearTimeout(t);
  }, [dataReady]);

  // 최초 진입(스플래시)은 한 번만. 이후 화면에서 당겨서 새로고침 등으로 컨텍스트 loading 이 다시
  // true 가 되어도 스플래시로 되돌아가지 않게 "부팅 완료"를 래치한다. (로그아웃 시 리셋)
  const [bootDone, setBootDone] = useState(false);
  useEffect(() => { if (dataReady && graceDone) setBootDone(true); }, [dataReady, graceDone]);
  useEffect(() => { if (!isLoggedIn) setBootDone(false); }, [isLoggedIn]);

  // ── 렌더 ──
  if (authLoading) {
    return <SplashScreen progress={0.06} message="로그인 상태를 확인하고 있어요" />;
  }
  if (!isLoggedIn) {
    return <AuthNavigator />;
  }
  if (!bootDone && (!dataReady || !graceDone)) {
    return (
      <SplashScreen
        progress={dataReady ? 1 : doneCount / steps.length}
        message={dataReady ? '워크스페이스를 준비하고 있어요' : current?.label ?? '워크스페이스를 준비하고 있어요'}
      />
    );
  }

  // RootNavigator 위에 IDE 오버레이를 상주시킨다(언마운트 없이 보임/숨김 → 상태 보존).
  return (
    <>
      <RootNavigator />
      <MobileIDEHost />
    </>
  );
};

export default IndexScreen;
