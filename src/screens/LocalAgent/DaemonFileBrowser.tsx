import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { CaretLeft, CaretRight, Folder, File as FileIcon, FloppyDisk, ArrowClockwise } from 'phosphor-react-native';

import CodeEditorWebView, { CodeEditorHandle } from '../../components/module/ide/CodeEditorWebView';
import { v2 } from '../../theme/v2Tokens';
import daemonService, { DaemonFsEntry, DaemonFsEvent } from '../../services/daemonService';

const C = v2.colors;

// 확장자 → CodeMirror 언어(하이라이팅). MobileIDE 와 동일 매핑.
const LANG_BY_EXT: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx', json: 'json', py: 'python', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', md: 'markdown', xml: 'xml', svg: 'xml', sql: 'sql',
  yml: 'yaml', yaml: 'yaml', sh: 'shell', rb: 'ruby', go: 'go', rs: 'rust', php: 'php',
};
const langOf = (p: string) => LANG_BY_EXT[(p.split('.').pop() || '').toLowerCase()] || 'plaintext';
const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p) || '~';

// PC(데몬) 파일 브라우저 — 파인더식 디렉토리 탐색 + 파일 열기/편집/저장.
// 소스는 데몬 홈 루트 기준 상대경로. allowlist 는 데몬 측에서 강제(홈 밖 접근 불가).
const DaemonFileBrowser: React.FC = () => {
  const [cwd, setCwd] = useState('');           // 현재 디렉토리(루트='')
  const [items, setItems] = useState<DaemonFsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 열린 파일(에디터 오버레이)
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileBody, setFileBody] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null); // 바이너리/대용량 안내
  const [fileLoading, setFileLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<CodeEditorHandle>(null);
  const bodyRef = useRef('');
  const loadedRef = useRef(''); // 마지막으로 디스크에서 읽은 내용 — dirty 는 "이것과 다른가"로 판정.
  // SSE 콜백이 최신값을 읽도록 ref 미러(콜백은 마운트 시 클로저라 상태를 직접 못 봄).
  const cwdRef = useRef('');
  const openFileRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const listRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { openFileRef.current = openFile; }, [openFile]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const loadDir = useCallback((path: string) => {
    setLoading(true); setError(null);
    daemonService.fsList(path)
      .then((r) => {
        const root = r.root === '.' ? '' : r.root;
        setItems(r.items); setCwd(root); cwdRef.current = root;
        daemonService.fsWatch(root).catch(() => { /* 오프라인 등 무시 */ }); // 이 디렉토리 감시로 전환
      })
      .catch((e) => setError(e?.message || '폴더를 불러올 수 없어요.'))
      .finally(() => setLoading(false));
  }, []);

  // 열린 디렉토리 조용히 재조회(변경 이벤트 반영 — 스피너 없이 목록만 갱신).
  const refreshList = useCallback(() => {
    daemonService.fsList(cwdRef.current).then((r) => setItems(r.items)).catch(() => { /* noop */ });
  }, []);

  // 열린 파일이 외부(claude 등)에서 바뀌면 다시 읽어 에디터 반영. 단 사용자가 편집 중이면(dirty) 덮지 않음.
  const reloadOpenFile = useCallback((p: string) => {
    if (dirtyRef.current) return; // 편집 중 — 자동 갱신 보류(사용자 저장 우선)
    daemonService.fsRead(p).then((r) => {
      if (r.binary || r.tooLarge || typeof r.content !== 'string') return;
      bodyRef.current = r.content; loadedRef.current = r.content; setFileBody(r.content);
      editorRef.current?.setValue(r.content); // 커서 유지하며 내용 교체(뒤따르는 onChange 는 loadedRef 비교로 dirty 안 됨)
      setDirty(false);
    }).catch(() => { /* noop */ });
  }, []);

  useEffect(() => { loadDir(''); }, [loadDir]);

  // 파일 변경 이벤트 SSE 구독(마운트 1회) — claude 등 외부 수정 즉시 반영.
  useEffect(() => {
    const unsub = daemonService.streamDaemonEvents((ev: DaemonFsEvent) => {
      const p = ev.path;
      // 열린 파일이 바뀌면 에디터 갱신
      if (openFileRef.current && p === openFileRef.current && ev.event === 'change') {
        reloadOpenFile(p);
      }
      // 현재 디렉토리 항목 변화(추가/삭제/폴더) → 목록 갱신(디바운스로 연속 이벤트 병합)
      const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      if (parent === cwdRef.current) {
        if (listRefreshTimer.current) clearTimeout(listRefreshTimer.current);
        listRefreshTimer.current = setTimeout(refreshList, 200);
      }
    });
    return () => {
      unsub();
      if (listRefreshTimer.current) clearTimeout(listRefreshTimer.current);
      daemonService.fsUnwatch().catch(() => { /* noop */ });
    };
  }, [reloadOpenFile, refreshList]);

  const enter = (entry: DaemonFsEntry) => {
    if (entry.dir) { loadDir(entry.path); return; }
    // 파일 열기
    setOpenFile(entry.path); setFileLoading(true); setFileNote(null); setDirty(false);
    setFileBody(''); bodyRef.current = ''; loadedRef.current = '';
    daemonService.fsRead(entry.path)
      .then((r) => {
        if (r.binary) { setFileNote('바이너리 파일이라 미리보기를 지원하지 않아요.'); return; }
        if (r.tooLarge) { setFileNote('파일이 너무 커서 열 수 없어요 (2MB 초과).'); return; }
        setFileBody(r.content || ''); bodyRef.current = r.content || ''; loadedRef.current = r.content || '';
      })
      .catch((e) => setFileNote(e?.message || '파일을 열 수 없어요.'))
      .finally(() => setFileLoading(false));
  };

  const goUp = () => {
    if (!cwd) return;
    const parent = cwd.includes('/') ? cwd.slice(0, cwd.lastIndexOf('/')) : '';
    loadDir(parent);
  };

  const save = useCallback(() => {
    if (!openFile || saving) return;
    setSaving(true);
    daemonService.fsWrite(openFile, bodyRef.current)
      .then(() => { loadedRef.current = bodyRef.current; setDirty(false); })
      .catch((e) => setFileNote(e?.message || '저장 실패'))
      .finally(() => setSaving(false));
  }, [openFile, saving]);

  // ── 에디터 오버레이 ──
  if (openFile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0D14' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 44, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable onPress={() => { setOpenFile(null); setFileNote(null); }} hitSlop={8} style={{ padding: 4 }}>
            <CaretLeft size={20} color={C.text2} />
          </Pressable>
          <FileIcon size={15} color={C.textDim} />
          <Text style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {baseOf(openFile)}{dirty ? ' •' : ''}
          </Text>
          {!fileNote && (
            <Pressable
              onPress={save}
              disabled={!dirty || saving}
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32, borderRadius: 7, backgroundColor: dirty ? C.accent : C.elevated2, opacity: saving ? 0.6 : 1 }}
            >
              <FloppyDisk size={15} color={dirty ? '#04110B' : C.textDim} weight="fill" />
              <Text style={{ color: dirty ? '#04110B' : C.textDim, fontSize: 12.5, fontWeight: '700' }}>{saving ? '저장 중' : '저장'}</Text>
            </Pressable>
          )}
        </View>
        {fileLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : fileNote ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center' }}>{fileNote}</Text>
          </View>
        ) : (
          <CodeEditorWebView
            ref={editorRef}
            value={fileBody}
            language={langOf(openFile)}
            wrap={false}
            lineNumbers
            fontSize={13}
            onChange={(v) => { bodyRef.current = v; setDirty(v !== loadedRef.current); }}
            onShortcut={(a) => { if (a === 'save' || a === 's') save(); }}
          />
        )}
      </View>
    );
  }

  // ── 디렉토리 목록 ──
  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 경로 바 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Pressable onPress={goUp} disabled={!cwd} hitSlop={8} style={{ padding: 4, opacity: cwd ? 1 : 0.3 }}>
          <CaretLeft size={18} color={C.text2} />
        </Pressable>
        <Folder size={15} color={C.textDim} weight="fill" />
        <Text style={{ flex: 1, color: C.text2, fontSize: 12.5, fontFamily: v2.font.mono }} numberOfLines={1} ellipsizeMode="head">
          ~/{cwd}
        </Text>
        <Pressable onPress={() => loadDir(cwd)} hitSlop={8} style={{ padding: 4 }}>
          <ArrowClockwise size={15} color={C.textDim} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: C.warn, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</Text>
          <Pressable onPress={() => loadDir(cwd)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ color: C.text2, fontSize: 13 }}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.path}
          ListEmptyComponent={<Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center', marginTop: 30 }}>빈 폴더</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => enter(item)}
              android_ripple={{ color: C.elevated2 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border }}
            >
              {item.dir
                ? <Folder size={18} color={C.accent} weight="fill" />
                : <FileIcon size={18} color={item.text ? C.text2 : C.textDim} />}
              <Text style={{ flex: 1, color: item.dir ? C.text : (item.text ? C.text2 : C.textDim), fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
              {item.dir ? <CaretRight size={15} color={C.textDim} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
};

export default DaemonFileBrowser;
