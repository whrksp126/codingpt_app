import fs from 'node:fs';
import path from 'node:path';

describe('workspace add surface popover', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/workspace/AddSurfaceSheet.tsx'),
    'utf8',
  );

  it('opens beside the top-right plus button instead of as a bottom sheet', () => {
    expect(source).toContain('top: insets.top + 50, right: 8, width: 200');
    expect(source).toContain('backgroundColor: C.elevated');
    expect(source).not.toContain("bottom: 0");
    expect(source).not.toContain("left: 0, right: 0");
    expect(source).not.toContain("borderTopLeftRadius");
  });

  it('keeps the same four named tools as the PC add menu', () => {
    for (const kind of ['terminal', 'ide', 'preview', 'emulator']) {
      expect(source).toContain(`kind: '${kind}'`);
    }
  });
});
