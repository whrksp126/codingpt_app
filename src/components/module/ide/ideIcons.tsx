import React from 'react';
import Svg, { Path, Rect, Line, Circle, G } from 'react-native-svg';

type IconProps = { size?: number; color?: string; filled?: boolean };

// VS Code 스타일 상단바 아이콘 — 비활성=외곽선(line), 활성=채움(fill).
// 채움 시 내부 디테일은 어두운 색(#11151F)으로 knock-out 한다.
const KO = '#11151F';

// 좌측 사이드바(탐색기) 토글 — 활성 시 "좌측" 패널이 채워짐
export const SidebarIcon = ({ size = 22, color = '#fff', filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={16} rx={2} stroke={color} strokeWidth={1.6} fill="none" />
    {filled
      ? <Rect x={4} y={5} width={5} height={14} rx={1} fill={color} />
      : <Line x1={9} y1={4} x2={9} y2={20} stroke={color} strokeWidth={1.6} />}
  </Svg>
);

// 터미널 토글
export const TerminalIcon = ({ size = 22, color = '#fff', filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={16} rx={2} stroke={color} strokeWidth={1.6} fill={filled ? color : 'none'} />
    <Path d="M7 9l3 3-3 3" stroke={filled ? KO : color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1={12} y1={16} x2={16} y2={16} stroke={filled ? KO : color} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

// 우측 패널(Agent) 토글 — 활성 시 "우측" 패널이 채워짐
export const PanelRightIcon = ({ size = 22, color = '#fff', filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={16} rx={2} stroke={color} strokeWidth={1.6} fill="none" />
    {filled
      ? <Rect x={15} y={5} width={5} height={14} rx={1} fill={color} />
      : <Line x1={15} y1={4} x2={15} y2={20} stroke={color} strokeWidth={1.6} />}
  </Svg>
);

// 브라우저(프리뷰)
export const BrowserIcon = ({ size = 22, color = '#fff', filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} fill={filled ? color : 'none'} />
    <Circle cx={12} cy={12} r={3.2} stroke={filled ? KO : color} strokeWidth={1.6} />
    <Path d="M12 8.8h8M5.4 9.5l4 5.2M14.6 14.7l-4 0.2" stroke={filled ? KO : color} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

// 설정 목록(List) 토글
export const ListIcon = ({ size = 22, color = '#fff', filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1={9} y1={6} x2={20} y2={6} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1={9} y1={12} x2={20} y2={12} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1={9} y1={18} x2={20} y2={18} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Circle cx={4.5} cy={6} r={1.4} fill={color} />
    <Circle cx={4.5} cy={12} r={1.4} fill={color} />
    <Circle cx={4.5} cy={18} r={1.4} fill={color} />
  </Svg>
);

// 모듈 우상단 "IDE로 열기" 트리거 아이콘 (</>)
export const CodeBracketsIcon = ({ size = 16, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// 터미널 넓게 보기(전체화면) 토글 — expanded=false: 바깥쪽 모서리(펼치기), expanded=true: 안쪽 모서리(접기)
export const FullscreenIcon = ({ size = 16, color = '#fff', expanded = false }: IconProps & { expanded?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {expanded ? (
      // 접기(안쪽으로 모이는 화살표)
      <Path
        d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
        stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      />
    ) : (
      // 펼치기(바깥쪽 모서리)
      <Path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      />
    )}
  </Svg>
);

// Agent 스파클
export const SparkleIcon = ({ size = 48, color = '#cbd5e1' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <G>
      <Path d="M20 8c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M36 6c.5 2.5 1.5 3.5 4 4-2.5.5-3.5 1.5-4 4-.5-2.5-1.5-3.5-4-4 2.5-.5 3.5-1.5 4-4z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </G>
  </Svg>
);
