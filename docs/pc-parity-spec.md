# PC 패리티 스펙 — 모바일/태블릿을 PC(cmux) 워크스페이스로

> CodingPT PC 데스크톱 앱(`codingpt_service/codingpt_pc/`, Tauri v2 vanilla JS)의 UI/UX·상태·상호작용을 그대로 문서화하고, 모바일(React Native)로의 1:1 대응을 정의한다. 모든 워크스페이스 셸 구현의 **정본 기준**.

원 소스: `codingpt_service/codingpt_pc/src/{index.html, styles.css}`, `src/js/{state, sidebar, workspace-view, tiling, pane, notifications, settings, main, icons, api, ide}.js`.

핵심 차이: **PC=로컬 tmux/파일시스템 직접**, **모바일=원격 호스트(PC/클라우드 러너)를 백엔드 릴레이로 조작**. 데이터 경로만 다르고 UX는 동일.

---

## 1. 디자인 토큰 (PC `styles.css :root`)

`codingpt_app/src/theme/v2Tokens.ts`가 이미 동일 값을 가짐(그대로 사용, 모바일 사이즈로 조정). **다크 전용**.

| 토큰 | 값 | 역할 |
|---|---|---|
| base | `#0A0D14` | 앱/터미널/그리드 배경, 활성 탭 |
| surface | `#0E1320` | 사이드바·상단바·pane 헤더·프리뷰바 |
| elevated | `#11151F` | 호버 행·카드·컨텍스트 메뉴·알림 패널 |
| elevated2 | `#1B1F2A` | 입력·버튼·아바타·칩·고스트 |
| hover | `#22304A` | 스크롤바 호버 |
| border | `#1C2230` | 헤어라인(1px) |
| borderControl | `#2A2F3A` | 컨트롤 경계·탭 상단 액센트(비활성) |
| borderFocus | `#3B82F6` | 입력 포커스 |
| text / text2 / text3 / dim | `#F8FAFC` / `#CBD5E1` / `#94A3B8` / `#64748B` | 텍스트 계층 |
| accent | `#34D399` | 브랜드 민트 — 활성·포커스·핀·git/포트 |
| accentHover / cta / onAccent | `#2CC08A` / `#08875D` / `#06281C` | |
| accentTint | `rgba(52,211,153,0.12)` | 활성 행·드롭존·unread 배경 |
| info / warn / error | `#60A5FA` / `#FBBF24` / `#F87171` | pane 링 / 경고 / 배지·삭제 |

- 라운드: sm `6` / md `10` / lg `12` / pill `999`.
- 폰트: UI=Pretendard(letter-spacing -0.02em), mono=Menlo(경로/포트/코드). 터미널 xterm=Menlo 13(모바일 ~12). CodeMirror=12.5.
- 아이콘: 인라인 SVG 라인(Phosphor/Lucide 풍), **이모지 금지**. 모바일=`phosphor-react-native`.
- 터미널 테마: bg `#0A0D14`, fg `#E2E8F0`, cursor `#34D399`, selection `#264F78`, brightBlack `#334155`.
- 사이드바 폭 PC=264px(모바일 도킹=300).

---

## 2. 셸 레이아웃

```
.shell (grid: [264px sidebar][1fr main])   ← collapsed 시 sidebar display:none, main 풀폭
  ├ aside#sidebar         → mountSidebar()
  └ main.main
     ├ section.ws-view    → 워크스페이스뷰 (항상 마운트)
     └ section#settings   → 설정 모달 오버레이(위에 쌓임, 워크스페이스 유지)
```

- 설정은 라우트 스왑이 아니라 **오버레이**(워크스페이스는 뒤에 계속 마운트).
- 단일 `render()`가 state `subscribe`로 구동, 뷰가 내부 diff로 무거운 노드(xterm/CM) 보존.
- **모바일 대응:** `WorkspaceShell` = 사이드바(폰 오버레이/태블릿 도킹) + `WorkspaceView`(항상 마운트). 설정=`MyInfoSheet` 오버레이. 상태=`WorkspaceShellContext`(store+subscribe), pane는 `node.id` 키 ref 맵으로 인스턴스 보존.

