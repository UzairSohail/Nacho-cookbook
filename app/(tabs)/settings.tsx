import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { router } from 'expo-router';

import {
  Button,
  Card,
  Icon,
  ScreenHeader,
  SectionTitle,
  Segmented,
  Stepper,
  TAB_BAR_SPACE,
  Text,
  useTheme,
} from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { useAuth } from '@/src/backend/auth';
import { KITCHEN_STANDARD, spoonSize, type MeasureView, type UnitSystem } from '@/src/core';
import { setMeasureView, useMeasureView } from '@/src/state/measureView';
import { setPlanPeriod, usePlanPeriod } from '@/src/state/planPeriod';
import { useStore, type SyncInfo } from '@/src/state/store';
import { formatMb } from '@/src/core/appUpdate';
import { checkForUpdate, installUpdate, updatesSupported, useAppUpdate } from '@/src/updates/appUpdate';

function syncLabel(sync: SyncInfo): string {
  if (sync.mode === 'demo') return '';
  if (sync.mode === 'local') return 'Sync isn’t set up yet: changes stay on this device until the app restarts.';
  if (!sync.connected && sync.authRejected)
    return 'Can’t sync: the sync server didn’t accept your sign-in, so changes from your household won’t show up yet. Your own changes are saved on this device.';
  if (!sync.connected) return 'Offline. Changes are saved on this device and sync when you’re back online.';
  if (sync.uploading || sync.downloading) return 'Syncing…';
  if (!sync.hasSynced) return 'Connecting…';
  return 'Up to date with your household.';
}

export default function SettingsScreen() {
  const { state, dispatch, sync } = useStore();
  const auth = useAuth();
  const c = useTheme();
  const { settings } = state;
  const measureView = useMeasureView();
  const pantryNames = state.ingredients
    .filter((i) => state.pantry.includes(i.id))
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader eyebrow="How your kitchen works" title="Settings" />

      <RNView style={styles.body}>
        <Card tone="ink" style={styles.household}>
          <RNView style={styles.householdTop}>
            <RNView style={[styles.householdIcon, { backgroundColor: c.inkSunken }]}>
              <Icon name="home" size={24} color={c.onInk} />
            </RNView>
            <RNView style={{ flex: 1, gap: 3 }}>
              <Text variant="subheading" style={{ fontSize: 19, color: c.onInk }}>
                {auth.demoMode ? 'Your household' : auth.household?.name}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: c.inkMuted }}>
                {auth.demoMode ? 'Demo mode: running on sample data on this device only.' : `Signed in as ${auth.account?.email}`}
              </Text>
            </RNView>
          </RNView>
          {auth.demoMode ? null : (
            <>
              <Text style={{ fontSize: 13, lineHeight: 18, color: c.inkMuted }}>{syncLabel(sync)}</Text>
              <RNView style={[styles.invite, { backgroundColor: c.inkSunken }]}>
                <Text style={{ fontSize: 12, color: c.inkMuted }}>Invite code — share it so others can join</Text>
                <Text selectable style={{ fontFamily: Fonts.title, fontSize: 24, letterSpacing: 2, color: c.onInk }}>
                  {auth.household?.inviteCode}
                </Text>
              </RNView>
              <Pressable accessibilityRole="button" onPress={auth.signOut} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14, color: c.onInk, textDecorationLine: 'underline' }}>Sign out</Text>
              </Pressable>
            </>
          )}
        </Card>

        <Card style={styles.gap}>
          <SectionTitle icon="people" tone={0} title="Household size" hint="New plan entries default to this many servings" />
          <Stepper
            value={settings.householdSize}
            label="people"
            onChange={(v) => dispatch({ type: 'settings', patch: { householdSize: v } })}
          />
        </Card>

        <PlanPeriodCard />

        <Card style={styles.gap}>
          <SectionTitle icon="measure" tone={2} title="Units and measures" hint="How recipes show their amounts" />
          <Segmented<MeasureView>
            accessibilityLabel="Recipes open in"
            options={[['metric', 'Metric (g, ml)'], ['cups', 'Cups']]}
            value={measureView}
            onChange={setMeasureView}
          />
          <Text variant="label" style={{ marginTop: 6 }}>SHOPPING LIST UNITS</Text>
          <Segmented<UnitSystem>
            accessibilityLabel="Units"
            options={[['metric', 'Metric'], ['imperial', 'Imperial']]}
            value={settings.system}
            onChange={(system) => dispatch({ type: 'settings', patch: { system } })}
          />
          <Text variant="muted" style={{ fontSize: 13 }}>
            Every recipe uses the same cups and spoons: {spoonSize('cup', KITCHEN_STANDARD)} ml cup,{' '}
            {spoonSize('tbsp', KITCHEN_STANDARD)} ml tbsp, {spoonSize('tsp', KITCHEN_STANDARD)} ml tsp.
          </Text>
        </Card>

        <Pressable accessibilityRole="button" onPress={() => router.push('/pantry')}>
          <Card style={styles.gap}>
            <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <RNView style={{ flex: 1 }}>
                <SectionTitle
                  icon="pantry"
                  tone={3}
                  header={false}
                  title="Pantry"
                  hint={
                    pantryNames.length
                      ? `${pantryNames.length} at home: ${pantryNames.slice(0, 4).join(', ')}${pantryNames.length > 4 ? '…' : ''}`
                      : 'Things you keep at home stay off the shopping list'
                  }
                />
              </RNView>
              <Icon name="forward" size={20} color={c.textMuted} />
            </RNView>
          </Card>
        </Pressable>

        {updatesSupported ? <AppUpdateCard /> : null}
      </RNView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: TAB_BAR_SPACE + 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  gap: { gap: 14 },
  household: { gap: 12, borderRadius: 22 },
  householdTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  householdIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  invite: { borderRadius: 14, padding: 12, gap: 2 },
});

