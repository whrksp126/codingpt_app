import React from 'react';
import { RefreshControl } from 'react-native';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;

/**
 * 데이터 페이지 공통 당겨서 새로고침 컨트롤 — v2 다크 톤(민트 스피너).
 * ScrollView/FlatList 의 refreshControl prop 에 그대로 전달.
 */
export function sheetRefreshControl(refreshing: boolean, onRefresh: () => void) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={C.accent}
      colors={[C.accent]}
      progressBackgroundColor={C.surface}
    />
  );
}