---

## 3. 상태 모델 (`state.js`)

### 3.1 중앙 state
```
paired, daemon, workspaces[], wsError, activeWsId,
ws: { [wsId]: { layout, focusId, surfaces[], ports[], branch? } },
notifications[], view('workspace'|'settings'), sidebarCollapsed,
creatingWs, me, devices[], currentDeviceId
```

### 3.2 wsPrefs (기기 로컬, PC=pc-ui.json / 모바일=AsyncStorage)
`{ order[], pinned[], color:{id:hex}, rename:{id:name} }`
- `sortedWorkspaces()`: **고정 먼저(안정) → order 인덱스 순**.
- `applyWsVisualOrder(ids)` / `moveWs(id, up|down|top)` / `togglePinWs` / `setWsColor` / `renameWs(≤80자)`.
- `wsDisplayName` = rename || name. `isLocal(w)` = compute==='local' || (!compute && localPath).

### 3.3 pane 조작 (→ tiling)
- `splitPane(paneId, dir, kind, opts)`: 새 터미널 pane=새 window(`win:'new'`), preview/ide=`leaf(kind,opts)`. focusId=새 노드.
- `closePane`: 터미널 leaf & local이면 각 탭 tmux window **kill**(닫기=작업 종료). 트리 비면 새 터미널로 대체.
- `focusPane`, `setRatio(branchPath, ratio)`(0.1~0.9).

### 3.4 영속화 / 세션 동기화
- `serialize()` = `{activeWsId, ws:{id:{layout,focusId}}, wsPrefs}` → **디바운스 600ms** 저장.
- `buildSession(wsId)` = `{version:1, surfaces:[...], layout, focusId}` → **디바운스 1500ms** `saveWsSession`(무변경 스킵).
  - `leafSurfaces`: terminal→탭별 `{id:"paneId:win",kind,win,title}`, ide→`{kind:'ide',path}`, preview→`{kind:'preview',url}`.
- `pullSession(wsId)`: **ws당 앱 실행 중 1회**. 원격 layout 채택(migrateTree+bumpSeq).
- **모바일 대응:** 동일 규칙·타이밍 유지. `daemonService.get/putWorkspaceSession` 사용. wsPrefs는 AsyncStorage(기기 로컬), layout은 ws_session으로 PC와 공유.

---

## 4. 타일링 트리 (`tiling.js`) — 순수, `src/workspace/tiling.ts`로 이식

- Leaf 터미널: `{id, kind:'terminal', tabs:[{win,title}], active}`
- Leaf preview/ide: `{id, kind, url|openPath}`
- Branch: `{dir:'h'|'v', ratio, first, second}` (h=좌우, v=상하)
- `newPaneId()`=`p<seq>-<base36>`, `bumpSeq(ids)`(복원 후 충돌 방지).
- `split(root,targetId,dir,newLeaf,before)`→`{tree,added}` (불변). `closeLeaf`→형제 승격 `{tree,focusId}`.
- `swapLeaves`/`moveLeaf(root,src,target,side)`: **노드 객체 아이덴티티 보존**(xterm/CM 상태 유지). side=null→스왑, 아니면 close 후 target 분할 삽입.
- `setRatio(root,branchPath,ratio)`, `neighbor(rects,fromId,dir)`(방향 포커스, ⌥⌘화살표).
- cmux: ⌘D=split h, ⌘⇧D=split v.

---

## 5. 사이드바 (`sidebar.js`)

```
.sidebar
 ├ .sb-top       상단 컨트롤(드래그영역, pl 72px 트래픽라이트)
 ├ .sb-list      워크스페이스 행들
 └ .sb-me        footer "내 정보"
```

### 5.1 상단 컨트롤 `buildTopControls()` (collapsed 시 main-top으로 이식)
3버튼: **사이드바 토글** / **알림 벨**(unread 시 빨간 배지 "9+") / **+ 새 워크스페이스**(생성 중 `.busy`).

