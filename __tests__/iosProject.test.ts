import fs from 'node:fs';
import path from 'node:path';

// ios/codingpt.xcodeproj/project.pbxproj 무결성.
//
// 왜 필요한가(2026-09-06 실사고): 네이티브 모듈을 추가하며 다른 파일이 이미 쓰던 UUID 를 재사용했더니
//  xcodebuild 가 **아무 경고 없이** 새 파일을 빌드에서 빼 버렸다. 컴파일 0건, 링크 0건, 빌드는 성공,
//  앱에는 모듈이 없다 — JS 는 NativeModules.X 가 undefined 라 조용히 폴백해서 기능만 사라진다.
//  같은 이유로 "파일은 만들었는데 Xcode 에 등록을 안 함" 도 여기서 잡는다.
const PROJ = path.join(__dirname, '../ios/codingpt.xcodeproj/project.pbxproj');
const SRC_DIR = path.join(__dirname, '../ios/codingpt');
const raw = fs.readFileSync(PROJ, 'utf8');

describe('ios project.pbxproj', () => {
  it('UUID 가 유일하다 — 충돌하면 파일이 조용히 빌드에서 빠진다', () => {
    // 정의 자리(줄 시작의 `<UUID> /* ... */ = {`)만 센다. 참조는 여러 번 나오는 게 정상이다.
    const defined = [...raw.matchAll(/^\t\t([0-9A-F]{24}) \/\* .+ \*\/ = \{/gm)].map((m) => m[1]);
    const dup = defined.filter((id, i) => defined.indexOf(id) !== i);
    expect([...new Set(dup)]).toEqual([]);
  });

  it('ios/codingpt 의 네이티브 소스가 모두 Sources 빌드 단계에 들어 있다', () => {
    const sources = fs.readdirSync(SRC_DIR).filter((f) => /\.(swift|m|mm)$/.test(f));
    expect(sources.length).toBeGreaterThan(0);
    const missing = sources.filter((f) => !raw.includes(`${f} in Sources`));
    expect(missing).toEqual([]);
  });

  it('등록된 파일 참조의 실제 경로가 존재한다 — 유령 참조 금지', () => {
    const refs = [...raw.matchAll(/path = (codingpt\/[A-Za-z0-9_.+-]+\.(?:swift|m|mm)); sourceTree/g)]
      .map((m) => m[1]);
    const gone = refs.filter((r) => !fs.existsSync(path.join(__dirname, '..', 'ios', r)));
    expect(gone).toEqual([]);
  });
});
