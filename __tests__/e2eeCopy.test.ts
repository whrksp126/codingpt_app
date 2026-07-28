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
  'src/components/e2ee/e2eeCopy.ts',
  'src/services/e2ee/e2eeState.ts',
];

describe('카피 계약 — 확정 문구(§4 · 개정 4)', () => {
  it('카드/배지/행동 행 문구가 정본 그대로다', () => {
    //  ★ 개정 9: 카드 제목 `기기` 는 **삭제**됐다 — `이 기기`/`다른 기기` 가 곧 그룹(카드)이다
    //   (원문: "이기기, 다른 기기로 그룹을 나눠서 해주고"). 제목이 남으면 계층이 3겹으로 되돌아간다.
    expect((COPY.card as Record<string, unknown>).title).toBeUndefined();
    //  개정 7: 목록은 `이 기기`/`다른 기기` 로 나뉜다. self 배지(열쇠 있음)와 그 배지를 정직하게
    //   보정하던 `연결된 PC 없음` 행은 함께 폐기됐다 — 사용자에게 열쇠는 알 필요 없는 내부 수단이다.
    expect(COPY.card.thisDevice).toBe('이 기기');
    expect(COPY.card.otherDevices).toBe('다른 기기');
    expect(COPY.card.noOther).toBe('연결된 기기가 없어요');
    expect((COPY.card as Record<string, unknown>).noHost).toBeUndefined();
    expect(COPY.selfBadge).toEqual({
      ready: '열쇠 있음', pending: '승인 대기', checking: '확인 중', nokey: '열쇠 없음',
      off: '꺼짐', unsupported: '미지원', unavailable: '사용 불가', error: '오류',
    });
    expect(COPY.hostBadge).toEqual({
      encrypted: '암호화됨', hostPlain: '평문(열쇠 없음)', checking: '확인 중', selfPlain: '평문',
    });
    //  ★ 개정 9: 요약 줄(`새 기기 N대가 승인을 기다려요`)은 **삭제**됐다 — 그 사실은 대기 중인 기기
    //   **행**이 말한다(미확인 점 + `승인 대기` + 탭 → 승인 표면). 사실을 두 군데서 말하지 않는다.
    expect((COPY.act as Record<string, unknown>).approve).toBeUndefined();
    //  개정 5: 대기 안내는 **누를 기기**를 가리킨다(폰 화면이므로 PC). PC 화면이 쓰는 짝 문구는
    //   `wait.titleFromMobile` 이고 PC 교차검증(test/e2ee-crossimpl.mjs §6)이 그것을 대조한다.
    //  개정 12: `selfWait`(승인 대기 안내)는 승인 개념과 함께 폐기됐다.
    expect((COPY.act as Record<string, unknown>).selfWait).toBeUndefined();
    // 개정 4: 자동 부트스트랩의 진행/실패 표시 — PC settings.js 와 같은 문구여야 한다.
    expect(COPY.act.bootstrapping).toBe('암호화를 준비하고 있어요…');
    expect(COPY.act.bootstrapFail).toBe('암호화를 켜지 못했어요 · 잠시 후 다시 시도합니다');
    expect(COPY.act.needUpdate).toBe('앱을 업데이트하면 켜집니다');
    // 개정 4: `자세히`(adv.*) 는 통삭제 — 되살아나면 상세 설정 화면이 재발한다(사용자 확정 위반).
    expect((COPY as Record<string, unknown>).adv).toBeUndefined();
    expect((COPY.act as Record<string, unknown>).selfWaitHint).toBeUndefined();
    expect(COPY.row.revokeArm).toBe('다시 눌러 해제 · 되돌릴 수 없음');
    expect(COPY.link.placeholder).toBe('8자 코드');
  });


  //  ★ 개정 12(2026-07-28 사용자 확정) — **승인 절차 폐기, 코드로 연동**.
  //   원문: "승인하기 뭐 그런건 다 제거하자!" · "이기기 영역에서는 이기기 정보인 qr과 코드가 자세히
  //   보기 클릭 시 보이게" · "연동 안된 것들은 연동 버튼이 보이게 하고 그거 클릭하면 … 코드를 입력".
  //   보안의 핵심은 **코드가 채널**이라는 것이다: 서버엔 해시만 가고, 봉인문은 HKDF(code) 로 한 겹 더
  //   감싼다 → 서버가 공개키를 바꿔치기해도 만들 수도 열 수도 없다(사람의 눈 대조가 불필요).
  it('연동은 코드로 한다 — 승인 표면이 전부 사라졌다(개정 12)', () => {
    const svc = stripComments(SRC('src/services/e2ee.ts'));
    //  코드는 로컬 난수, 서버에는 해시만.
    expect(svc).toContain('export async function linkStart');
    expect(svc).toContain('codeHash');
    expect(svc).toMatch(/core\.sha256\(core\.utf8\(code\)\)/);
    //  감싸기 키는 **코드에서만** 파생한다(서버는 코드를 모르므로 만들 수 없다).
    expect(svc).toContain('function linkWrapKey');
    expect(svc).toMatch(/hkdf\(core\.utf8\(code/);
    //  상대가 코드를 맞히면 **자동으로** 봉인문을 올린다(사람 개입 0) — 승인 이벤트가 아니다.
    expect(svc).toMatch(/kind === 'link_claim'\) void linkFulfill/);
    expect(svc).toContain('export async function linkClaim');
    //  혼동 문자를 뺀 코드 문자셋(사람이 받아쓴다).
    expect(svc).not.toMatch(/LINK_ALPHABET = '[A-Z0-9]*[OIL01][A-Z0-9]*'/);

    //  승인 표면 3종은 **파일째** 사라졌다.
    for (const f of ['src/components/e2ee/DeviceTrustHost.tsx', 'src/components/e2ee/DeviceLinkGate.tsx', 'src/components/e2ee/e2eeUi.ts']) {
      expect(fs.existsSync(path.resolve(__dirname, '..', f))).toBe(false);
    }
    const shell = stripComments(SRC('src/contexts/WorkspaceShellContext.tsx'));
    expect(shell).not.toContain('openDeviceTrustSheet');
    const notif = stripComments(SRC('src/components/NotificationsPanel.tsx'));
    expect(notif).not.toContain('openDeviceTrustSheet');

    //  설정 화면: 이 기기 = 코드 표시(자세히 보기), 다른 기기 행 = 코드 입력.
    const card = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(card).toContain('function MyLinkCode');
    expect(card).toContain('function LinkCodeEntry');
    expect(card).toContain('e2eeSvc.linkStart()');
    expect(card).toContain('e2eeSvc.linkClaim(v)');
    expect(card).not.toContain('nudgeLink');
    expect(COPY.link.show).toBe('자세히 보기');
    expect(COPY.link.connect).toBe('연결');
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




  //  ★ 개정 7(2026-07-28 사용자 확정) — 목록을 **이 기기 / 다른 기기**로 나누고, 사용자가 몰라도 되는
  //   값(열쇠 배지·지문)을 전부 뺐다. 원문: "기기 목록에 이 기기까지 표현하니까 보기도 안 좋고
  //   복잡해지는 거 같은데!" · "android, ios 기기들에서 기기 열쇠 있음 표현을 왜 하고 있는 거야?!"
  it('기기 목록은 이 기기/다른 기기로 나뉘고 열쇠·지문·배지를 그리지 않는다(개정 7)', () => {
    const src = stripComments(SRC('src/components/e2ee/E2eeSettingsCard.tsx'));
    expect(src).toContain('COPY.card.thisDevice');
    expect(src).toContain('COPY.card.otherDevices');
    expect(src).toMatch(/otherDevices = useMemo/);
    //  self 배지(열쇠 있음)·행별 암호화 배지·'이 기기' 배지 = 전부 부재. Pill 자체가 사라졌다.
    expect(src).not.toContain('<Pill');
    expect(src).not.toContain('COPY.row.mine');
    expect(src).not.toContain('hostBadges');
    //  지문(🔒 숫자)은 어떤 행에도 없다 — 고아 열쇠 행도 '이전에 연동된 기기' 로만 말한다.
    expect(src).not.toContain('🔒');
    expect(src).toContain('COPY.row.wasLinked');
  });



  //  ★ 개정 9 — 로그아웃·회원 탈퇴는 계정 화면 **맨 아래**(원문: "제일 아래로 내려줘! pc, andorid, ios 다!").
  it('로그아웃·회원 탈퇴가 기기 섹션보다 뒤에 있다(개정 9)', () => {
    const src = stripComments(SRC('src/components/SettingsModal.tsx'));
    const devices = src.indexOf('<E2eeSettingsCard />');
    const logout = src.indexOf('이 기기에서 로그아웃');
    const del = src.indexOf('회원 탈퇴 시 계정과 모든 데이터가');
    expect(devices).toBeGreaterThan(0);
    expect(logout).toBeGreaterThan(devices);
    expect(del).toBeGreaterThan(logout);
  });


  //  ★ 429(레이트리밋)가 대기 상태를 '오류' 로 붕괴시키던 실사고 — 폴링 주기와 429 처리를 함께 고정한다.
  //   5초 폴링 = 분당 12회 enroll 이고 서버 상한은 10회/분이었다 → 승인 대기 중인 폰이 스스로 오류가 됐다.
  it('승인 대기 폴링이 서버 레이트리밋을 때리지 않고, 429 를 오류로 만들지 않는다', () => {
    const svc = stripComments(SRC('src/services/e2ee.ts'));
    expect(svc).toMatch(/if \(r\.status === 429\) \{[\s\S]{0,400}state = 'bootstrap'/);
    expect(svc).not.toMatch(/pollTimer = setTimeout\(tick, 5000\)/);
    //  ★ 2차 수정(승인 후 25초 실측): 대기 폴링은 **레이트리밋 없는 keyring** 으로 본다. enroll 은
    //   등록 신선도 유지용으로만 60초에 1회. 그리고 중복 enroll 을 합친다(0.05초 간격 쌍이 실제로 찍혔다).
    expect(svc).toContain('const POLL_MS = 8000');
    expect(svc).toContain('const REENROLL_EVERY_MS = 60000');
    expect(svc).toContain('async function adoptViaKeyring');
    expect(svc).toMatch(/if \(await adoptViaKeyring\(\)\) return;/);
    expect(svc).toContain('let enrollInFlight');
    expect(svc).toContain('const ENROLL_MIN_GAP_MS = 2000');
    //  승인 완료 반영은 id 일치를 요구하지 않는다(만료·재신청으로 갈리면 이벤트를 흘려버렸다).
    expect(svc).toMatch(/kind === 'resolved' && state === 'pending'\) void adoptViaKeyring\(\)/);
    //  열쇠를 기기 행에 묶는 근거 — 모바일은 JWT 라 서버가 deviceId 를 모른다(고아 열쇠 + 연동 안 됨).
    expect(svc).toContain('deviceId: await myDeviceId()');
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
    //  (개정 12: `자세히 보기` 는 **다시 정당한 문구**다 — 이 기기의 연동 코드를 펼치는 토글이다.
    //   구 '자세히'(정책·복구·안전 코드 상시 행을 담던 접기 섹션)와는 다른 물건이라 목록에서 뺀다.)
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
    // ── ★ 개정 9(2026-07-28 사용자 확정: 요약 줄 폐기 → 기기 행이 말한다) ──
    '대가 승인을 기다려요',
    '알림에서 승인할 수 있어요',
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
    // 기기 목록은 그대로다(개정 7: host 행·self 배지 삭제 — 아래 개정 7 절이 부재를 고정한다).
    expect(src).toContain('COPY.card.otherDevices');
    //  ★ 개정 6: 인라인 승인 카드(<DeviceTrustCard>)는 **삭제**됐다 — 승인은 사건 표면(시트·알림·
    //   전역 카드)의 일이다(사용자 확정). 행 배지도 사라졌으므로 hostLockLabel 호출은 남지만
    //   그 값은 그리지 않는다(판정 함수는 계약과 함께 존치 — 아래 개정 6 절이 부재를 고정한다).
    expect(src).not.toContain('<DeviceTrustCard');
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

  it('카드 테두리는 바깥 1겹뿐이다(행에 박스 금지)', () => {
    const t = src();
    //  ★ 개정 12: 카드 = Section 하나뿐(`이 기기`/`다른 기기` 가 각각 이 컴포넌트를 쓴다).
    //   행에는 배경·테두리·라운드를 주지 않는다. 코드 입력 인풋·버튼은 **행 안의 컨트롤**이라 예외다.
    expect((t.match(/borderWidth: 1, borderColor: C\.border(?![A-Za-z])/g) || []).length).toBe(1);
    expect(t).not.toContain('borderColor: C.warn');
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

});
