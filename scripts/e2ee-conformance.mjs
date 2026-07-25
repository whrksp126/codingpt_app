// e2ee-conformance.mjs — 모바일 순수 JS 암호 구현 ↔ **데몬 runner-core/e2ee.js** 바이트 동치 검증.
//
//   실행:  node scripts/e2ee-conformance.mjs        (jest 에서도 __tests__/e2eeConformance.test.ts 가 호출)
//
// 왜 별도 node 스크립트인가: 데몬은 형제 리포의 CJS 모듈이고 @babel/runtime 이 없다 → jest 변환기를
//  통과시키면 helper 해석에 실패한다. 순수 node 로 "있는 그대로" 로드해야 진짜 동치를 검증할 수 있다.
//
// ⚠ HOME 격리: 데몬 e2ee 모듈은 `~/.codingpt/e2ee.json` 을 읽고 쓴다. 격리 없이 돌리면 개발자 PC 의
//   **실제 데몬 열쇠 파일을 덮어쓴다**. 아래에서 임시 HOME 을 먼저 설정한 뒤 모듈을 로드한다.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nc from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.resolve(here, '../../codingpt_service/codingpt_daemon/packages/runner-core/e2ee.js');
if (!fs.existsSync(DAEMON)) {
  console.log('SKIP: 데몬 리포가 없어 동치 검증을 건너뜁니다 —', DAEMON);
  process.exit(0);
}

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cpt-e2ee-conf-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;
process.env.CPT_E2EE = '1';

const core = await import('../src/services/e2ee/e2eeCore.js');
const proto = await import('../src/services/e2ee/e2eeProto.js');
const D = createRequire(DAEMON)(DAEMON);

core.setRandomSource((n) => nc.randomBytes(n));
const hex = (b) => Buffer.from(b).toString('hex');
let fail = 0;
const ok = (name, cond) => {
  if (cond) console.log('ok   ' + name);
  else { fail += 1; console.log('FAIL ' + name); }
};

// ── 1. grant(MK 봉인) 양방향 ──────────────────────────────────────
{
  const mk = nc.randomBytes(32);
  const cliX = core.x25519Keypair();
  const cliEd = core.ed25519Keypair();
  const dX = D.genX25519();
  const dEd = D.genEd25519();

  const byDaemon = D.sealTo(cliX.pub, { epoch: 2, mk, ikEdPriv: dEd.priv });
  const opened = proto.openGrant(core.b64uDec(byDaemon.sealed), cliX.priv, cliX.pub, 2);
  ok('데몬 봉인 → 클라 개봉', !!opened && hex(opened) === hex(mk));
  ok('데몬 서명 → 클라 검증', proto.verifyGrantSig(dEd.pub, 2, cliX.pub, core.b64uDec(byDaemon.sealed), core.b64uDec(byDaemon.sig)));
  ok('다른 기기 키로는 안 열림', proto.openGrant(core.b64uDec(byDaemon.sealed), core.x25519Keypair().priv, cliX.pub, 2) === null);
  ok('epoch 바꿔치기 거부', proto.openGrant(core.b64uDec(byDaemon.sealed), cliX.priv, cliX.pub, 3) === null);

  const byClient = proto.sealGrant(mk, 2, dX.pub);
  const sig = proto.signGrant(core.concat(cliEd.seed, cliEd.pub), 2, dX.pub, byClient);
  const openedByDaemon = D.openFrom(Buffer.from(byClient), {
    epoch: 2, ikXPriv: dX.priv, ikXPub: dX.pub, approverIkEd: Buffer.from(cliEd.pub), sig: Buffer.from(sig),
  });
  ok('클라 봉인+서명 → 데몬 개봉/검증', hex(openedByDaemon) === hex(mk));
  ok('봉인문 길이 80B(서버 SEALED_LEN)', byClient.length === 80);
}

