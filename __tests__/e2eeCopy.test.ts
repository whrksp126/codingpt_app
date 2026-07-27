/**
 * 설정·승인 화면 **카피 계약** 회귀 (docs/구현설계-2026-07-25/14-설정-카피-감사.md §4 · §3 개정 4).
 *
 * 왜 테스트로 고정하는가:
 *  ① 사용자가 폰과 PC 를 나란히 놓고 안전 코드를 대조한다 → 문구 한 글자 차이가 곧 "다른 화면" 으로
 *    읽힌다. 그래서 앱==PC 문구가 계약이다(PC 쪽은 `codingpt_pc/test/contract.mjs` + 앱 소스를 읽는
 *    `test/e2ee-crossimpl.mjs` 가 같은 값을 고정한다).
 *  ② 축약 라운드에서 지운 문구가 **다시 기어들어오는 것**을 막는다(선례: e2ee.test.ts 의
 *    "top-level 난수 재발 금지" 소스 단정). 텍스트가 늘어나면 사용자는 다시 아무것도 읽지 않는다.
 *  ③ 보안상 반드시 남겨야 하는 문구(§5)는 **존재 자체**를 단정한다 — 축약 과정에서 조용히 사라지면
 *    눈 대조(서버 MITM 차단의 전부)가 무너진다.
 *
 * ★ 개정 4(2026-07-27 사용자 확정): `자세히`(정책 세그·안전 코드 상시 행·복구 코드·메타 고지)를
 *  **통삭제**했고, 부트스트랩은 자동(행동 행 'bootstrapping'), 승인 지침은 "왜"를 담은 문구로
 *  교체됐다. 삭제 목록의 부재 단정이 이 개정의 회귀 방벽이다.
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

describe('카피 계약 — 확정 문구(§4 · 개정 4)', () => {
  it('카드/배지/행동 행 문구가 정본 그대로다', () => {
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
    //  개정 5: 대기 안내는 **누를 기기**를 가리킨다(폰 화면이므로 PC). PC 화면이 쓰는 짝 문구는
    //   `wait.titleFromMobile` 이고 PC 교차검증(test/e2ee-crossimpl.mjs §6)이 그것을 대조한다.
    expect(COPY.act.selfWait).toBe('내 PC에서 승인해 주세요');
    // 개정 4: 자동 부트스트랩의 진행/실패 표시 — PC settings.js 와 같은 문구여야 한다.
    expect(COPY.act.bootstrapping).toBe('암호화를 준비하고 있어요…');
    expect(COPY.act.bootstrapFail).toBe('암호화를 켜지 못했어요 · 잠시 후 다시 시도합니다');
    expect(COPY.act.needUpdate).toBe('앱을 업데이트하면 켜집니다');
    // 개정 4: `자세히`(adv.*) 는 통삭제 — 되살아나면 상세 설정 화면이 재발한다(사용자 확정 위반).
    expect((COPY as Record<string, unknown>).adv).toBeUndefined();
    expect((COPY.act as Record<string, unknown>).selfWaitHint).toBeUndefined();
    expect(COPY.row.mine).toBe('이 기기');
    expect(COPY.row.revokeArm).toBe('다시 눌러 해제 · 되돌릴 수 없음');
  });

  it('승인 시트/카드·대기 화면·에러 문구가 정본 그대로다', () => {
    expect(COPY.sheet).toEqual({ title: '기기 승인', empty: '승인할 기기가 없어요' });
    // 개정 5: 구글 로그인 확인 구성 — 제목은 사실 진술, 질문 1줄, 거절은 '본인이 아니에요'.
    expect(COPY.appr.head).toBe('새 기기에서 로그인했어요');
    expect(COPY.appr.ask).toBe('본인이 맞나요?');
    expect(COPY.appr.reveal).toBe('코드 확인');
    // 개정 4: "항상 같은 걸 왜 물어보나"(실제 사용자 질문)의 '왜'까지 담은 지침.
    expect(COPY.appr.instr).toBe('새 기기 화면에도 같은 코드가 보이면 승인하세요. 정상이라면 항상 같아요 — 다르면 연결이 안전하지 않은 것이니 거절하세요.');
    expect(COPY.appr.reqno('0727')).toBe('요청 0727 · 대조용 아님');
    expect([COPY.appr.deny, COPY.appr.approve]).toEqual(['본인이 아니에요', '승인']);
    expect(COPY.appr.unverified).toBe('요청 번호는 서버 값 · 코드로만 대조하세요');
    expect(COPY.appr.noSafety).toBe('안전 코드를 아직 못 만들었어요 · 승인하지 마세요');
    expect(COPY.wait.title).toBe('내 PC에서 승인해 주세요');
    expect(COPY.wait.titleFromMobile).toBe('폰·태블릿에서 승인해 주세요');
    expect(COPY.wait.sub).toBe('이미 로그인된 기기에 요청을 보냈어요');
    expect(COPY.wait.later).toBe('나중에');
    // 대기 화면(새 기기 자신)에는 승인 버튼이 없다 → 승인자용 문구를 재사용하지 않는다
    expect(COPY.wait.noSafety).toBe('안전 코드를 아직 못 만들었어요 · 기존 기기에서 승인하지 마세요');
    expect(COPY.wait.noSafety).not.toBe(COPY.appr.noSafety);
    // 개정 5: 수동 새로고침 삭제(승인은 WS resolved 로 자동 반영) — 되살아나면 대기 화면에 버튼이 돌아온다.
    expect((COPY.wait as Record<string, unknown>).refresh).toBeUndefined();
    expect((COPY.wait as Record<string, unknown>).refreshBusy).toBeUndefined();
    // 개정 4: recovery/restore 에러는 복구 UI 와 함께 삭제.
    expect(COPY.err).toEqual({ approve: '승인하지 못했어요', deny: '거절하지 못했어요', revoke: '해제하지 못했어요' });
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

  // 첫 화면의 '설명문 0줄' 은 **행동 행이 뜰 때 reason 을 숨기는 것**까지가 계약이다.
  it('행동 행이 있으면 reason 을 그리지 않는다(§3-A 설명문 0줄)', () => {
    const src = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(src).toContain("label.tone !== 'on' && st.reason && !action");
  });

  it('보안상 반드시 남긴 문구가 살아 있다(§5 · 개정 4 반영)', () => {
    // 눈 대조 지시: 같으면 승인 + 다르면 거절 + '왜'(정상이라면 항상 같다)가 한 문장에 다 있어야 한다
    expect(COPY.appr.instr).toContain('같은 코드가 보이면 승인');
    expect(COPY.appr.instr).toContain('정상이라면 항상 같아요');
    expect(COPY.appr.instr).toContain('거절');
    // 4자리는 서버가 준 13비트 값 = 대조 대상이 아니다
    expect(COPY.appr.reqno('0727')).toContain('대조용 아님');
    // 대조 기준이 없으면 승인하지 말라고 말하고, 승인 버튼도 비활성이어야 한다
    expect(COPY.appr.noSafety).toContain('승인하지 마세요');
    const card = stripComments(SRC('src/components/e2ee/DeviceTrustCard.tsx'));
    expect(card).toContain('disabled={!!busy || !hasSafety}');
    // ★ disabled 는 **화면에 보여야** 계약이다: PressableScale 은 style 의 opacity 를 항상 덮으므로
    //   (PressableScale.tsx:38 useAnimatedStyle) 흐림은 baseOpacity prop 으로만 먹는다.
    expect(card).toContain('baseOpacity={!hasSafety ? 0.45 : (busy ? 0.7 : 1)}');
    expect(card).not.toMatch(/opacity: !hasSafety/);
    const settings = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(settings).not.toMatch(/style=\{\{[^}]*opacity:/);
    expect(COPY.row.revokeArm).toContain('되돌릴 수 없음');
  });

  // ★ 개정 5 구조(2026-07-28 사용자 확정) — 코드는 **접혀** 있고, 접힘 안에서만 그려진다.
  //   대조 채널을 없앤 것이 아니라 기본 노출을 뺐다: `reveal` 토글 + open 조건 안의 SafetyCode.
  it('승인 카드/대기 화면 구조가 개정 5 다(접힌 코드 확인 · 무채색 버튼 · 새로고침 없음)', () => {
    const card = stripComments(SRC('src/components/e2ee/DeviceTrustCard.tsx'));
    expect(card).toContain('COPY.appr.ask');
    expect(card).toContain('RevealToggle');
    // SafetyCode 는 접힘(open) 안에서만 — 상시 노출로 되돌아가면 "코드를 입력해야 하나" 가 재발한다.
    expect(card).toMatch(/open && hasSafety \? \([\s\S]{0,400}<SafetyCode/);
    // 색 규율: accent 채움 버튼·accent 코드 금지(사용자 확정 — accent 는 상태 신호 전용).
    expect(card).not.toContain('backgroundColor: C.accent');
    expect(card).not.toContain('tone={C.accent}');
    // 대기 화면: 스피너 + 안내(sub) + 지연 노출 '나중에', 수동 새로고침 prop 없음.
    expect(card).toContain('COPY.wait.sub');
    expect(card).toContain('COPY.wait.later');
    expect(card).not.toContain('onRefresh');
    expect(card).toMatch(/setTimeout\(\(\) => setShowLater\(true\), 5000\)/);
  });

  // ★ 2026-07-28 실사고: 폰이 **자기 자신의 옛 enrollment** 를 '새 기기 승인' 으로 보고 있었다(눌러도
  //   서버 403). 두 규칙이 각자 다른 층에 있어야 한다 — 한쪽이 빠지면 그 화면이 다시 살아난다.
  it('승인 카드는 승인할 수 있는 요청만 그린다(자기 요청 제외 + 미신뢰 기기 0건)', () => {
    const svc = stripComments(SRC('src/services/e2ee.ts'));
    expect(svc).toContain('if (file && p.ikX === file.ikX.pub) return null;');
    const host = stripComments(SRC('src/components/e2ee/DeviceTrustHost.tsx'));
    expect(host).toContain('const canApprove = status.ready');
    expect(host).toMatch(/canApprove \? S\.trustRequests : \[\]/);
  });
});

// ★ 삭제한 문구가 소스에 **다시 나타나지 않는지** 고정한다(주석은 제외 — 근거를 남기는 자리다).
//   구 16개 완전 삭제(개정 2~3) + ★ 개정 4 의 `자세히` 통삭제분. 되살아나면 상세 설정 화면이 재발한다.
describe('카피 회귀 — 삭제한 문구가 되살아나지 않는다(§3-A · 개정 4)', () => {
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
    // ── ★ 개정 4 통삭제분(카피 감사 §3 개정 4 블록) ──
    //  ('종단간 암호화' 단독 항목은 넣지 않는다 — e2eeState.ts 의 reason 문장("…종단간 암호화를 쓸 수
    //   없어요")에 기능 서술어로 정당하게 등장한다. 정책 행 라벨의 부재는 adv/Seg 부재 단정이 덮는다.)
    '자세히',
    '자동 권장 · 항상 = 안 되면 조작 차단',
    '이 기기 안전 코드',
    '다른 기기 화면과 같은지 확인',
    '복구 코드',
    '기기를 다 잃으면 복구 불가',
    '새로 만들면 이전 코드 무효',
    '지금 적어두세요 · 다시 못 봅니다',
    '적어뒀어요',
    '복구 코드로 복원',
    '복구 완료',
    'CPT1-XXXXX-…',
    '폴더명·알림 제목은 서버가 봅니다',
    '기기가 없으면 자세히 → 복구 코드로 복원',
    '아래 코드가 새 기기 화면과 글자까지 같으면 승인, 다르면 거절하세요.',
    '복구 코드를 만들 수 없어요',
    '코드가 올바르지 않아요',
    // ── ★ 개정 5(2026-07-28 사용자 확정: 구글 로그인 확인 방식) ──
    '기존 기기에서 승인해 주세요',  // → '내 PC에서 승인해 주세요'(누를 기기를 가리킨다)
    '승인됐는지 확인',              // 대기 화면 수동 새로고침 삭제(WS resolved 로 자동 진행)
  ];

  it.each(FILES)('%s 에 삭제 문구가 없다', (rel) => {
    const src = stripComments(SRC(rel));
    for (const phrase of DELETED) expect(src).not.toContain(phrase);
  });

  it('첫 화면 구성이 개정 4 다(자세히 없음 · 목록이 본문 · 인라인 승인 · 자동 부트스트랩)', () => {
    const src = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    // `자세히` 접기 자체가 없다(개정 4).
    expect(src).not.toContain('advOpen');
    expect(src).not.toContain('COPY.adv');
    // 정책 세그·복구 UI 가 없다(정책은 '자동' 고정 — normalize 이펙트만 남는다).
    expect(src).not.toContain('<Seg');
    expect(src).not.toContain('createRecoveryCode');
    expect(src).not.toContain('restoreFromRecovery');
    expect(src).toContain("void e2eeSvc.setPolicy('preferred')");
    // 자동 부트스트랩 진행 행이 있다(수 초짜리 과도 상태를 빈 화면으로 두지 않는다).
    expect(src).toContain("if (st.state === 'bootstrap') return 'bootstrapping'");
    expect(src).toContain('COPY.act.bootstrapping');
    // host 행(§2.7 정직성 기제)·기기 목록·인라인 승인 카드는 그대로다.
    expect(src).toContain('COPY.card.noHost');
    expect(src).toContain('hostLockLabel(');
    expect(src).toContain('<DeviceTrustCard');
    // 열쇠를 가진 기기 삭제 = 열쇠 해제 + 세대 회전까지(back revokeDevice 는 회전을 하지 않는다).
    expect(src).toContain('revokeTrustAndRotate');
    expect(src).toContain('daemonService.revokeDevice');
    // 기기 행 메타에 지문이 없다(고아 열쇠 행만 예외 — 그 행은 지문이 유일한 식별자다).
    expect(src).not.toMatch(/osLabel\(d\), fmtRecent[^\n]*fingerprint/);
  });
});

// ★ 2026-07-27 개정 3 — 구조 계약(카드 안에 카드 금지). 렌더 없이 소스 형태로 고정한다.
describe('표 구조 — 카드 안에 카드 금지(개정 3)', () => {
  const src = () => stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));

  it('카드 테두리는 바깥 1겹뿐이다(행·행동 행에 박스 금지)', () => {
    const s = src();
    expect((s.match(/borderWidth: 1, borderColor: C\.border(?![A-Za-z])/g) || []).length).toBe(1);
    // 개정 4: 컨트롤 테두리(복구 버튼·복원 입력)도 UI 와 함께 사라졌다 — 카드 1겹이 전부다.
    expect((s.match(/borderWidth: 1/g) || []).length).toBe(1);
    expect(s).not.toContain('borderColor: C.warn');
  });

  it('행은 공유 상수 ROW(1px 구분선)로만 구분된다', () => {
    const s = src();
    expect(s).toContain('const ROW = {');
    expect(s).toMatch(/borderTopWidth: 1,\s*\n\s*borderTopColor: C\.border,/);
    // 기기 행 + 승인 행 + 부트스트랩 행 + 업데이트 행이 같은 상수를 쓴다.
    expect((s.match(/style=\{ROW\}/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(s).toContain('flex: 1.3, minWidth: 0');
    expect(s).toContain('width: 22');
  });

  it('예외 박스는 펼친 승인 카드 하나뿐이다(대기 행은 flat)', () => {
    expect(src()).toMatch(/<DeviceTrustWaiting\s*\n\s*flat/);
    const card = stripComments(SRC('src/components/e2ee/DeviceTrustCard.tsx'));
    expect(card).toContain('flat?: boolean');
    expect(card).toMatch(/flat\s*\n?\s*\?\s*\{ borderTopWidth: 1/);
    expect(card).toMatch(/: \{ backgroundColor: C\.elevated, borderWidth: 1/);
  });
});