### 5.2 워크스페이스 행 `wsRow(w)`
- draggable, `dataset.wsId`. 색상 있으면 `inset 3px 0 0 {color}` 좌측 바.
- `.wsr-name`: (핀 아이콘)+표시명+ (unread 배지).
- `.wsr-meta`: monitor+"내 PC" 또는 cloud+"클라우드" + (git 브랜치).
- `.wsr-path`: `~/localPath`(mono dim). `.wsr-ports`: `:port` 칩 최대 3.
- 상태: `.active`(accentTint), `:hover`(elevated), `.dragging`(opacity .45).
- **클릭**=setActive, **우클릭/롱프레스**=컨텍스트 메뉴, **드래그**=정렬.

### 5.3 드래그 정렬 `bindWsDrag` (PC=HTML5 DnD / 모바일=롱프레스+PanResponder)
dragover에서 중점 기준 `drop-before`/`drop-after`(2px 액센트 라인) → drop 시 id 리스트 splice → `applyWsVisualOrder`.

### 5.4 컨텍스트 메뉴 `showWsMenu` (모바일=롱프레스 시트/팝오버)
이름 변경(인라인 입력) / 고정·해제 / **색상 스와치**(없음·빨강`#f87171`·주황`#fb923c`·초록`#34d399`·파랑`#60a5fa`·보라`#a78bfa`·분홍`#f472b6`) / 위·아래·맨위 이동. 바깥탭·Esc·blur 닫힘.

### 5.5 footer `.sb-me`
아바타(profileImg|이니셜|user) + 이름/서브(email/device) + 온라인 점. 클릭=설정 토글.

### 5.6 알림 패널 `openNotif`
벨 하단 팝오버(320px). 헤더+"모두 읽음", 행=title/body/`wsName · HH:MM`, `.unread`(accentTint). 클릭=읽음+`jumpToNotification`(setActive+focusPane).

---

## 6. 워크스페이스뷰 (`workspace-view.js`)

```
.ws-view
 ├ .main-top   (collapsed 시 상단 컨트롤+구분선 이식) + 폴더 아이콘 + ws.name + ~/path
 └ .ws-grid    tiling 트리 → .split/.divider/.pane-slot 재귀
```

### 6.1 그리드 재조립 `updateWorkspaceView`
- `panes: Map<paneId,PaneView>`. reconcile: 없어진 leaf dispose, 새 leaf 생성(**기존 재사용**), node 갱신.
- `structureSig(tree)` 변할 때만 DOM 재조립(ratio 변경엔 유지) → rAF refit. focused 토글, `measureRects()`.

### 6.2 분할 DOM `buildNode`
`.split-{dir}` flex + `.split-child`(flexBasis=ratio%) + `.divider-{dir}` + `.split-child`. divider 1px + ±3px hit(모바일은 더 크게), hover 액센트.

### 6.3 분할선 리사이즈 `attachDrag` (모바일=PanResponder, **즉시**)
mousedown→body `resizing-*`→move에서 ratio 계산(clamp .1~.9) live flexBasis + rAF refit→up에서 `setRatio` 저장.

### 6.4 탭/pane 드래그 (VS Code식) `beginTabDrag` — 모바일 **롱프레스** 시작
- 임계 5px 후 시작. 전체화면 `.drag-overlay`(포인터 캡처) + `.tab-ghost`(커서추종) + `.drop-zone` + `.tab-insert`.
- hit-test: overlay pointerEvents 잠깐 none → `elementFromPoint`로 아래 pane 탐지. **모바일: `onLayout` 측정 rect 맵으로 히트테스트**(elementFromPoint 대체).
- 존: 터미널 탭바 위=재배치(삽입 라인) / 본문 사분면 `m=min(fx,1-fx,fy,1-fy)<0.25`=가장자리(left/right/top/bottom) / 아니면 center.
- 적용: whole pane(ide/preview,index<0)=center 스왑·edge 분할이동(`movePane`); tabbar=재배치/이동; center=탭 append(`moveTab`); edge=새 분할(`moveTabToNewSplit`). 드래그 직후 click 억제.

