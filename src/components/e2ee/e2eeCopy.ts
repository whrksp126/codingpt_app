// e2eeCopy.ts — 설정(종단간 암호화)·기기 승인 화면의 **문구 계약 정본 미러**.
//
// 정본 = `docs/구현설계-2026-07-25/14-설정-카피-감사.md` §4. 앱과 PC 가 **글자까지 같은 문구**를 써야
//  한다(사용자가 폰과 PC 를 나란히 놓고 대조한다 — 한 글자 차이가 곧 버그로 읽힌다). 그래서 화면
//  컴포넌트에 문자열을 흩뿌리지 않고 여기 한 곳에 모은다: 회귀 테스트(`__tests__/e2eeCopy.test.ts`)가
//  이 표를 고정하고, 삭제한 16개 문구가 소스에 다시 나타나지 않는지도 함께 단정한다.
//
// ★ 축약해도 절대 지워지지 않는 것(§5 — 지우면 보안이 무너진다):
//   · `appr.instr`   두 화면 눈 대조가 서버 MITM 차단의 전부(§2.10). '글자까지' + '다르면 거절' 유지.
//   · `appr.reqno`   4자리(13비트)는 서버가 1.3초에 위조한다 → **대조 대상이 아님**을 라벨에 붙인다.
//   · `appr.noSafety` 대조 기준 없이 승인하는 습관을 막는다(+ 승인 버튼 disabled).
//   · `appr.unverified` 표시값이 서버 지배 상태(verified=false)라는 신호.
//   · host 배지 4종 의미(§2.7 거짓 자물쇠 금지 — '모름' 을 '평문' 으로 단정하지 않는다).
//   · self 배지에 '켜짐' 을 쓰지 않는다(자기 열쇠 보유 ≠ 트래픽 암호화).
//   · `adv.policy.hint` '항상' 은 조작을 막는 파괴적 선택 → 결과 고지 필수.
//   · `adv.rec.shown.warn` 1회 표시·영구 소실 · `adv.keys.revoke.arm` 비가역 경고(결정 순간으로 이동).
//   · `adv.meta.note` 메타데이터 정직성 고지.
//
// ⚠ 배지 문구(self/host)의 **산출**은 `services/e2ee/e2eeState.ts` 가 리터럴로 갖는다(PC 교차검증이
//  함수 본문만 오려 실행하므로 상수 참조를 넣을 수 없다). 여기 값은 그 산출과 같아야 하고,
//  `e2eeCopy.test.ts` 가 두 곳의 일치를 단정한다.

