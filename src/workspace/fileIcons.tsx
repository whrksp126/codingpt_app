// fileIcons — VS Code **Material Icon Theme**(MIT) 실제 SVG. PC fileicons.js 와 같은 데이터·같은 판정.
//  (예전 색 배지+모노그램 근사는 2026-10 사용자 요청으로 폐기)
import React from 'react';
import { SvgXml } from 'react-native-svg';
import D from './fileIconsData';

export function fileIconId(name: string): string {
  const n = String(name || '').split('/').pop()!.toLowerCase();
  if (D.names[n]) return D.names[n];
  const parts = n.split('.');
  for (let i = 1; i < parts.length; i++) {
    const e = parts.slice(i).join('.');
    if (D.ext[e]) return D.ext[e];
  }
  return D.file;
}

export function FileTypeIcon({ name, size = 15 }: { name: string; size?: number }) {
  const id = fileIconId(name);
  return <SvgXml xml={D.svgs[id] || D.svgs[D.file]} width={size} height={size} />;
}

export function FolderTypeIcon({ open, size = 16, name }: { open?: boolean; size?: number; name?: string }) {
  const n = String(name || '').split('/').pop()!.toLowerCase();
  const id = (open ? D.foldersOpen[n] : D.folders[n]) || (open ? D.folderOpen : D.folder);
  return <SvgXml xml={D.svgs[id]} width={size} height={size} />;
}
