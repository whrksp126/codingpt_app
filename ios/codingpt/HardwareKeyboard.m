#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// HardwareKeyboard.swift 의 RN 브리지 등록 — JS: NativeModules.HardwareKeyboard.
@interface RCT_EXTERN_MODULE(HardwareKeyboard, RCTEventEmitter)
RCT_EXTERN_METHOD(getConnected:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
