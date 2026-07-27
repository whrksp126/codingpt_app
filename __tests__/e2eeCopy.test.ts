/**
 * 설정·승인 화면 **카피 계약** 회귀 (docs/구현설계-2026-07-25/14-설정-카피-감사.md §4).
 *
 * 왜 테스트로 고정하는가:
 *  ① 사용자가 폰과 PC 를 나란히 놓고 안전 코드를 대조한다 → 문구 한 글자 차이가 곧 "다른 화면" 으로
 *    읽힌다. 그래서 앱==PC 문구가 계약이다(PC 쪽은 `codingpt_pc/test/contract.mjs` + 앱 소스를 읽는
 *    `test/e2ee-crossimpl.mjs` 가 같은 값을 고정한다).
 *  ② 축약 라운드에서 지운 문구가 **다시 기어들어오는 것**을 막는다(선례: e2ee.test.ts 의
 *    "top-level 난수 재발 금지" 소스 단정). 텍스트가 늘어나면 사용자는 다시 아무것도 읽지 않는다.
 *  ③ 보안상 반드시 남겨야 하는 문구(§5)는 **존재 자체**를 단정한다 — 축약 과정에서 조용히 사라지면
 *    눈 대조(서버 MITM 차단의 전부)가 무너진다.
 */
import fs from 'fs';
import path from 'path';
import COPY from '../src/components/e2ee/e2eeCopy';
import { hostLockLabel, stateLabel } from '../src/services/e2ee/e2eeState';