// ── 2. 봉투 RPC 양방향 ────────────────────────────────────────────
{
  const mk = nc.randomBytes(32);
  D.setMasterKey(2, mk);
  const envD = D.sealRpc('fs.read', { path: 'proj/a/x.ts' }, { epoch: 2, hostDeviceId: 12 });
  const openedC = proto.openRpcRequest(mk, envD, 12);
  ok('데몬 봉투 → 클라 개봉', !!openedC && openedC.m === 'fs.read' && openedC.p.path === 'proj/a/x.ts');
  ok('다른 hostDeviceId 로는 못 연다(AAD 바인딩)', proto.openRpcRequest(mk, envD, 13) === null);
  ok('서버가 보는 봉투에 경로/메서드 없음', !JSON.stringify(envD).includes('fs.read') && !JSON.stringify(envD).includes('proj/a'));

  const envC = proto.sealRpc(mk, 2, 12, core.randomBytes(4), 7, { id: 'x', m: 'fs.write', p: { path: 'a' }, ts: 1 });
  ok('클라 봉투 → 데몬 개봉', D.openRpc(envC, { hostDeviceId: 12 }).m === 'fs.write');
  const respD = D.sealRpcResult({ content: 'hi' }, { epoch: 2, hostDeviceId: 12 });
  ok('데몬 응답 봉투 → 클라 개봉', proto.openRpcResponse(mk, respD, 12).r.content === 'hi');
  const errD = D.sealRpcError(Object.assign(new Error('없는 파일'), { code: 'ENOENT' }), { epoch: 2, hostDeviceId: 12 });
  const errC = proto.openRpcResponse(mk, errD, 12);
  ok('데몬 에러 봉투 → 클라 개봉(ok:false)', errC && errC.ok === false && errC.code === 'ENOENT');
}

// ── 3. 알림 body ──────────────────────────────────────────────────
{
  const mk = nc.randomBytes(32);
  D.setMasterKey(3, mk);
  const body = D.sealNotifBody('작업 완료: 3개 파일', { epoch: 3 });
  ok('데몬 알림 body → 클라 복호', proto.openNotifBody(() => mk, body) === '작업 완료: 3개 파일');
  ok('클라 알림 body → 데몬 복호', D.openNotifBody(proto.sealNotifBody(mk, 3, '폰에서 봉인')) === '폰에서 봉인');
  ok('열쇠 없으면 null(UI 가 🔒 표기)', proto.openNotifBody(() => null, body) === null);
  const n = D.sealNotification({ title: '알림', body: '상세' }, { epoch: 3 });
  ok('봉인 시 subtitle 강제(잠금화면 암호문 방지)', typeof n.subtitle === 'string' && n.subtitle.length > 0);
  ok('평문 알림은 그대로 통과', proto.openNotifBody(() => mk, '그냥 평문') === '그냥 평문');
}

// ── 4. 확인 숫자 / 지문 / 안전코드 ─────────────────────────────────
//  데몬 fingerprint() 는 객체({safety, short, legacy})를 돌려준다 — 세 값을 **각각** 대조한다.
//  ⚠ 과거 이 블록은 객체를 문자열과 비교해 항상 FAIL 이었고(그리고 뒤 줄에서 TypeError 로 죽어
//   나머지 항목이 실행조차 안 됐다), 그 사이 앱/PC 의 파생 오프셋이 데몬과 100% 어긋난 채 방치됐다.
//  사람이 눈으로 대조하는 값이 어긋나면 pickCode 가 항상 "서버가 준 숫자"를 택해(verified=false)
//  MITM 방어가 통째로 무력화된다 — 그래서 이 3건은 하나라도 깨지면 릴리스 불가다.
{
  for (let i = 0; i < 5; i++) {
    const kp = core.x25519Keypair();
    const fp = D.fingerprint(Buffer.from(kp.pub), 77);
    ok(`60비트 안전코드 동일 #${i}`, proto.safetyCode(kp.pub, '77') === fp.safety);
    ok(`6자리 지문 동일 #${i}`, proto.fingerprint6(kp.pub, '77') === fp.legacy);
    ok(`4자리 확인 숫자 동일 #${i}`, proto.verifyCode4(kp.pub, '77') === fp.short);
  }
  // 계정이 다르면 값이 달라진다(userId 바인딩)
  const kp2 = core.x25519Keypair();
  ok('userId 바인딩', proto.safetyCode(kp2.pub, '77') !== proto.safetyCode(kp2.pub, '78'));
}

// ── 5. 복구 코드(자기완결형) ───────────────────────────────────────
{
  const mk = nc.randomBytes(32);
  const codeD = D.recoveryCode({ epoch: 2, mk });
  ok('클라가 만든 코드 = 데몬 코드 문자열 동일', proto.recoveryCode(2, mk) === codeD);
  const p = proto.parseRecoveryCode(codeD);
  ok('데몬 코드 → 클라 파싱', !!p && p.epoch === 2 && hex(p.mk) === hex(mk));
  ok('클라 코드 → 데몬 파싱', hex(D.parseRecoveryCode(proto.recoveryCode(2, mk)).mk) === hex(mk));
  const bad = codeD.slice(0, -1) + (codeD.slice(-1) === '0' ? '1' : '0');
  ok('마지막 1글자 오타 거부', proto.parseRecoveryCode(bad) === null);
}

