// useMicDictation — 입력칸 받아쓰기(STT). 새 작업 시트·한 줄 지시 시트가 여기서 가져다 쓴다.
//
// 구현의 정본은 `workspace/chat/ChatComposer.tsx` 에 있다(이 파일은 그것을 다시 내보낼 뿐이다 — 구현은 한 벌).
//  이유: PC 대조 테스트(codingpt_pc/test/chat-composer.mjs)가 받아쓰기 규칙(같은 엔진·같은 용어 바이어스·최종
//  결과의 앵커 커밋)을 **컴포저 파일에서** 읽어 고정한다. 규칙을 고칠 땐 그 파일을 고친다.
export { useMicDictation, type MicDictation } from '../workspace/chat/ChatComposer';
export { useMicDictation as default } from '../workspace/chat/ChatComposer';
