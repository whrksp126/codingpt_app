#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// CptApproval.swift 의 RN 브리지 등록(RCT_EXTERN_MODULE) — JS: NativeModules.CptApproval.
//  RCTEventEmitter 상속(이벤트 1종: cptApprovalActions — 알림 액션이 큐에 쌓였음을 알린다).
@interface RCT_EXTERN_MODULE(CptApproval, RCTEventEmitter)

RCT_EXTERN_METHOD(pendingActions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ackActions:(NSArray *)uids)

RCT_EXTERN_METHOD(registerChoiceCategory:(NSString *)approvalId
                  labels:(NSArray *)labels)

RCT_EXTERN_METHOD(dropChoiceCategories:(NSArray *)approvalIds)

@end
