import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, File as FileIcon, Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import daemonService from '../../services/daemonService';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';

// 프로젝트(워크스페이스) 파일 고르기 — **워크스페이스 생성 때 쓰는 폴더 피커와 같은 형식**
//  (사용자 확정 2026-07-27: "워크스페이스 생성하는 과정에서 하는게 있었던 것 같은데 그것과 동일한 스타일로").
//  정본 스타일 = `components/PcWorkspaceSheet.tsx` = macOS Finder **컬럼뷰**(좌→우로 파고든다).
//  다른 점 하나: 그쪽은 폴더만 고르고, 여기는 **파일**을 고른다 → 컬럼에 파일도 함께 나오고
//  파일 탭은 선택(체크) 토글이다. 폴더 탭은 오른쪽에 다음 컬럼을 연다.
//
// 왜 평면 목록(구 WorkspaceFileSheet)을 버렸나: 검색으로 좁히는 전제였는데, 사용자는 "어디에 있는지"
//  를 보면서 고르려 한다(그리고 워크스페이스 만들 때 이미 이 방식을 배웠다). 같은 제품 안에서 같은
//  일을 두 방식으로 하게 두지 않는다.

const C = v2.colors;
const R = v2.radius;
const COL_W = 210; // PcWorkspaceSheet 와 같은 컬럼 폭

type Item = { name: string; path: string; dir: boolean };
type Col = { path: string; items: Item[]; loading: boolean };

export default function ProjectFileSheet({ visible, onClose, onPick, root, host, hostName }: {
  visible: boolean;
  onClose: () => void;
  /** 고른 파일들의 **워크스페이스 상대경로** — 호출부가 삽입 형식을 정한다. */
  onPick: (relPaths: string[]) => void;
  /** 워크스페이스 루트(홈-기준 상대 = ws.localPath) */
  root: string;
  /** 이 워크스페이스의 호스트 PC(hostDeviceId) */
  host: number | null;
  /** 표시용 PC 이름(다른 PC 의 프로젝트를 고를 때 어디인지 알려준다) */
  hostName?: string;
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const [cols, setCols] = useState<Col[]>([]);
  const [sel, setSel] = useState<string[]>([]);       // 고른 파일 path(홈-상대)
  const [dirSel, setDirSel] = useState<string[]>([]); // 각 컬럼에서 들어간 폴더 path
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const loadCol = useCallback(async (path: string): Promise<Col> => {
    try {
      const res = await daemonService.fsList(path, host);
      const items = res.items.map((it: any) => ({ name: it.name, path: it.path, dir: !!it.dir }));
      // 폴더 먼저, 그다음 파일 — 이름 순(Finder 와 같은 정렬).
      items.sort((a: Item, b: Item) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name));
      return { path: res.root, items, loading: false };
    } catch (e: any) {
      // 빈 목록으로 뭉개지 않는다 — 오프라인/권한 실패를 그대로 보여준다(조용한 빈 화면 금지).
      setErr(String(e?.message || e));
      return { path, items: [], loading: false };
    }
  }, [host]);

  useEffect(() => {
    if (!visible) return;
    setSel([]); setDirSel([]); setErr(null);
    setCols([{ path: root, items: [], loading: true }]);
    loadCol(root).then((c) => setCols([c]));
  }, [visible, root, loadCol]);

  const enterDir = useCallback(async (colIdx: number, dirPath: string) => {
    haptic.keyPress();
    setDirSel((prev) => [...prev.slice(0, colIdx), dirPath]);
    setCols((prev) => [...prev.slice(0, colIdx + 1), { path: dirPath, items: [], loading: true }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    const child = await loadCol(dirPath);
    setCols((prev) => [...prev.slice(0, colIdx + 1), child]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  }, [loadCol]);

  const toggleFile = useCallback((p: string) => {
    haptic.keyPress();
    setSel((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }, []);

  const confirm = useCallback(() => {
    if (!sel.length) return;
    // 워크스페이스 루트 기준 상대 경로로 넘긴다(절대경로는 홈 경로의 계정명을 대화에 남긴다).
    const r = String(root || '').replace(/\/+$/, '');
    onPick(sel.map((p) => (r && p.startsWith(r + '/') ? p.slice(r.length + 1) : p)));
    onClose();
  }, [sel, root, onPick, onClose]);

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: kbHeight, backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10,
        paddingBottom: (kbHeight > 0 ? 14 : Math.max(insets.bottom, 16) + 12), maxHeight: '84%',
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{i18n.t('프로젝트에서 선택')}</Text>
          <Pressable onPress={confirm} disabled={!sel.length} hitSlop={8} style={{ opacity: sel.length ? 1 : 0.4, paddingHorizontal: 8, height: 30, justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>
              {sel.length ? `넣기 (${sel.length})` : i18n.t('넣기')}
            </Text>
          </Pressable>
        </View>
        {/* 경로 한 줄 — 지금 어느 폴더를 보고 있는지(다른 PC 라면 PC 이름까지). */}
        <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginBottom: 8 }}>
          {(hostName ? hostName + ' · ' : '') + (dirSel.length ? dirSel[dirSel.length - 1] : root || '~')}
        </Text>
        {err ? <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>{err}</Text> : null}

        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 380 }}>
          {cols.map((col, ci) => (
            <View key={`${col.path}#${ci}`} style={{
              width: COL_W, borderRightWidth: ci === cols.length - 1 ? 0 : 1, borderRightColor: C.border,
              paddingRight: 6, marginRight: 6,
            }}>
              {col.loading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>
              ) : !col.items.length ? (
                <Text style={{ color: C.textDim, fontSize: 12, padding: 10 }}>{i18n.t('빈 폴더')}</Text>
              ) : (
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {col.items.map((it) => {
                    const picked = !it.dir && sel.includes(it.path);
                    const entered = it.dir && dirSel[ci] === it.path;
                    return (
                      <Pressable
                        key={it.path}
                        onPress={() => (it.dir ? enterDir(ci, it.path) : toggleFile(it.path))}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 8,
                          borderRadius: R.sm, backgroundColor: entered || picked ? C.elevated2 : 'transparent',
                        }}
                      >
                        {it.dir
                          ? <Folder size={15} color={C.text3} />
                          : <FileIcon size={15} color={C.textDim} />}
                        <Text numberOfLines={1} style={{ flex: 1, color: it.dir ? C.text : C.text2, fontSize: 13 }}>{it.name}</Text>
                        {picked ? <Check size={14} color={C.text} weight="bold" /> : null}
                        {it.dir ? <Text style={{ color: C.textDim, fontSize: 13 }}>›</Text> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
