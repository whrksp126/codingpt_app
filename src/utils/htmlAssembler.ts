/**
 * DB의 코드 조각을 완전한 다크 테마 HTML 문서로 조립합니다.
 */
export const assembleCodeHtml = (codeFragment: string): string => {
  // 1. 백슬래시로 이스케이프된 따옴표 처리 (\") -> (")
  const cleanFragment = codeFragment.replace(/\\"/g, '"');

  const darkThemeCss = `
    body {
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      font-weight: bold;
      line-height: 1.6;
      margin: 0;
      padding: 10px;
    }
    pre {
      margin: 0; 
      white-space: pre-wrap; 
      word-break: break-all;
      color: #fff;
      overflow-x: auto;
    }

    /* 빈칸(Input) 스타일 교정 */
    input.blank {
      display: inline-block;
      min-width: 60px; /* 최소 너비 확보 */
      height: 24px;
      padding: 0;
      margin: 2px;
      border-radius: 4px;
      border: 1.5px dashed #E1E6EF;
      background-color: #23272F;
      color: #E02D3C;
      font-weight: 700;
      text-align: center;
      vertical-align: middle;
      outline: none;
    }
    input.blank.filled {
      background-color: #E02D3C;
      color: #FFFFFF;
      border: 1px solid #E02D3C;
    }
    input.blank.focus {
      background: #DDF4FF;
      border: 1.5px dashed #84D8FF;
    }
    input.blank.correct {
      background: #D7FFB8;
      border: 1px solid #58CC02;
      color: #08875D;
    }        
    input.blank.incorrect {
      background: #fee0e2;
      border: 1px solid #FE4C4A;
      color: #E02D3C;
    }
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
        </script>
      </body>
    </html>
  `;
};