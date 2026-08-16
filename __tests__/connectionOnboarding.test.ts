import { keyMatchesHost } from '../src/components/onboarding/ConnectionOnboardingGate';
import fs from 'node:fs';
import path from 'node:path';

describe('connection onboarding trust matching', () => {
  it('keeps the settings modal mounted in every onboarding stage', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/components/onboarding/ConnectionOnboardingGate.tsx'), 'utf8');
    expect(source).toContain("if (stage === 'ready') return <>{children}<SettingsModal /></>;");
    expect(source).toContain('<SettingsModal visible={settingsOpen}');
  });

  const host = {
    id: 42,
    name: 'GH-MACui-MacBookPro',
    platform: 'darwin',
    role: 'host',
    runnerKind: 'local',
    online: true,
    isCurrent: false,
  } as any;

  it('does not trust a same-named computer with a different device id', () => {
    expect(keyMatchesHost({
      state: 'trusted',
      deviceId: 7,
      label: 'GH-MACui-MacBookPro',
      platform: 'macos',
    } as any, host)).toBe(false);
  });

  it('trusts the key bound to the stable server device id', () => {
    expect(keyMatchesHost({
      state: 'trusted',
      deviceId: 42,
      label: 'Renamed Mac',
      platform: 'darwin',
    } as any, host)).toBe(true);
  });
});