const SRC = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
/** 주석은 카피가 아니다 — "왜 지웠는가" 를 코드에 남기려면 주석에는 구 문구가 등장할 수 있다. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

const FILES = [
  'src/components/e2ee/E2eeSettingsCard.tsx',
  'src/components/e2ee/DeviceTrustCard.tsx',
  'src/components/e2ee/DeviceTrustHost.tsx',
  'src/components/e2ee/e2eeCopy.ts',
  'src/services/e2ee/e2eeState.ts',
];

describe('카피 계약 — 확정 문구(§4)', () => {
  it('카드/배지/행동 행 문구가 정본 그대로다', () => {
    // 2026-07-27 개정 2: '종단간 암호화' 카드 + '내 기기' 목록을 한 섹션(`기기`)으로 합쳤다.
    //  기능명은 자세히 안 정책 행 제목이 갖는다(adv.policy.label) — 화면에서 사라지지 않는다.
    expect(COPY.card.title).toBe('기기');
    expect(COPY.card.noHost).toBe('연결된 PC 없음');
    expect(COPY.selfBadge).toEqual({
      ready: '열쇠 있음', pending: '승인 대기', checking: '확인 중', nokey: '열쇠 없음',
      off: '꺼짐', unsupported: '미지원', unavailable: '사용 불가', error: '오류',
    });
    expect(COPY.hostBadge).toEqual({
      encrypted: '암호화됨', hostPlain: '평문(열쇠 없음)', checking: '확인 중', selfPlain: '평문',
    });
    expect(COPY.act.approve(3)).toBe('새 기기 3대 승인');
    expect(COPY.act.selfWait).toBe('기존 기기에서 승인해 주세요');
    expect(COPY.act.selfWaitHint).toBe('기기가 없으면 자세히 → 복구 코드로 복원');
    expect(COPY.act.needUpdate).toBe('앱을 업데이트하면 켜집니다');
    expect(COPY.adv.toggle).toBe('자세히');
  });

  it('자세히 안 문구가 정본 그대로다(순서 ①~⑥)', () => {
    expect(COPY.adv.policy.label).toBe('종단간 암호화');
    expect(COPY.adv.policy.hint).toBe('자동 권장 · 항상 = 안 되면 조작 차단');
    expect([COPY.adv.policy.off, COPY.adv.policy.auto, COPY.adv.policy.required]).toEqual(['끄기', '자동', '항상']);
    expect(COPY.adv.safety.label).toBe('이 기기 안전 코드');
    expect(COPY.adv.safety.hint).toBe('다른 기기 화면과 같은지 확인');
    // 자세히 ③ '지문' 행은 삭제했다(⑤ 자기 행이 같은 값을 '이 기기' 배지와 함께 보여 준다) —
    //  되살아나면 같은 6자리가 한 화면에 두 번 뜬다.
    expect((COPY.adv as Record<string, unknown>).fp).toBeUndefined();
    expect(COPY.adv.rec.label).toBe('복구 코드');
    expect(COPY.adv.rec.hintUnset).toBe('기기를 다 잃으면 복구 불가');
    expect(COPY.adv.rec.hintSet).toBe('새로 만들면 이전 코드 무효');
    expect(COPY.adv.rec.btnCreate).toBe('만들기');
    expect(COPY.adv.rec.btnRenew).toBe('새로 만들기');
    expect(COPY.adv.rec.shownWarn).toBe('지금 적어두세요 · 다시 못 봅니다');
    expect(COPY.adv.rec.shownBtn).toBe('적어뒀어요');
    expect(COPY.adv.rec.restoreLabel).toBe('복구 코드로 복원');
    expect(COPY.adv.rec.restoreBtn).toBe('복원');
    expect(COPY.adv.rec.restoreDone).toBe('복구 완료');
    expect(COPY.adv.rec.placeholder).toBe('CPT1-XXXXX-…');
    expect(COPY.adv.meta.note).toBe('폴더명·알림 제목은 서버가 봅니다');
    // 구 '열쇠를 가진 기기' 목록은 삭제했다(개정 2) — 열쇠 보유는 기기 행의 🔒 지문으로 흡수됐고,
    //  같은 기기가 두 목록에 중복 등장하던 화면이 하나로 합쳐졌다. 되살아나면 중복이 재발한다.
    expect((COPY.adv as Record<string, any>).keys).toBeUndefined();
    expect(COPY.row.mine).toBe('이 기기');
    expect(COPY.row.revokeArm).toBe('다시 눌러 해제 · 되돌릴 수 없음');
  });

  it('승인 시트/카드·대기 화면·에러 문구가 정본 그대로다', () => {
    expect(COPY.sheet).toEqual({ title: '기기 승인', empty: '승인할 기기가 없어요' });
    expect(COPY.appr.head).toBe('새 기기 승인');
    expect(COPY.appr.instr).toBe('아래 코드가 새 기기 화면과 글자까지 같으면 승인, 다르면 거절하세요.');
    expect(COPY.appr.reqno('0727')).toBe('요청 0727 · 대조용 아님');
    expect([COPY.appr.deny, COPY.appr.approve]).toEqual(['거절', '승인']);
    expect(COPY.appr.unverified).toBe('요청 번호는 서버 값 · 코드로만 대조하세요');
    expect(COPY.appr.noSafety).toBe('안전 코드를 아직 못 만들었어요 · 승인하지 마세요');
    expect(COPY.wait.title).toBe('기존 기기에서 승인해 주세요');
    // 대기 화면(새 기기 자신)에는 승인 버튼이 없다 → 승인자용 문구를 재사용하지 않는다
    expect(COPY.wait.noSafety).toBe('안전 코드를 아직 못 만들었어요 · 기존 기기에서 승인하지 마세요');
    expect(COPY.wait.noSafety).not.toBe(COPY.appr.noSafety);
    expect(COPY.wait.refresh).toBe('승인됐는지 확인');
    expect(COPY.wait.refreshBusy).toBe('확인 중…');
    expect(COPY.err).toEqual({
      approve: '승인하지 못했어요', deny: '거절하지 못했어요',
      recovery: '복구 코드를 만들 수 없어요', restore: '코드가 올바르지 않아요', revoke: '해제하지 못했어요',
    });
  });

  // ★ 라벨은 **판정 함수**가 산출한다(PC 교차검증이 함수 본문만 오려 실행하므로 리터럴이어야 한다).
  //   그래서 카피 표와 산출값이 어긋날 수 있다 → 여기서 둘을 묶는다. 문구가 바뀌면 양쪽이 같이 바뀐다.
  it('배지 산출(e2eeState) == 카피 표(앱==PC 동치의 앱 측 앵커)', () => {
    expect(stateLabel({ state: 'trusted', policy: 'preferred', ready: true }).text).toBe(COPY.selfBadge.ready);
    expect(stateLabel({ state: 'pending', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.pending);
    expect(stateLabel({ state: 'bootstrap', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.checking);
    expect(stateLabel({ state: 'trusted', policy: 'off', ready: true }).text).toBe(COPY.selfBadge.off);
    expect(stateLabel({ state: 'unsupported', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.unsupported);
    expect(stateLabel({ state: 'unavailable', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.unavailable);
    expect(stateLabel({ state: 'error', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.error);
    expect(hostLockLabel(true, 3, 3, 3).text).toBe(COPY.hostBadge.encrypted);
    expect(hostLockLabel(true, 0).text).toBe(COPY.hostBadge.hostPlain);
    expect(hostLockLabel(true, undefined).text).toBe(COPY.hostBadge.checking);
    expect(hostLockLabel(false, 3).text).toBe(COPY.hostBadge.selfPlain);
    // self 배지에 '켜짐' 을 쓰지 않는다(자기 열쇠 보유 ≠ 트래픽 암호화 — §2.7 거짓 자물쇠 금지)
    expect(Object.values(COPY.selfBadge)).not.toContain('켜짐');
    expect(stateLabel({ state: 'off', policy: 'off', ready: false }).text).toBe(COPY.selfBadge.off);
    // ★ '확인 중' 은 앱에서 死문구가 아니다 — 열쇠 없는 미결정 구간(enroll 직전 · 네트워크 실패)이
    //   'bootstrap' 이므로 실제로 도달한다(그 대입은 e2ee.test.ts 가 소스로 고정한다).
    expect(stateLabel({ state: 'bootstrap', policy: 'preferred', ready: false }).text).toBe(COPY.selfBadge.checking);
  });

  // 첫 화면의 '설명문 0줄' 은 **행동 행이 뜰 때 reason 을 숨기는 것**까지가 계약이다 — 데몬·서버가 만든
  //  reason 원문(40~70자)이 행동 행과 같은 사실을 다시 말하면 축약 효과가 상쇄되고, 부트스트랩처럼
  //  서로 상충하는 지시("폰에서 켜라" vs 이 PC 의 켜기 버튼)가 한 화면에 겹친다.
  it('행동 행이 있으면 reason 을 그리지 않는다(§3-A 설명문 0줄)', () => {
    const src = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(src).toContain("label.tone !== 'on' && st.reason && !action");
  });

  it('보안상 반드시 남긴 문구가 살아 있다(§5)', () => {
    // 눈 대조 지시 2개('글자까지' + '다르면 거절')가 한 문장에 다 있어야 한다
    expect(COPY.appr.instr).toContain('글자까지');
    expect(COPY.appr.instr).toContain('다르면 거절');
    // 4자리는 서버가 준 13비트 값 = 대조 대상이 아니다
    expect(COPY.appr.reqno('0727')).toContain('대조용 아님');
    // 대조 기준이 없으면 승인하지 말라고 말하고, 승인 버튼도 비활성이어야 한다
    expect(COPY.appr.noSafety).toContain('승인하지 마세요');
    const card = stripComments(SRC('src/components/e2ee/DeviceTrustCard.tsx'));
    expect(card).toContain('disabled={!!busy || !hasSafety}');
    // ★ disabled 는 **화면에 보여야** 계약이다: PressableScale 은 style 의 opacity 를 항상 덮으므로
    //   (PressableScale.tsx:38 useAnimatedStyle) 흐림은 baseOpacity prop 으로만 먹는다. style 에 쓰면
    //   비활성 버튼이 100% 밝기로 렌더돼 사용자는 평소와 똑같은 [승인] 을 눌러 무반응을 겪는다.
    expect(card).toContain('baseOpacity={!hasSafety ? 0.45 : (busy ? 0.7 : 1)}');
    expect(card).not.toMatch(/opacity: !hasSafety/);
    const settings = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(settings).toContain('baseOpacity=');
    expect(settings).not.toMatch(/style=\{\{[^}]*opacity:/);
    // '항상' 의 파괴적 결과 고지 · 복구 코드 1회성 · 신뢰 해제 비가역성 · 메타데이터 정직성
    //  ★ 목적어('조작')를 지우면 무엇이 막히는지 알 수 없다 — 확인 절차 없는 1탭 세그먼트다.
    expect(COPY.adv.policy.hint).toContain('조작 차단');
    expect(COPY.adv.rec.shownWarn).toContain('다시 못 봅니다');
    expect(COPY.row.revokeArm).toContain('되돌릴 수 없음');
    expect(COPY.adv.meta.note).toContain('서버가 봅니다');
  });
});

// ★ 삭제한 문구가 소스에 **다시 나타나지 않는지** 고정한다(주석은 제외 — 근거를 남기는 자리다).
//   16개 완전 삭제 + 축약으로 사라진 긴 문장들. 하나라도 되살아나면 첫 화면이 다시 설명문 4줄이 된다.
describe('카피 회귀 — 삭제한 문구가 되살아나지 않는다(§3-A)', () => {
  const DELETED = [
    '이 기기 준비됨',
    '이 PC 는 평문(열쇠 없음)',
    '이 기기에는 열쇠가 있어요',
    '지원되는 기기끼리는 자동으로',
    '승인을 기다리는 기기',
    '이 기기 승인 대기 중',
    '자동 = 양쪽이 지원하면 암호화',
    'QR 로 재검증',
    '대조는 이 값으로 합니다',
    '기기 목록 표기용 지문',
    '지문이 자동 검증됩니다',
    '모든 기기를 잃으면 열쇠를 되살릴 수 없어요',
    '복구 코드가 있어요',
    'CPT1-XXXXX-XXXXX-…',
    '이 화면을 닫으면 다시 볼 수 없어요',
    '신뢰를 해제하면 열쇠를 새로 만들어',
    '회수할 수 없습니다',
    '암호화해도 폴더명·브랜치명',
    '열쇠를 가진 기기',
    '이 빌드에는 보안 저장소',
    '에서 접속 시도',
    '한 글자라도 다르면 거절해 주세요',
    '요청 번호 ',
    '구분용 — 이 숫자로 대조하지 마세요',
    '서버는 열쇠를 볼 수 없습니다',
    '이 기기를 신뢰 목록에 추가해 주세요',
    '이미 쓰던 기기(폰·PC)에 승인 요청이 도착했어요',
    '승인 전에도 내 PC 목록',
    '대기 중인 기기 승인 요청이 없어요',
    '이 기기에서 직접 계산한 값과 달랐습니다',
    '승인을 전달하지 못했어요',
    '거절을 전달하지 못했어요',
    '오타를 확인해 주세요',
    '신뢰 해제에 실패했어요',
  ];

  it.each(FILES)('%s 에 삭제 문구가 없다', (rel) => {
    const src = stripComments(SRC(rel));
    for (const phrase of DELETED) expect(src).not.toContain(phrase);
  });

  it('첫 화면에 상시 설명문이 없다(설명은 자세히 안으로만)', () => {
    const src = SRC('src/components/e2ee/E2eeSettingsCard.tsx');
    // 접기 토글이 있고, 정책·안전코드·지문·복구·열쇠목록·메타 고지가 전부 그 안에 있다.
    const at = src.indexOf('{advOpen ?');
    expect(at).toBeGreaterThan(0);
    const inside = src.slice(at);
    for (const key of ['adv.policy.label', 'adv.safety.label', 'adv.rec.label', 'adv.meta.note']) {
      expect(src.indexOf(`COPY.${key}`)).toBeGreaterThan(at);
      expect(inside).toContain(`COPY.${key}`);
    }
    // host 행(§2.7 정직성 기제)은 반대로 **접기 밖**이어야 한다 — 절대 접지 않는다.
    expect(src.indexOf('hostLockLabel(')).toBeLessThan(at);
    // host 가 0개여도 그 자리를 비우지 않는다(초록 배지 한 줄만 남으면 '안전하다' 로 읽힌다).
    expect(src.indexOf('COPY.card.noHost')).toBeGreaterThan(0);
    expect(src.indexOf('COPY.card.noHost')).toBeLessThan(at);
    // 기기 목록·승인 행도 **접기 밖**이다(개정 2: 목록이 곧 이 섹션의 본문이다).
    expect(src.indexOf('COPY.row.mine')).toBeLessThan(at);
    expect(src.indexOf('COPY.act.approve(')).toBeLessThan(at);
    // 승인은 **그 자리에서** 한다 — 목록 안 인라인 승인 카드(시트로만 보내지 않는다).
    expect(src).toContain('<DeviceTrustCard');
    // 열쇠를 가진 기기 삭제 = 열쇠 해제 + 세대 회전까지(back revokeDevice 는 회전을 하지 않는다).
    expect(src).toContain('revokeTrustAndRotate');
    expect(src).toContain('daemonService.revokeDevice');
  });
});

// ★ 2026-07-27 개정 3(사용자 요구: "기기 목록에서 카드 안에 카드 구조인데 그렇게 안햇으면 좋겠어!
//   차라리 테이블 구조는 어떨까") — 구조 계약이다. 화면 조립은 렌더 없이 볼 수 없으므로(이 리포의
//   jest 는 reanimated ESM 때문에 이 카드를 렌더할 수 없다) 소스 형태로 고정한다. 되돌아가면
//   "섹션 카드 안에 행 카드" 가 다시 겹친다. PC 쪽 같은 계약 = codingpt_pc/test/contract.mjs ⑦.
describe('표 구조 — 카드 안에 카드 금지(개정 3)', () => {
  const src = () => stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));

  it('카드 테두리는 바깥 1겹뿐이다(행·행동 행에 박스 금지)', () => {
    const s = src();
    // 카드 테두리(C.border)는 섹션 카드 하나뿐.
    expect((s.match(/borderWidth: 1, borderColor: C\.border(?![A-Za-z])/g) || []).length).toBe(1);
    // 나머지 borderWidth 는 **컨트롤** 테두리다(버튼·입력) — 카드가 아니다.
    expect((s.match(/borderWidth: 1, borderColor: C\.borderControl/g) || []).length).toBe(2);
    expect((s.match(/borderWidth: 1/g) || []).length).toBe(3);
    // 구 행동 행 박스(테두리 warn + 라운드)가 되살아나지 않는다.
    expect(s).not.toContain('borderColor: C.warn');
  });

  it('행은 공유 상수 ROW(1px 구분선)로만 구분된다', () => {
    const s = src();
    expect(s).toContain('const ROW = {');
    expect(s).toMatch(/borderTopWidth: 1,\s*\n\s*borderTopColor: C\.border,/);
    // 기기 행 + 승인 행 + 업데이트 행이 같은 상수를 쓴다(행마다 스타일이 갈라지면 표가 아니다).
    expect((s.match(/style=\{ROW\}/g) || []).length).toBeGreaterThanOrEqual(3);
    // 열은 고정 비율이다: 이름(flex 1.3 — 잘리면 어느 기기인지 알 수 없다) · 메타(flex 1) · 상태 ·
    //  삭제(고정 폭 22 = 버튼 있는 행/없는 행의 열 경계가 흔들리지 않게).
    expect(s).toContain('flex: 1.3, minWidth: 0');
    expect(s).toContain('width: 22');
  });

  it('예외 박스는 펼친 승인 카드 하나뿐이다(대기 행은 flat)', () => {
    expect(src()).toMatch(/<DeviceTrustWaiting\s*\n\s*flat/);
    const card = stripComments(SRC('src/components/e2ee/DeviceTrustCard.tsx'));
    // 같은 컴포넌트가 두 맥락을 지원한다: 표 안(flat) / 승인 시트(박스 = 그 화면의 유일한 내용).
    expect(card).toContain('flat?: boolean');
    expect(card).toMatch(/flat\s*\n?\s*\?\s*\{ borderTopWidth: 1/);
    expect(card).toMatch(/: \{ backgroundColor: C\.elevated, borderWidth: 1/);
  });
});