// ── 6. 스트림 세션/프레임(D단계 준비 — 골든 벡터) ──────────────────
{
  const seed = (t) => nc.createHash('sha256').update(`cpt-e2ee/v1/testvec/${t}`).digest();
  const mk = seed('mk').subarray(0, 32);
  const vPriv = new Uint8Array(seed('viewer-priv').subarray(0, 32));
  const hPriv = new Uint8Array(seed('host-priv').subarray(0, 32));
  const nonceV = new Uint8Array(seed('nonce-viewer').subarray(0, 32));
  const nonceH = new Uint8Array(seed('nonce-host').subarray(0, 32));
  const vPub = core.x25519Public(vPriv);
  const hPub = core.x25519Public(hPriv);
  const routing = { cwd: 'proj/a', paneId: 'p1', win: 3 };
  const common = { purpose: 'pty', transport: 'relay', epoch: 2, hostDeviceId: 12 };
  const cli = proto.deriveSession({
    ...common, clientKey: 'ck_abc123', pubViewer: vPub, pubHost: hPub, nonceViewer: nonceV, nonceHost: nonceH,
    routingCanonical: proto.routingCanonical('pty', routing), privSelf: vPriv, pubPeer: hPub, mk,
  });
  const dae = D.deriveSession({
    ...common, suite: 'cpt-e2ee/v1', client: 'ck_abc123', routing,
    privSelf: vPriv, pubPeer: hPub, pubViewer: vPub, pubHost: hPub, nonceViewer: nonceV, nonceHost: nonceH, mk,
  });
  ok('transcript 바이트 동일', hex(proto.sessionTranscript({
    ...common, clientKey: 'ck_abc123', pubViewer: vPub, pubHost: hPub, nonceViewer: nonceV, nonceHost: nonceH,
    routingCanonical: proto.routingCanonical('pty', routing),
  })) === hex(dae.transcript));
  ok('kV2H 동일', hex(cli.kV2H) === hex(dae.kV2H));
  ok('kH2V 동일', hex(cli.kH2V) === hex(dae.kH2V));
  ok('sid 동일', hex(cli.sid) === hex(dae.sid));
  ok('confirm 동일(호스트 MK 보유 증명)', hex(cli.confirm) === hex(dae.confirm));
  ok('viewerConfirm 동일', hex(cli.viewerConfirm) === hex(dae.viewerConfirm));
  // 호스트 개인키로 파생해도 같은 키에 도달(양쪽 동치)
  const daeHost = D.deriveSession({
    ...common, suite: 'cpt-e2ee/v1', client: 'ck_abc123', routing,
    privSelf: hPriv, pubPeer: vPub, pubViewer: vPub, pubHost: hPub, nonceViewer: nonceV, nonceHost: nonceH, mk,
  });
  ok('뷰어/호스트 양쪽 파생 일치', hex(daeHost.kV2H) === hex(cli.kV2H));

  for (const f of D.vectors().frames || []) {
    const built = proto.sealFrame(cli.kV2H, cli.sid, f.dir, f.kind, f.connId, f.counter, Buffer.from(f.payload, 'hex'));
    ok(`프레임 골든벡터 kind=${f.kind} ctr=${f.counter}`, hex(built) === f.frame);
    const opened = proto.openFrame(cli.kV2H, cli.sid, Buffer.from(f.frame, 'hex'));
    ok(`프레임 개봉 kind=${f.kind}`, !!opened && hex(opened.payload) === f.payload && opened.counter === f.counter);
  }
  // 방향 혼동/다른 sid 거부
  const f0 = proto.sealFrame(cli.kV2H, cli.sid, proto.DIR_V2H, proto.KIND_DATA, 7, 1, core.utf8('x'));
  const tampered = core.concat(f0);
  tampered[1] = proto.DIR_H2V;
  ok('dir 변조 거부', proto.openFrame(cli.kV2H, cli.sid, tampered) === null);
  ok('다른 sid 거부', proto.openFrame(cli.kV2H, core.randomBytes(32), f0) === null);
}

try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) { /* noop */ }
console.log(fail === 0 ? '\nALL CONFORMANT' : `\n${fail} MISMATCH`);
process.exit(fail ? 1 : 0);
