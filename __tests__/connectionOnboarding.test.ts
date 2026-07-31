import { keyMatchesHost } from '../src/components/onboarding/ConnectionOnboardingGate';

describe('connection onboarding trust matching', () => {
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