---

## 7. Pane (`pane.js`)

각 pane = per-pane 탭 헤더 + 본문. registry로 paneId 라우팅.

### 7.1 헤더 `buildHead`
- 터미널: `.ptab`(탭=tmux window, draggable) 아이콘+제목("터미널 {win}")+X. 클릭=switchTab, pointerdown=드래그.
- ide/preview: 단일 static 탭("IDE"/"프리뷰")+X(pane 통째 닫기), 드래그=통째 이동(index<0).
- 컨트롤: (터미널)새 터미널 / (ide)탐색기 토글 / 공통 우측분할(⌘D)·하단분할(⌘⇧D)·IDE 열기·프리뷰 열기.
- 활성 탭: bg base, `::after` 1px로 본문과 병합. 포커스 pane 활성탭=상단 액센트 링. 알림=`.ring`(info 링 4s).

### 7.2 터미널 본문
xterm(cursorBlink, 13, mono, scrollback 10000) + FitAddon + SearchAddon. **OSC 9 / 777(`notify;title;body`) / 99 / 벨** → `onNotify`. `onTitleChange`→탭 제목.
- 탭=tmux window: `_ensureWin`(win:'new'→`newWindow`), addTab/switchTab(`selectWindow`)/closeTab(`killWindow`).
- **채널**: local=`ptyOpen/Write/Resize/Close`(base64 emit). cloud=WebSocket `{wsBase}/api/daemon/terminal/{token}`(바이너리=stdin, `{type:'resize'}`). **모바일=항상 cloud 경로**(`daemonService.startTerminal`+`buildTerminalWsUrl`), `TerminalWebView` 재사용.
- FitAddon+ResizeObserver로 리사이즈.

### 7.3 프리뷰 본문
PC=네이티브 웹뷰 오버레이(X-Frame 우회) + rAF 위치동기화. **모바일=RN `WebView`**(데브서버=`buildDaemonPreviewUrl`, 임의 URL 직접). 스마트 주소창(http/localhost/host:port/domain→이동, 아니면 구글검색). 모달·드래그 중 가시성 off.

### 7.4 IDE 본문 `ide.js`
파일트리(230px, 리사이즈)+에디터그룹 타일링(CodeMirror). 트리(신규파일/폴더/새로고침·프로젝트 검색·lazy children)·열기/저장(⌘S)·파일내 검색·탭 드래그(그룹간/분할)·트리 DnD(rename)·컨텍스트 메뉴(생성/이름변경/삭제). **모바일=기존 `MobileIDEScreen`/`CodeEditorWebView` 재사용·고도화**, pane 본문으로 편입.

### 7.5 검색(⌘F)
터미널=SearchAddon 위젯(n/m·prev/next), IDE=파일내 검색.

---

## 8. 알림 (`notifications.js`)
`handleOsc`→`pushNotification`+`flashPane`(.ring 4s)+네이티브 notify(400ms 스로틀). 패널 렌더/jump. `jumpLatestUnread`(⌘⇧U).
**모바일:** 포그라운드=인앱 패널/배지, 백그라운드=FCM(`pushService`). 소스=xterm OSC/벨(WebView 내 파싱)·AI 완료/승인.

---

## 9. 설정 / "내 정보" (`settings.js`)

모달(nav 264px + main). **nav 순서: 일반(gear) → 계정(user) → 정보(monitor)**, 기본=일반.
- **일반**: 프로필(아바타/닉네임 입력+저장=`updateNickname`/이메일) + 자동실행 토글(모바일 무관→테마) + **기본 에이전트 선택**(모바일 추가).
- **계정**: "모든 기기에서 로그아웃"+버튼(2클릭 확인) / "회원 탈퇴"(2단계 인라인 확인=`deleteAccount`+unpair) / **내 기기 표** `기기|운영체제|위치|등록됨|⋯`(호버 ⋯→기기 삭제=`revokeDevice`, 클라우드는 삭제 불가, 현재기기 배지·온라인 점·OS 라벨).
- **정보**: 버전 / "창 닫아도 메뉴바 실행"(모바일 무관).
- **모바일:** `MyInfoSheet`/`MyInfoContext` 확장(일반/계정/정보 + **배우기 임베드 패널**). `learn` step 추가.

