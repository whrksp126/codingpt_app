// 백엔드 codeFillExecutionUtils.buildAnswerKey 와 동일 알고리즘.
// codeFillTheGapV2 의 cachedResults lookup 키.
//
// 형식: JSON.stringify(answers.map((a, i) => [i, a.userAnswer ?? null]))
//   → 예: '[[0,"div"],[1,"p"]]'
export const buildAnswerKey = (answers: Array<{ userAnswer?: string | null }> | undefined | null): string =>
  JSON.stringify((answers || []).map((a, i) => [i, a?.userAnswer ?? null]));
