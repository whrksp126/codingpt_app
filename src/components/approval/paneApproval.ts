import { useMemo } from 'react';

import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import type { ApprovalRow } from '../../services/approvalService';

/**
 * "이 터미널의" 대기 중 승인/질문 — 터미널 단위 스코프의 **정본**.
 *
 * ★ 2026-07-28 사용자 확정: 승인·질문 카드는 **그 터미널 탭을 보고 있을 때만** 뜬다.
 *   (실사고: codex 탭을 보고 있는데 claude 탭의 AskUserQuestion 카드가 화면 하단에 떠 있었다.
 *    PC 는 전역 스택으로 그렸고, 모바일은 `a.win == null` 을 통과시키는 헐거운 예외가 있었다.)
 *
 * 그래서 매칭은 **엄격 일치**다: 같은 워크스페이스(cwd) + 같은 터미널(win = 안정 tid).
 *  · `a.win` 이 없는(구 데몬이 터미널 좌표를 못 실은) 요청은 어느 탭에도 붙이지 않는다.
 *    → 답할 길이 사라지는 건 아니다: 알림 패널 → 승인 카드(ApprovalHost 모달)로 여전히 응답한다.
 *    "남의 터미널에 뜨는 것" 보다 "그 탭에 안 뜨는 것" 이 덜 나쁘다(남의 대화 금지 원칙과 같은 비대칭).
 */
export function paneApprovals(all: ApprovalRow[], cwd: string, win: number | null): ApprovalRow[] {
  if (!cwd || win == null) return [];
  return all
    .filter((a) => (a.cwd || '') === cwd && a.win === win)
    .sort((x, y) => y.requestedAt - x.requestedAt);
}

/** 이 터미널의 대기 목록(최신 우선). 없으면 빈 배열. */
export function usePaneApprovals(cwd: string, win: number | null): ApprovalRow[] {
  const S = useWorkspaceShell();
  return useMemo(() => paneApprovals(S.approvals, cwd, win), [S.approvals, cwd, win]);
}

/** 이 터미널에서 **아직 답할 수 있는** 요청 — 탭의 점(다른 탭이 나를 부른다)용.
 *  만료분(PC 터미널로 넘어간 건)은 세지 않는다: 그 탭을 열어도 할 수 있는 일이 없다. */
export function paneApprovalCount(all: ApprovalRow[], cwd: string, win: number | null): number {
  return paneApprovals(all, cwd, win).filter((a) => !a.expired).length;
}