---

## 10. 키보드 단축키 (`main.js`) — iPad 하드웨어 키보드 대응

| 키 | 동작 |
|---|---|
| ⌘D / ⌘⇧D | 포커스 pane 우측/하단 분할 |
| ⌘W | 포커스 pane 닫기 |
| ⌘⇧U | 최근 미확인 알림 이동 |
| ⌘, | 설정 토글 |
| ⌘1–8 | 워크스페이스 N |
| ⌥⌘←/→/↑/↓ | 이웃 pane 포커스 |
| ⌘F / Ctrl+F | pane 검색(터미널 스크롤백 / IDE 파일내) |
| Esc | 설정/메뉴/인라인 취소 |
| ⌘S | 파일 저장(IDE) |

화면 버튼(pane 헤더 분할/닫기)과 병행.

---

## 11. PC ↔ 모바일 1:1 대응 표

| PC | 모바일 | 데이터 경로 |
|---|---|---|
| `tiling.js` | `src/workspace/tiling.ts` | (순수) |
| `state.js` | `contexts/WorkspaceShellContext.tsx` | AsyncStorage + `get/putWorkspaceSession` |
| `sidebar.js` | `components/SidebarContent.tsx`(개편) | `/workspaces`, `getStatus` |
| `workspace-view.js` | `workspace/WorkspaceView.tsx` | — |
| `pane.js` terminal | `workspace/PaneView` + `TerminalWebView` | `startTerminal`+WS, `listTerminals/newTerminal/selectTerminal/closeTerminal` |
| `pane.js` ide | `workspace/PaneView` + `MobileIDE` | `fsTree/fsRead/fsGrep/fsWrite`(+mkdir/rename/delete 신규) |
| `pane.js` preview | `workspace/PaneView` + `WebView` | `previewStart`+`buildDaemonPreviewUrl` |
| `notifications.js` | 인앱 패널 + `pushService` | OSC/벨 + FCM |
| `settings.js` | `MyInfoSheet`/`MyInfoContext` | `updateNickname/listDevices/revokeDevice/deleteAccount` |
| 로컬 pty/tmux/fs | (없음, 원격) | 데몬 릴레이 |
| 워크스페이스 생성 | + 버튼 | `wsGetRoot/wsCreate/wsClone`, PC 없으면 클라우드 러너 |
| AI(터미널 claude) | 진입 확인→바텀시트 | `startAgent`(stream-json) + `subscribeDaemonAgentEvents`; raw claude 감지=`pane_current_command` RPC(신규) |

---

## 12. 모바일 전용 규칙(확정)

- 타일 분할 폰·태블릿 모두 무제한. 드래그=롱프레스(정렬/pane/탭)·분할선 즉시.
- 세션 모델=워크스페이스당 단일 pane 레이아웃(다중 세션 트리 폐기). 채팅=AI 오버레이 안.
- 터미널=PC와 라이브 미러(같은 tmux window, 닫기=양쪽 종료→확인 UX).
- 호스트 오프라인→클라우드 핸드오프 제안. 워크스페이스 생성=PC+클라우드.
- IDE=pane 전용(독립 오버레이 은퇴). 프리뷰=데브서버+임의 URL. 테마=다크 전용.
- 사이드바=폰 햄버거 오버레이/태블릿 도킹. AI=워크스페이스 열 때 매번 확인→RPC, 시트 닫아도 백그라운드 지속.
- 알림=인앱+FCM. wsPrefs=기기 로컬. 배우기=내 정보 임베드. iPad 단축키=PC 동일.