export const E2EE_COPY = {
  //  `noHost` = host 행이 0개인 상태(PC 를 꺼 뒀거나 아직 연결 전). 빈 화면으로 두면 첫 화면이
  //   "제목 + 초록 배지" 두 줄로 끝나 사용자는 '내 데이터가 안전하다' 로 읽는데, 실제 의미는 '이 폰에
  //   열쇠가 있다' 뿐이다(§2.7 정직성 기제가 화면에서 사라진다) → 한 행을 그려 기제를 유지한다.
  card: { title: '종단간 암호화', noHost: '연결된 PC 없음' },

  // 카드 제목 행 우측 배지(self) — e2eeState.stateLabel() 산출과 동일해야 한다.
  selfBadge: {
    ready: '열쇠 있음',
    pending: '승인 대기',
    checking: '확인 중',
    nokey: '열쇠 없음', // PC 전용 산출(keyState=none & checking=false = 영구 평문)
    off: '꺼짐',
    unsupported: '미지원',
    unavailable: '사용 불가',
    error: '오류',
  },

  // PC 별 행 배지(host) — e2eeState.hostLockLabel() 산출과 동일해야 한다.
  hostBadge: {
    encrypted: '암호화됨',
    hostPlain: '평문(열쇠 없음)',
    checking: '확인 중',
    selfPlain: '평문',
  },

  // 행동 행 — 동시 1개만. 우선순위: approve > selfWait > (PC 부트스트랩) > needUpdate
  act: {
    approve: (n: number) => `새 기기 ${n}대 승인`,
    selfWait: '기존 기기에서 승인해 주세요',
    //  ★ 기기를 **전부 잃은** 사용자는 승인해 줄 기기가 0대다 — 위 지시는 실행 불가능하고 유일한 출구
    //   (복구 코드)는 접힌 `자세히` 안에 있다. 첫 화면에 그 존재를 알리는 1줄이 없으면 사용자는 오지
    //   않는 승인을 영원히 기다린다. 그래서 경로까지 적는다(부제 1줄, 앱·PC 동일).
    selfWaitHint: '기기가 없으면 자세히 → 복구 코드로 복원',
    needUpdate: '앱을 업데이트하면 켜집니다',
  },

  adv: {
    toggle: '자세히',
    policy: {
      label: '암호화 사용',
      //  ★ 목적어('조작')를 지우지 않는다: '항상' 은 파일 편집·터미널을 전부 막는 파괴적 선택인데
      //   확인 절차 없는 1탭 세그먼트다 → 무엇이 막히는지가 이 15자에 다 들어 있어야 한다(§5).
      hint: '자동 권장 · 항상 = 안 되면 조작 차단',
      off: '끄기',
      auto: '자동',
      required: '항상',
    },
    safety: { label: '이 기기 안전 코드', hint: '다른 기기 화면과 같은지 확인' },
    //  (구 `adv.fp` = 자세히 ③ '지문' 행은 삭제했다 — ⑤ 열쇠 목록의 자기 행이 같은 6자리를 '이 기기'
    //   배지와 함께 이미 보여 준다. 완전 중복이고 아무 행동도 유발하지 않는 행이었다)
    rec: {
      label: '복구 코드',
      hintUnset: '기기를 다 잃으면 복구 불가',
      hintSet: '새로 만들면 이전 코드 무효',
      btnCreate: '만들기',
      btnRenew: '새로 만들기',
      shownWarn: '지금 적어두세요 · 다시 못 봅니다',
      shownBtn: '적어뒀어요',
      restoreLabel: '복구 코드로 복원',
      restoreBtn: '복원',
      restoreDone: '복구 완료',
      placeholder: 'CPT1-XXXXX-…',
    },
    keys: { title: '열쇠를 가진 기기', mine: '이 기기', revokeArm: '다시 눌러 해제 · 되돌릴 수 없음' },
    meta: { note: '폴더명·알림 제목은 서버가 봅니다' },
  },

  sheet: { title: '기기 승인', empty: '승인할 기기가 없어요' },

  appr: {
    head: '새 기기 승인',
    // [필수-보안] 39자 = 20자 목표의 의도적 예외. 두 행동 지시('글자까지'·'다르면 거절')를 유지한다.
    instr: '아래 코드가 새 기기 화면과 글자까지 같으면 승인, 다르면 거절하세요.',
    reqno: (code: string) => `요청 ${code} · 대조용 아님`,
    deny: '거절',
    approve: '승인',
    unverified: '요청 번호는 서버 값 · 코드로만 대조하세요',
    noSafety: '안전 코드를 아직 못 만들었어요 · 승인하지 마세요',
  },

  //  ★ `wait.noSafety` 는 `appr.noSafety` 와 **다른 문구여야 한다**: 대기 화면은 새 기기 자신이 보고
  //   그 화면에는 승인 버튼이 없다. 승인자용 '승인하지 마세요' 를 재사용하면 "여기서 뭘 승인하나" 로
  //   읽혀 지시 대상이 어긋난다 → 누르지 말아야 할 곳(기존 기기)을 명시한다. 보안 지시는 유지.
  wait: {
    title: '기존 기기에서 승인해 주세요',
    noSafety: '안전 코드를 아직 못 만들었어요 · 기존 기기에서 승인하지 마세요',
    refresh: '승인됐는지 확인',
    refreshBusy: '확인 중…',
  },

  err: {
    approve: '승인하지 못했어요',
    deny: '거절하지 못했어요',
    recovery: '복구 코드를 만들 수 없어요',
    restore: '코드가 올바르지 않아요',
    revoke: '해제하지 못했어요',
  },
} as const;

export default E2EE_COPY;
