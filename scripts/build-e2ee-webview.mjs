// WebView 주입용 E2EE 스트림 코덱 번들 — src/services/e2ee/streamCodec.js → src/components/module/ide/e2eeWebviewBundle.ts
//  실행: node scripts/build-e2ee-webview.mjs (streamCodec·e2eeCore·e2eeProto 를 고치면 다시 돌린다)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const js = execFileSync('npx', ['esbuild', 'src/services/e2ee/streamCodec.js', '--bundle', '--format=iife', '--global-name=__cptE2ee', '--minify', '--target=es2020'], { encoding: 'utf8' });
fs.writeFileSync('src/components/module/ide/e2eeWebviewBundle.ts',
  '// 자동 생성 — scripts/build-e2ee-webview.mjs. 직접 고치지 말 것.\n/* eslint-disable */\nexport const E2EE_WEBVIEW_JS: string = ' + JSON.stringify(js) + ';\n');
console.log('bytes', js.length);
