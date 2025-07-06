const data = {
    "id": 1,
    "type": "Interactive",
    "modules": [
        {
            "type": "paragraph",
            "content": "Hello, world!" // 마크 다운 형식
        },
        {
            "type": "image",
            "content": "https://www.ghmate.com/image/1234567890" // 이미지 링크
        },
        {
            "type": "video",
            "content": "https://www.ghmate.com/video/1234567890" // 동영상 링크
        },
        {
            "type": "youtube",
            "content": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" // 유튜브 링크
        },
        {
            "type": "webview",
            "content": "What is the capital of France?" // 마크 업 형식
        },

        {
            "type": "code",
            "files": [
                {
                    "name": "index.html",
                    "language": "html",
                    "content": "<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>"
                },
                {
                    "name": "style.css",
                    "language": "css",
                    "content": "body { background-color: #f0f0f0; }"
                },
                {
                    "name": "script.js",
                    "language": "javascript",
                    "content": "console.log('Hello from JS');"
                }
            ]
        },
        {
            "type": "terminal",
            "content": {
              "shell": "bash", // 또는 "cmd", "bash", "powershell", "zsh", "gitbash"
              "stream": [
                {
                  "type": "input",
                  "content": "npm install",
                  "delay": 0
                },
                {
                  "type": "output",
                  "content": "Installing dependencies...",
                  "delay": 500
                },
                {
                  "type": "output",
                  "content": "⠋ installing react",
                  "delay": 1000,
                  "lineId": "spinner",     // 같은 lineId이면 이전 출력 덮어씀
                  "animated": true         // 스피너/로딩 표현 여부
                },
                {
                  "type": "output",
                  "content": "⠙ installing react",
                  "delay": 1300,
                  "lineId": "spinner",
                  "animated": true
                },
                {
                  "type": "output",
                  "content": "⠹ installing react",
                  "delay": 1600,
                  "lineId": "spinner",
                  "animated": true
                },
                {
                  "type": "output",
                  "content": "✔ react installed",
                  "delay": 2000,
                  "lineId": "spinner"
                },
                {
                  "type": "progress",
                  "label": "Downloading packages",
                  "value": 0.3,
                  "delay": 2200,
                  "lineId": "progressBar"
                },
                {
                  "type": "progress",
                  "label": "Downloading packages",
                  "value": 0.6,
                  "delay": 2400,
                  "lineId": "progressBar"
                },
                {
                  "type": "progress",
                  "label": "Finished downloading",
                  "value": 1.0,
                  "delay": 2600,
                  "status": "done",         // 상태: done, running, fail 등
                  "lineId": "progressBar"
                },
                {
                  "type": "output",
                  "content": "✅ All packages installed successfully",
                  "delay": 2800
                },
                {
                  // 경고 메시지 (에러 아님)
                  "type": "error",
                  "content": "warning: deprecated package found",
                  "delay": 3000,
                  "color": "yellow"         // 강조 색상 (UI용)
                }
              ]
            } 
        },
        {
            "type" : "multipleChoice", // 객관식 선택 
            "content": {
                "questions":[ // 모듈 형식 그대로 사용 가능
                    {
                        "type": "paragraph",
                        "content": "HTML에서 가장 큰 제목을 나타내는 태그는?" 
                    },
                ],
                "options": [ // 모듈 형식 그대로 사용 가능
                    {
                        "type": "paragraph",
                        "content": "<h1>제목</h1>"
                    },
                    {
                        "type": "paragraph",
                        "content": "<h2>제목</h2>"
                    },
                    {
                        "type": "paragraph",
                        "content": "<h3>제목</h3>"
                    },
                    {
                        "type": "paragraph",
                        "content": "<h6>제목</h6>"
                    },
                ],
                "answer": 0 // 정답 인덱스
            },
        },
        {
            "type" : "ox", // O/X 선택 
            "content": {
                "question": [ // 모듈 형식 그대로 사용 가능
                    {
                        "type": "paragraph",
                        "content": "HTML에서 가장 큰 제목인가요?" 
                    },
                ],
                "answer": "O" // "O" 또는 "X"
            } 
        },
        {
            "type" : "codeFillTheGap", // 코드 선택 채우기 
            "files": [
                {
                    "name": "index.html",
                    "language": "html",
                    "content": "<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>",
                    "optioins": [
                        {
                            "startIndex": 0,
                            "endIndex": 1,
                            "startLine": 0,
                            "endLine": 1,
                            "length": 1,
                            "value": "html1"
                        },
                        {
                            "startIndex": 2,
                            "endIndex": 3,
                            "startLine": 0,
                            "endLine": 1,
                            "length": 1,
                            "value": "html2"
                        }
                    ],
                    "wrongOptions": [
                        {
                            "value": "html3"
                        },
                        {
                            "value": "html4"
                        },
                    ],
                    // TODO : 코드 실행 결과 표현에 대한 처리 고민.. 
                },
                {
                    "name": "style.css",
                    "language": "css",
                    "content": "body { background-color: #f0f0f0; }"
                },
                {
                    "name": "script.js",
                    "language": "javascript",
                    "content": "console.log('Hello from JS');"
                }
            ],

        },
        {
            "type" : "codeInput", // 코드 직접 입력 
            "content": "What is the capital of France?" // 마크 업 형식
        }
    ],
    "postModules": [
        {
            "type": "terminal",
            "content": {
                "shell": "bash",
                "stream": [
                    
                ]
            }
        }
    ]
}