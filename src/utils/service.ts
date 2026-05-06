import Config from 'react-native-config';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const isEmulator = DeviceInfo.isEmulatorSync();

const resolveLocalUrl = (
  emulatorHost: string,
  realDeviceUrl: string | undefined,
  port: string,
): string => {
  if (isEmulator) {
    return `http://${emulatorHost}:${port}`;
  }
  return realDeviceUrl!;
};

const BACK_PORT = '5300';
const FRONT_PORT = '3100';

const BACK_URL =
  Config.NODE_ENV === 'local'
    ? Platform.OS === 'android'
      ? resolveLocalUrl('10.0.2.2', Config.ANDROID_BACK_URL, BACK_PORT)
      : resolveLocalUrl('localhost', Config.IOS_BACK_URL, BACK_PORT)
    : Config.BACK_URL!;

const FRONT_URL =
  Config.NODE_ENV === 'local'
    ? Platform.OS === 'android'
      ? resolveLocalUrl('10.0.2.2', Config.ANDROID_FRONT_URL, FRONT_PORT)
      : resolveLocalUrl('localhost', Config.IOS_FRONT_URL, FRONT_PORT)
    : Config.FRONT_URL!;

export { BACK_URL, FRONT_URL };