function PlanPeriodCard() {
  const period = usePlanPeriod();
  return (
    <Card style={styles.gap}>
      <SectionTitle icon="planner" tone={1} title="Plan and shop for" hint="Starting on a Monday · saved on this device" />
      <Segmented<'7' | '14'>
        accessibilityLabel="Plan length"
        options={[['7', 'A week'], ['14', 'A fortnight']]}
        value={String(period) as '7' | '14'}
        onChange={(v) => setPlanPeriod(Number(v) as 7 | 14)}
      />
    </Card>
  );
}

function AppUpdateCard() {
  const u = useAppUpdate();
  const busy = u.phase !== 'idle';
  let status: string;
  if (u.installed == null) status = 'Development build: update checks are off.';
  else if (u.phase === 'checking') status = 'Checking for updates…';
  else if (u.phase === 'downloading')
    status = `Downloading the update${u.progress == null ? '…' : ` (${Math.round(u.progress * 100)}%)`}`;
  else if (u.phase === 'installing') status = 'Opening the installer…';
  else if (u.available && u.latest)
    status = `A newer version (build ${u.latest.build}) is ready to install${u.latest.apkSize ? `, ${formatMb(u.latest.apkSize)}` : ''}.`;
  else if (u.checkedAt != null) status = 'You have the latest version.';
  else status = '';
  return (
    <Card style={styles.gap}>
      <SectionTitle icon="update" tone={4} title="App updates" />
      <Text variant="muted">
        {u.installed != null ? `This is build ${u.installed}. ` : ''}The app checks for new versions when it opens.
        Updating downloads the new version, then Android asks you to tap Update.
      </Text>
      {status ? <Text>{status}</Text> : null}
      {u.error ? <Text variant="muted">{u.error}</Text> : null}
      {u.installed != null ? (
        u.available ? (
          <Button title="Download and install" disabled={busy} onPress={() => installUpdate()} />
        ) : (
          <Button title="Check for updates" kind="secondary" disabled={busy} onPress={() => checkForUpdate(true)} />
        )
      ) : null}
    </Card>
  );
}
