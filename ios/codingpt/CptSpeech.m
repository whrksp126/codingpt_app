#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// CptSpeech.swift 의 RN 브리지 등록(RCT_EXTERN_MODULE) — JS: NativeModules.CptSpeech.
//  RCTEventEmitter 상속(이벤트 5종: cptSpeechPartial/Final/Error/Volume/End).
@interface RCT_EXTERN_MODULE(CptSpeech, RCTEventEmitter)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
