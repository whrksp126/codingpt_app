import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { Folder, File as FileIcon, Check, CaretRight } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import daemonService from '../../services/daemonService';
import { haptic } from '../../animations/haptics';
import Sheet from '../../components/ui/Sheet';
import PressableRow from '../../components/ui/PressableRow';
import Button from '../../components/ui/Button';
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
    <Sheet
      visible={visible}
      onClose={onClose}
      maxHeightPct={0.84}
      header={(
        <View style={{ paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: v2.font.size.h2, fontWeight: '600', color: C.text, fontFamily: v2.font.sans }}>{i18n.t('프로젝트에서 선택')}</Text>
            <Button
              label={sel.length ? i18n.t('넣기 ({n})', { n: sel.length }) : i18n.t('넣기')}
              variant="primary"
              size="sm"
              onPress={confirm}
              disabled={!sel.length}
            />
          </View>
          {/* 경로 한 줄 — 지금 어느 폴더를 보고 있는지(다른 PC 라면 PC 이름까지). */}
          <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.small, marginTop: 4 }}>
            {(hostName ? hostName + ' · ' : '') + (dirSel.length ? dirSel[dirSel.length - 1] : root || '~')}
          </Text>
        </View>
      )}
    >
      {err ? <Text style={{ color: C.textDim, fontSize: v2.font.size.small, marginBottom: 6 }}>{err}</Text> : null}

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 380 }}>
        {cols.map((col, ci) => (
          <View key={`${col.path}#${ci}`} style={{
            width: COL_W, borderRightWidth: ci === cols.length - 1 ? 0 : 1, borderRightColor: C.border,
            paddingRight: 6, marginRight: 6,
          }}>
            {col.loading ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>
            ) : !col.items.length ? (
              <Text style={{ color: C.textDim, fontSize: v2.font.size.small, padding: 10 }}>{i18n.t('빈 폴더')}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {col.items.map((it) => {
                  const picked = !it.dir && sel.includes(it.path);
                  const entered = it.dir && dirSel[ci] === it.path;
                  return (
                    <PressableRow
                      key={it.path}
                      onPress={() => (it.dir ? enterDir(ci, it.path) : toggleFile(it.path))}
                      selected={!!(entered || picked)}
                      accessibilityLabel={it.name}
                      minHeight={40}
                      radius={R.sm}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 }}
                    >
                      {it.dir
                        ? <Folder size={16} color={C.text3} />
                        : <FileIcon size={16} color={C.textDim} />}
                      <Text numberOfLines={1} style={{ flex: 1, color: it.dir ? C.text : C.text2, fontSize: v2.font.size.small }}>{it.name}</Text>
                      {picked ? <Check size={14} color={C.text} weight="bold" /> : null}
                      {it.dir ? <CaretRight size={12} color={C.textDim} /> : null}
                    </PressableRow>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}
