// 코드 리뷰 화면의 문구. text/index.ts 의 규율을 따른다.
//  ⚠ PC(codingpt_pc/src/js/text/review.js)에 같은 키·같은 뜻의 사전이 있다(대조 테스트).
//  값에 문장 조립을 넣지 않는다 — 개수가 들어가는 문구는 **함수 값**이다(어순이 언어마다 다르다).
import type { Dict } from './index';
import * as i18n from '../i18n/index.ts';

export type ReviewText = {
  title: string; prev: string; next: string;
  approve: string; reject: string; approved: string; rejected: string;
  approveAll: string; approveEverything: string;
  comment: string; commentPlaceholder: string; commentSave: string; commentCancel: string;
  removeComment: string;
  note: string; notePlaceholder: string;
  send: string; sending: string; cancel: string;
  remaining: (n: number) => string;
  allDecided: string;
  commentCount: (n: number) => string;
  truncated: string; empty: string; gone: string; sendFailed: string; cancelConfirm: string;
  why: string;
};

export const REVIEW_TEXT: Dict<ReviewText> = {
  ko: {
    title: "코드 리뷰",
    prev: "이전 파일",
    next: "다음 파일",
    approve: "승인",
    reject: "거절",
    approved: "승인함",
    rejected: "거절함",
    approveAll: "이 파일 전부 승인",
    approveEverything: "전부 승인",
    comment: "코멘트",
    commentPlaceholder: "이 줄에 대해 하고 싶은 말",
    commentSave: "달기",
    commentCancel: "취소",
    removeComment: "코멘트 지우기",
    note: "전체 메모",
    notePlaceholder: "전체적으로 하고 싶은 말(선택)",
    send: "보내기",
    sending: "보내는 중…",
    cancel: "리뷰 취소",
    allDecided: "전부 정했어요",
    truncated: "변경이 너무 커서 앞부분만 보여요",
    empty: "이 파일에 표시할 변경이 없어요",
    gone: "이 리뷰는 이미 끝났어요",
    sendFailed: "보내지 못했어요",
    cancelConfirm: "리뷰를 취소하면 에이전트에게 '취소'가 전달돼요. 계속할까요?",
    why: "터미널의 AI 가 이 변경을 봐 달라고 요청했어요",
    remaining: (n: number) => i18n.t('{n}곳 남음', { n }),
    commentCount: (n: number) => (n ? i18n.t('코멘트 {n}개', { n }) : i18n.t('코멘트 없음')),
  },

};
