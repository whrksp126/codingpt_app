#import <React/RCTBridgeModule.h>

// NotifTray.swift 의 RN 브리지 등록(RCT_EXTERN_MODULE) — JS: NativeModules.NotifTray.
@interface RCT_EXTERN_MODULE(NotifTray, NSObject)
RCT_EXTERN_METHOD(cancelByNotifIds:(NSArray *)ids)
@end
