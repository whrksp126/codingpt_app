
import { htmlTagsStyles, classesStyles } from './htmlStyles';

export const normalizeText = (text: string) => {
    return text.normalize('NFKC').toLowerCase().replace(/[^\w\s\uAC00-\uD7A3]/g, '').replace(/\s/g, '');
};

export const parseHtmlAndMapAlignment = (html: string, alignmentData: any[], mode: 'word' | 'char') => {
    const result: any[] = [];

    // 1. 태그와 텍스트를 분리하는 정규식
    const regex = /<\s*(\/)?\s*([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
    let match;
    let styleStack: any[] = [htmlTagsStyles.body || {}];

    // 임시 노드 저장소
    const fineGrainedNodes: any[] = [];

    while ((match = regex.exec(html)) !== null) {
        const isClosingTag = !!match[1];
        const tagName = match[2]?.toLowerCase();
        const attributes = match[3];
        const textContent = match[4];

        if (tagName) {
            if (tagName === 'br') {
                fineGrainedNodes.push({ text: '\n', style: {}, isBreak: true });
            } else if (isClosingTag) {
                if (styleStack.length > 1) styleStack.pop();
            } else {
                let newStyle = { ...styleStack[styleStack.length - 1] };
                if (htmlTagsStyles[tagName]) newStyle = { ...newStyle, ...htmlTagsStyles[tagName] };
                if (attributes && attributes.includes('class=')) {
                    const classMatch = attributes.match(/class=["']([^"']+)["']/);
                    if (classMatch && classMatch[1]) {
                        const classNames = classMatch[1].split(' ');
                        classNames.forEach((cls: string) => {
                            if (classesStyles[cls]) newStyle = { ...newStyle, ...classesStyles[cls] };
                        });
                    }
                }
                styleStack.push(newStyle);
            }
        } else if (textContent) {
            if (mode === 'word') {
                // 단어 모드: 공백 기준으로 나눔
                const parts = textContent.split(/(\s+)/);
                parts.forEach(part => {
                    if (part.length === 0) return;
                    fineGrainedNodes.push({
                        text: part,
                        style: styleStack[styleStack.length - 1],
                        isBreak: false
                    });
                });
            } else {
                // 글자 모드: 모든 글자를 하나씩 나눔 (공백 포함)
                for (let i = 0; i < textContent.length; i++) {
                    fineGrainedNodes.push({
                        text: textContent[i],
                        style: styleStack[styleStack.length - 1],
                        isBreak: false
                    });
                }
            }
        }
    }

    // 2. 쪼개진 노드들과 Alignment 데이터 매핑
    let currentIndex = 0;

    for (let i = 0; i < fineGrainedNodes.length; i++) {
        const node = fineGrainedNodes[i];

        if (node.isBreak) {
            result.push({ ...node, start: 0 });
            continue;
        }

        // 공백 처리 또는 매칭 필요 없는 노드 (심볼, 특수문자 등)
        const cleanNodeText = normalizeText(node.text);
        if (!cleanNodeText) {
            if (mode === 'char' && currentIndex < alignmentData.length) {
                // 1. node.text 자체를 확장(Normalize)해서 체크
                // 예: "…" -> "..." (3글자)
                // 예: " " -> " " (1글자)
                const normalizedRaw = node.text.normalize('NFKC');
                let tempIndex = currentIndex;
                let matchedCount = 0;
                let firstMatchStart = -1;
                let isMatchSuccess = true;

                for (const char of normalizedRaw) {
                    // JSON 데이터 상의 공백 스킵 (단, 찾으려는 문자가 공백이 아닐 때만)
                    if (char !== ' ') {
                        while (tempIndex < alignmentData.length && (alignmentData[tempIndex].char === ' ' || alignmentData[tempIndex].char === '')) {
                            tempIndex++;
                        }
                    }

                    if (tempIndex >= alignmentData.length) {
                        isMatchSuccess = false;
                        break;
                    }

                    // 현재 JSON 문자와 비교
                    if (alignmentData[tempIndex].char === char) {
                        if (firstMatchStart === -1) firstMatchStart = alignmentData[tempIndex].start;
                        tempIndex++;
                        matchedCount++;
                    } else {
                        // 매칭 실패 시 Lookahead 시도 (JSON에 불필요한 기호가 끼어있는 경우 스킵)
                        // 예: HTML ".." vs JSON "..." -> JSON의 점 하나를 건너뜀
                        if (tempIndex + 1 < alignmentData.length && alignmentData[tempIndex + 1].char === char) {
                            // 하나 건너뛰고 매칭 성공으로 간주
                            tempIndex++; // Skip the bad one

                            if (firstMatchStart === -1) firstMatchStart = alignmentData[tempIndex].start;
                            tempIndex++; // Consume the good one
                            matchedCount++;
                        } else {
                            // 매칭 실패
                            isMatchSuccess = false;
                            break;
                        }
                    }
                }

                if (isMatchSuccess && matchedCount > 0) {
                    // 매칭 성공: 인덱스 업데이트하고 결과 푸시
                    result.push({ ...node, start: firstMatchStart });
                    currentIndex = tempIndex;
                } else {
                    // 매칭 실패 (단순 공백이거나 다른 알 수 없는 기호)
                    // 기존 로직(Fallback): 
                    // 그냥 현재 인덱스의 시간만 가져오되, 인덱스는 증가시키지 않음(안전장치)
                    // 단, 정말 단순 공백 노드이고 JSON도 공백이면 하나 소비
                    const currentAlignChar = alignmentData[currentIndex].char;
                    if ((currentAlignChar === ' ' || currentAlignChar === '') && (node.text === ' ' || node.text === '\n')) {
                        // 단순 공백 매칭
                        result.push({ ...node, start: alignmentData[currentIndex].start });
                        currentIndex++;
                    } else {
                        // 매칭 불가: 시간만 할당하고 인덱스 유지
                        result.push({ ...node, start: alignmentData[currentIndex].start });
                    }
                }
            } else {
                result.push({ ...node, start: currentIndex < alignmentData.length ? alignmentData[currentIndex].start : 0 });
            }
            continue;
        }

        // 매칭 로직 start
        if (currentIndex < alignmentData.length) {
            let currentTarget = alignmentData[currentIndex];

            if (mode === 'word') {
                // 초기화
                if (currentTarget.remainingText === undefined) {
                    currentTarget.remainingText = normalizeText(currentTarget.word);
                }

                // 1. 현재 타겟과 매칭 시도
                let matched = currentTarget.remainingText.startsWith(cleanNodeText);

                // 2. 매칭 실패 시, 다음 타겟(Next)을 미리 확인 (Lookahead)
                if (!matched && currentIndex + 1 < alignmentData.length) {
                    const nextTarget = alignmentData[currentIndex + 1];
                    if (nextTarget.remainingText === undefined) {
                        nextTarget.remainingText = normalizeText(nextTarget.word);
                    }

                    if (nextTarget.remainingText.startsWith(cleanNodeText)) {
                        // 현재 타겟을 건너뛰고 다음 타겟 사용
                        currentIndex++;
                        currentTarget = nextTarget;
                        matched = true;
                    }
                }

                // 매칭 성공 여부와 상관없이 현재(혹은 갱신된) Target의 start 할당
                result.push({ ...node, start: currentTarget.start });

                if (matched) {
                    currentTarget.remainingText = currentTarget.remainingText.substring(cleanNodeText.length);
                    if (currentTarget.remainingText.length === 0) {
                        currentIndex++;
                    }
                }
            } else {
                // 글자 모드
                // 현재 노드는 텍스트인데, JSON 데이터가 공백(' ')이면 매칭하지 않고 건너뜀 (싱크 밀림 방지)
                // 예: HTML에 <br>이 있고 JSON에는 ' '가 있는 경우, <br>에서 인덱스를 소모하지 않았으므로
                // 그 다음 글자('누')가 ' '에 매칭되는 것을 방지
                while (currentIndex < alignmentData.length) {
                    const charInJson = alignmentData[currentIndex].char;
                    if (charInJson === ' ' || charInJson === '') {
                        currentIndex++;
                    } else {
                        break;
                    }
                }

                if (currentIndex < alignmentData.length) {
                    result.push({ ...node, start: alignmentData[currentIndex].start });
                    currentIndex++;
                } else {
                    // 데이터가 더 이상 없음
                    result.push({ ...node, start: 999999 });
                }
            }
        } else {
            result.push({ ...node, start: 999999 });
        }
    }

    return result;
};
