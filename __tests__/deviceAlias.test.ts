import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'src/components/e2ee/E2eeSettingsCard.tsx'), 'utf8');
const daemon = fs.readFileSync(path.join(root, 'src/services/daemonService.ts'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'src/services/notificationService.ts'), 'utf8');

describe('기기 별칭 계약', () => {
  it('현재 기기만 편집 UI를 노출하고 서버에 저장한다', () => {
    expect(settings).toContain("editable={isCur && typeof d.id === 'number'}");
    expect(settings).toContain('daemonService.renameOwnDevice(d.id, name)');
    expect(settings).toContain('onEditCancel');
  });

  it('다른 기기의 변경 이벤트를 받으면 목록 정본을 다시 읽는다', () => {
    expect(notifications).toContain("m.type !== 'device_updated'");
    expect(notifications).toContain('deviceUpdatedListener?.()');
    expect(daemon).toContain("method: 'PATCH'");
    expect(daemon).toContain("'x-device-uuid': deviceUuid");
  });
});
