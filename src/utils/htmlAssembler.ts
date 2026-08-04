import * as i18n from '../i18n/index.ts';
/**
 * DB의 코드 조각을 완전한 다크 테마 HTML 문서로 조립합니다.
 */
export const assembleCodeHtml = (codeFragment: string): string => {
  // 1. 백슬래시로 이스케이프된 따옴표 처리 (\") -> (")
  const cleanFragment = codeFragment.replace(/\\"/g, '"');

  const darkThemeCss = i18n.t("body {\n      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;\n      font-size: 14px;\n      font-weight: bold;\n      line-height: 1.6;\n      margin: 0;\n      padding: 10px;\n    }\n    pre {\n      margin: 0; \n      white-space: pre-wrap; \n      word-break: break-all;\n      color: #fff;\n      overflow-x: auto;\n    }\n\n    /* 빈칸(Input) 스타일 교정 */\n    input.blank {\n      display: inline-block;\n      min-width: 60px; /* 최소 너비 확보 */\n      height: 24px;\n      padding: 0;\n      margin: 2px;\n      border-radius: 4px;\n      border: 1.5px dashed #E1E6EF;\n      background-color: #23272F;\n      color: #E02D3C;\n      font-weight: 700;\n      text-align: center;\n      vertical-align: middle;\n      outline: none;\n    }\n    input.blank.filled {\n      background-color: #E02D3C;\n      color: #FFFFFF;\n      border: 1px solid #E02D3C;\n    }\n    input.blank.focus {\n      background: #DDF4FF;\n      border: 1.5px dashed #84D8FF;\n    }\n    input.blank.correct {\n      background: #D7FFB8;\n      border: 1px solid #58CC02;\n      color: #08875D;\n    }        \n    input.blank.incorrect {\n      background: #fee0e2;\n      border: 1px solid #FE4C4A;\n      color: #E02D3C;\n    }");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism-okaidia.css" rel="stylesheet" />
        <style>${darkThemeCss}</style>
      </head>
      <body>
        <pre><code>${cleanFragment}</code></pre>
        <script>
          // 초기 로드 시 input 너비를 내용에 맞게 조절
          window.onload = function() {
            document.querySelectorAll('input.blank').forEach(el => {
              if (el.value) {
                el.size = Math.max(1, el.value.length);
              }
            });
          };
          
          // Input 클릭 이벤트 리스너
          function sendInputInfo(e) {
            var el = e.target;
            if (el && el.tagName === 'INPUT') {
              // disabled 상태에서만 클릭 이벤트를 차단 (readOnly는 수정 가능)
              if (el.disabled) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
              
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'input_click',
                  payload: {
                    id: el.id,
                    value: el.value,
                    optionIndex: el.dataset ? el.dataset.optionIndex : undefined,
                  }
                }));
              }
            }
          }
          
          // 즉시 이벤트 리스너 등록
          document.addEventListener('click', sendInputInfo, true);
        </script>
      </body>
    </html>
  `;
};