import fs from 'fs';
import path from 'path';

describe('앱 시작 게이트', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/screens/IndexScreen.tsx'),
    'utf8',
  );

  it('핵심 사용자·워크스페이스 데이터만 기다린다', () => {
    expect(source).toContain('!userLoading && !!user');
    expect(source).toContain('!workspacesLoading');
  });

  it('동결된 학습·상점 데이터가 원격 셸 진입을 막지 않는다', () => {
    expect(source).not.toContain("useLesson()");
    expect(source).not.toContain("useStore()");
    expect(source).not.toContain('lessonLoading');
    expect(source).not.toContain('storeLoading');
  });
});
