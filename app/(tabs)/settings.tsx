import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { useState } from 'react';

import {
  Button,
  Card,
  Check,
  Icon,
  IconButton,
  ScreenHeader,
  SearchField,
  SectionTitle,
  Segmented,
  Stepper,
  TAB_BAR_SPACE,
  Text,
  useTheme,
} from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { useAuth } from '@/src/backend/auth';
import { KITCHEN_STANDARD, spoonSize, type UnitSystem } from '@/src/core';
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
  const [find, setFind] = useState('');
  const staples = new Set(state.pantry);
  const q = find.trim().toLowerCase();
  // Staples first so they're easy to review; the rest only once you search, since the list grows with every recipe.
  const ingredients = [...state.ingredients]
    .filter((i) => (q ? i.name.toLowerCase().includes(q) : staples.has(i.id)))
    .sort((a, b) => Number(staples.has(b.id)) - Number(staples.has(a.id)) || a.name.localeCompare(b.name));

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
          <SectionTitle icon="measure" tone={2} title="Units and measures" hint="Used for the shopping list and recipes shown as written" />
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

        <Card style={styles.gap}>
          <SectionTitle
            icon="pantry"
            tone={3}
            title="Pantry staples"
            hint="Kept on the list, flagged so you check the cupboard first"
          />
          <SearchField value={find} onChangeText={setFind} placeholder="Find an ingredient to add" accessibilityLabel="Find an ingredient" />
          {!q ? (
            ingredients.length === 0 ? (
              <Text variant="muted">No staples yet. Search above to add some.</Text>
            ) : (
              <RNView style={styles.chips}>
                {ingredients.map((i) => (
                  <RNView key={i.id} style={[styles.staple, { backgroundColor: c.accentSoft }]}>
                    <Text style={{ fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.onAccentSoft }}>{i.name}</Text>
                    <IconButton
                      icon="close"
                      size={28}
                      iconSize={14}
                      tone="clear"
                      label={`Remove ${i.name}`}
                      onPress={() => dispatch({ type: 'togglePantry', ingredientId: i.id })}
                    />
                  </RNView>
                ))}
              </RNView>
            )
          ) : ingredients.length === 0 ? (
            <Text variant="muted">No ingredients match “{find}”.</Text>
          ) : (
            <RNView>
              {ingredients.map((i, n) => {
                const on = staples.has(i.id);
                return (
                  <Pressable
                    key={i.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => dispatch({ type: 'togglePantry', ingredientId: i.id })}
                    style={[styles.result, n < ingredients.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.sunken }]}>
                    <Check checked={on} size={24} />
                    <Text>{i.name}</Text>
                  </Pressable>
                );
              })}
            </RNView>
          )}
        </Card>

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staple: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 18, paddingLeft: 14, paddingRight: 4, minHeight: 36 },
  result: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
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
