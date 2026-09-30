import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Laptop, GithubLogo, Cloud, CaretRight, LinkBreak } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Sheet, PressableRow } from './ui';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useAppAlert } from '../hooks/useAppAlert';
import PcWorkspaceSheet from './PcWorkspaceSheet';
import PcPickerSheet from './PcPickerSheet';
import CloudWorkspaceSheet from './CloudWorkspaceSheet';
import RepoPickerSheet from './RepoPickerSheet';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

// '+' 새 워크스페이스 — 생성 방식 선택 시트(셸 레벨 마운트).
//   내 PC 에 만들기(폴더 선택) / GitHub 에서 열기(폴더 선택) / 클라우드에 만들기.
//   PC 연결돼 있으면 무조건 클라우드가 아니라 PC 의 원하는 경로에 만들 수 있게 한다.
export default function NewWorkspaceSheet() {
  const { alert } = useAppAlert();
  const S = useWorkspaceShell();
  const { localOnline, cloudEnabled, runners } = useDaemonStatus();
  const localHosts = (runners || []).filter((r) => r.kind === 'local');
  // PC(내 PC)를 메인으로 고객 반응을 먼저 검증하는 기간 — GitHub·클라우드는 "곧 제공"(비활성)으로만 노출.
  //  부활 시 이 플래그만 true 로. (클라우드 러너는 데모/심사용으로 서버에서 동작하고, 데모 워크스페이스는
  //   목록에서 바로 열리므로 이 진입점 비활성과 무관하다.)
  const OTHER_SOURCES_ENABLED = false;

  const [showPc, setShowPc] = useState(false);
  const [showPcPicker, setShowPcPicker] = useState(false);
  const [pcHost, setPcHost] = useState<{ id: number | null; name?: string }>({ id: null });
  const [showRepo, setShowRepo] = useState(false);
  const [showCloud, setShowCloud] = useState(false);

  const open = S.newWsOpen;

  // 생성 완료 → 목록 새로고침 + 활성화 → 시트 닫기.
  const activateCreated = useCallback(async (id: string) => {
    await S.loadWorkspaces();
    if (id) S.setActive(id);
    S.closeNewWs();
  }, [S]);

  // 내 PC 에 만들기.
  const onPickPc = useCallback(async () => {
    if (!localOnline) {
      S.closeNewWs();
      await alert({ title: i18n.t('PC가 오프라인이에요'), message: i18n.t('PC에서 CodingPT를 실행한 뒤 다시 시도해 주세요.') });
      return;
    }
    // ★ 2026-08-14: 사이드바가 기기 우선으로 바뀌면서 "어느 PC 에?" 는 이미 화면 위에서 골라져
    //  있다. 그 PC 가 목록에 있으면 **PC 선택 시트를 건너뛴다** — 두 번 묻는 것은 같은 질문의 반복이다.
    const picked = S.resolvedDeviceId();
    const target = picked != null ? localHosts.find((h) => String(h.deviceId) === String(picked)) : null;
    if (target) { setPcHost({ id: target.deviceId ?? null, name: target.deviceName }); setShowPc(true); return; }
    // 연결된 PC가 여러 대면 PC 선택 시트를 먼저(폴더 선택 전), 1대면 바로 폴더 피커.
    if (localHosts.length > 1) { setShowPcPicker(true); return; }
    setPcHost({ id: localHosts[0]?.deviceId ?? null, name: localHosts[0]?.deviceName });
    setShowPc(true);
  }, [localOnline, localHosts, alert, S]);

  // 클라우드에 만들기 — PC 와 동일하게 이름/경로를 지정하는 시트로(루트에 즉시 생성 X).
  const onPickCloud = useCallback(() => { setShowCloud(true); }, []);

  const Row = ({ icon, title, desc, onPress, badge, disabled }: { icon: React.ReactNode; title: string; desc: string; onPress: () => void; badge?: React.ReactNode; disabled?: boolean }) => (
    <PressableRow onPress={onPress} disabled={disabled} radius={v2.radius.md}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, marginBottom: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: v2.radius.lg, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: v2.font.size.body, fontWeight: v2.font.weight.medium, color: C.text }}>{title}</Text>
          {badge}
        </View>
        <Text style={{ fontSize: v2.font.size.small, color: C.textDim, marginTop: 2 }} numberOfLines={1}>{desc}</Text>
      </View>
      {disabled
        ? <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: v2.radius.pill, backgroundColor: C.elevated2 }}><Text style={{ fontSize: v2.font.size.caption, color: C.textDim, fontWeight: v2.font.weight.semibold }}>{i18n.t('곧 제공')}</Text></View>
        : <CaretRight size={16} color={C.textDim} />}
    </PressableRow>
  );

  return (
    <>
      <Sheet
        visible={open && !showPc && !showPcPicker && !showRepo && !showCloud}
        onClose={S.closeNewWs}
        header={
          <View style={{ paddingBottom: 12 }}>
            <Text style={{ fontSize: v2.font.size.h2, fontWeight: v2.font.weight.semibold, color: C.text, marginBottom: 4 }}>{i18n.t('새 워크스페이스')}</Text>
            <Text style={{ fontSize: v2.font.size.caption, color: C.textDim }}>{i18n.t('어디에 만들지 선택하세요.')}</Text>
          </View>
        }
      >
        <Row
          icon={<Laptop size={20} color={localOnline ? C.text2 : C.textDim} weight="fill" />}
          title={i18n.t('PC 폴더 선택')}
          desc={localOnline ? i18n.t('프로젝트 폴더를 워크스페이스로 추가해요') : i18n.t('PC가 오프라인이에요')}
          onPress={onPickPc}
          badge={localOnline
            ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.cta }} />
            : <LinkBreak size={13} color={C.textDim} />}
        />
        <Row
          icon={<GithubLogo size={20} color={C.text} weight="fill" />}
          title={i18n.t('GitHub에서 열기')}
          desc={i18n.t('내 레포를 PC 폴더로 clone 해서 작업')}
          onPress={() => setShowRepo(true)}
          disabled={!OTHER_SOURCES_ENABLED}
        />
        {/* GitHub·클라우드는 검증 기간 동안 "곧 제공"(비활성) — 코드/시트는 보존, 플래그로 부활. */}
        <Row
          icon={<Cloud size={20} color={C.text2} weight="fill" />}
          title={i18n.t('클라우드에 만들기')}
          desc={i18n.t('PC 없이 클라우드 러너에 폴더를 지정해 작업')}
          onPress={onPickCloud}
          disabled={!OTHER_SOURCES_ENABLED}
        />

        <Pressable onPress={S.closeNewWs} style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 4 }}>
          <Text style={{ color: C.textDim, fontSize: v2.font.size.small }}>{i18n.t('취소')}</Text>
        </Pressable>
      </Sheet>

      {/* 다중 PC — 폴더 선택 전 대상 PC 선택 시트 */}
      <PcPickerSheet
        visible={showPcPicker}
        hosts={localHosts}
        onClose={() => setShowPcPicker(false)}
        onPick={(id, name) => { setShowPcPicker(false); setPcHost({ id, name }); setShowPc(true); }}
      />

      {/* 내 PC 폴더 선택(Finder 컬럼뷰) → 생성 → 셸에 위임 */}
      <PcWorkspaceSheet
        visible={showPc}
        host={pcHost.id}
        hostName={pcHost.name}
        onClose={() => setShowPc(false)}
        onCreated={(c) => { setShowPc(false); void activateCreated(c.id); }}
      />

      {/* 클라우드 → 이름/경로 지정 → compute:'cloud' 등록 → 셸에 위임 (제공 중단 중엔 미마운트) */}
      {cloudEnabled && (
        <CloudWorkspaceSheet
          visible={showCloud}
          onClose={() => setShowCloud(false)}
          onCreated={(c) => { setShowCloud(false); void activateCreated(c.id); }}
        />
      )}

      {/* GitHub 레포 → 폴더 선택 → clone → 셸에 위임 */}
      <RepoPickerSheet
        visible={showRepo}
        onClose={() => setShowRepo(false)}
        onOpen={(_lp, _name, wsId) => { setShowRepo(false); void activateCreated(wsId || ''); }}
      />
    </>
  );
}
