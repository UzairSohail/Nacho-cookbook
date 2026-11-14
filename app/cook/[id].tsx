import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Vibration, View as RNView, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Card, Icon, IconButton, Segmented, Text, View, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  cookSteps,
  formatClock,
  formatDuration,
  kitchenAmount,
  scaleIngredients,
  stepIngredients,
  stepTimers,
  type MeasureView,
  type ScaledIngredient,
} from '@/src/core';
import { useScreenAwake } from '@/src/state/keepAwake';
import { useMeasureView } from '@/src/state/measureView';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

interface RunningTimer {
  id: number;
  /** "Step 3 · 20 min" */
  label: string;
  seconds: number;
  /** When it goes off, while running. */
  endsAt: number | null;
  /** Seconds left, while paused. */
  left: number;
  done: boolean;
}

/**
 * Cooking mode: the method one step at a time in big text, with the amounts
 * each step needs and timers for any times it mentions. The screen stays on
 * while it's open. Page 0 is the "get everything out" list.
 */
export default function CookScreen() {
  const params = useLocalSearchParams<{ id: string; factor?: string; view?: string }>();
  const recipe = useRecipeMap().get(params.id);
  const catalog = useCatalog();
  const { state } = useStore();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const defaultView = useMeasureView();
  const [view, setView] = useState<MeasureView>(params.view === 'cups' || params.view === 'metric' ? params.view : defaultView);
  const factor = Number(params.factor) > 0 ? Number(params.factor) : 1;
  const [page, setPage] = useState(0);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const nextId = useRef(1);
  const scroll = useRef<ScrollViewInstance>(null);

  useScreenAwake();

  const steps = useMemo(() => (recipe ? cookSteps(recipe) : []), [recipe]);
  const scaled = useMemo(() => (recipe ? scaleIngredients(recipe, factor) : []), [recipe, factor]);
  const last = steps.length;
  const step = page > 0 ? steps[page - 1] : undefined;

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const go = useCallback(
    (to: number) => {
      setPage(Math.max(0, Math.min(last, to)));
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [last],
  );

  // Arrow keys and space on a laptop or a tablet keyboard.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(page + 1);
      else if (e.key === 'ArrowLeft') go(page - 1);
      else if (e.key === 'Escape') close();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, go, close]);

  // Tick while a timer runs, and mark the ones that have gone off.
  const running = timers.some((t) => t.endsAt != null && !t.done);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      setTimers((list) =>
        list.some((t) => !t.done && t.endsAt != null && t.endsAt <= at)
          ? list.map((t) => (!t.done && t.endsAt != null && t.endsAt <= at ? { ...t, done: true, endsAt: null, left: 0 } : t))
          : list,
      );
    };
    tick();
    const handle = setInterval(tick, 500);
    return () => clearInterval(handle);
  }, [running]);

  // Buzz (and beep on the web) until every finished timer is dismissed.
  const ringing = timers.some((t) => t.done);
  useEffect(() => {
    if (!ringing) return;
    return startAlarm();
  }, [ringing]);

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="heading">This recipe isn’t here</Text>
        <Button title="Back" onPress={close} />
      </View>
    );
  }

  const amount = (item: ScaledIngredient) => {
    if (item.scaledQuantity == null) return { text: '' };
    const ingredient = catalog.get(item.ingredientId);
    return kitchenAmount(item.scaledQuantity, item.unit, state.settings.system, {
      standard: state.settings.standard,
      name: ingredient?.name,
      density: ingredient?.density,
      view,
    });
  };

  const startTimer = (seconds: number, label: string) => {
    const id = nextId.current++;
    setNow(Date.now());
    setTimers((list) => [...list, { id, label, seconds, endsAt: Date.now() + seconds * 1000, left: seconds, done: false }]);
  };
  const leftOf = (t: RunningTimer) => (t.endsAt != null ? Math.max(0, (t.endsAt - now) / 1000) : t.left);
  const pause = (id: number) =>
    setTimers((list) => list.map((t) => (t.id === id ? { ...t, left: leftOf(t), endsAt: null } : t)));
  const resume = (id: number) =>
    setTimers((list) => list.map((t) => (t.id === id ? { ...t, endsAt: Date.now() + t.left * 1000 } : t)));
  const remove = (id: number) => setTimers((list) => list.filter((t) => t.id !== id));

  const servings = Math.round(recipe.servings * factor * 100) / 100;
  const used = step ? stepIngredients(recipe, step, catalog) : [];
  const stepClocks = step ? stepTimers(step.text) : [];
  const progress = last ? page / last : 1;
  const big = { fontSize: 25, lineHeight: 36 };

  const ingredientRows = (indices: number[]) => (
    <Card style={styles.ingredients}>
      {indices.map((i, n) => {
        const item = scaled[i];
        const name = catalog.get(item.ingredientId)?.name ?? item.ingredientId;
        const a = amount(item);
        return (
          <RNView
            key={i}
            style={[styles.ingredient, { borderBottomColor: c.sunken, borderBottomWidth: n === indices.length - 1 ? 0 : 1 }]}>
            <Text style={styles.amount}>{a.text}</Text>
            <RNView style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, lineHeight: 26 }}>
                {name}
                {item.note ? <Text variant="muted" style={{ fontSize: 16 }}> · {item.note}</Text> : null}
              </Text>
              {a.note ? <Text variant="muted">{a.note}</Text> : null}
            </RNView>
          </RNView>
        );
      })}
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false, title: `Cooking: ${recipe.title}` }} />

      <RNView style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <RNView style={styles.topRow}>
          <IconButton icon="close" label="Leave cooking mode" onPress={close} />
          <RNView style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: Fonts.bodyBold, fontSize: 15 }}>
              {recipe.title}
            </Text>
            <Text variant="muted" style={{ fontSize: 13 }} accessibilityLiveRegion="polite">
              {page === 0 ? 'Get ready' : `Step ${page} of ${last}`} · {servings} {servings === 1 ? 'serving' : 'servings'}
            </Text>
          </RNView>
          <RNView style={[styles.awake, { backgroundColor: c.accentSoft }]}>
            <Text style={{ fontSize: 12, fontFamily: Fonts.bodyBold, color: c.onAccentSoft }}>Screen stays on</Text>
          </RNView>
        </RNView>
        <RNView style={[styles.bar, { backgroundColor: c.sunken }]}>
          <RNView style={[styles.barFill, { backgroundColor: c.tint, width: `${progress * 100}%` }]} />
        </RNView>
      </RNView>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {page === 0 ? (
          <RNView style={{ gap: 16 }}>
            <Text variant="label">GET EVERYTHING OUT</Text>
            <Text style={big}>
              {scaled.length
                ? `You’ll need ${scaled.length} ${scaled.length === 1 ? 'ingredient' : 'ingredients'} for ${servings} ${servings === 1 ? 'serving' : 'servings'}.`
                : 'This recipe has no ingredients listed.'}
            </Text>
            {scaled.some((s) => s.scaledQuantity != null) ? (
              <Segmented<MeasureView>
                accessibilityLabel="Show amounts"
                options={[
                  ['metric', 'Metric'],
                  ['cups', 'Cups'],
                ]}
                value={view}
                onChange={setView}
              />
            ) : null}
            {scaled.length ? ingredientRows(scaled.map((_, i) => i)) : null}
          </RNView>
        ) : step ? (
          <RNView style={{ gap: 20 }}>
            <RNView style={{ gap: 6 }}>
              {step.section ? <Text variant="label">{step.section.toUpperCase()}</Text> : null}
              <Text style={{ fontFamily: Fonts.title, fontSize: 18, color: c.tint }}>Step {step.number}</Text>
            </RNView>
            {step.text ? (
              <Text style={big} accessibilityRole="header">
                {step.text}
              </Text>
            ) : null}
            {step.photoUrl ? (
              <RecipePhoto path={step.photoUrl} style={styles.photo} label={`Photo for step ${step.number}`} />
            ) : null}
            {stepClocks.length ? (
              <RNView style={styles.row}>
                {stepClocks.map((t, i) => (
                  <Button
                    key={i}
                    icon="timer"
                    kind="ink"
                    title={`Start ${t.label} timer`}
                    onPress={() => startTimer(t.seconds, `Step ${step.number} · ${t.label}`)}
                  />
                ))}
              </RNView>
            ) : null}
            {used.length ? (
              <RNView style={{ gap: 10 }}>
                <Text variant="label">FOR THIS STEP</Text>
                {ingredientRows(used)}
              </RNView>
            ) : null}
          </RNView>
        ) : (
          <Text style={big}>This recipe has no method steps.</Text>
        )}
      </ScrollView>

      {timers.length ? (
        <RNView style={styles.timers}>
          {timers.map((t) => {
            const left = leftOf(t);
            const paused = !t.done && t.endsAt == null;
            return (
              <RNView
                key={t.id}
                accessibilityLiveRegion={t.done ? 'assertive' : 'none'}
                style={[styles.timer, { backgroundColor: t.done ? c.tint : c.ink }]}>
                <Icon name="timer" size={20} color={t.done ? c.onTint : c.onInk} />
                <RNView style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: t.done ? c.onTint : c.inkMuted }}>
                    {t.label}
                  </Text>
                  <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 22, lineHeight: 28, color: t.done ? c.onTint : c.onInk }}>
                    {t.done ? 'Time’s up' : formatClock(left)}
                    {paused ? <Text style={{ fontSize: 14, color: c.inkMuted }}>  paused</Text> : null}
                  </Text>
                </RNView>
                {t.done ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => remove(t.id)}
                    style={({ pressed }) => [styles.dismiss, { backgroundColor: c.onTint, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={{ fontFamily: Fonts.bodyBold, color: c.tint }}>Stop</Text>
                  </Pressable>
                ) : (
                  <>
                    <IconButton
                      icon={paused ? 'play' : 'pause'}
                      tone="ink"
                      label={paused ? `Resume ${t.label} timer` : `Pause ${t.label} timer`}
                      onPress={() => (paused ? resume(t.id) : pause(t.id))}
                    />
                    <IconButton icon="close" tone="ink" label={`Cancel ${t.label} timer (${formatDuration(left)} left)`} onPress={() => remove(t.id)} />
                  </>
                )}
              </RNView>
            );
          })}
        </RNView>
      ) : null}

      <RNView style={[styles.footer, { borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          disabled={page === 0}
          onPress={() => go(page - 1)}
          style={({ pressed }) => [
            styles.nav,
            styles.navBack,
            { borderColor: c.borderStrong, opacity: page === 0 ? 0.35 : pressed ? 0.6 : 1 },
          ]}>
          <Icon name="back" size={26} />
          <Text style={styles.navText}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={page >= last ? 'Finish cooking' : page === 0 ? 'Start the first step' : 'Next step'}
          onPress={() => (page >= last ? close() : go(page + 1))}
          style={({ pressed }) => [styles.nav, { flex: 1, backgroundColor: c.tint, opacity: pressed ? 0.75 : 1 }]}>
          <Text style={[styles.navText, { color: c.onTint }]}>
            {page >= last ? 'Finish' : page === 0 ? 'Start cooking' : 'Next step'}
          </Text>
          {page >= last ? <Icon name="check" size={26} color={c.onTint} /> : <Icon name="forward" size={26} color={c.onTint} />}
        </Pressable>
      </RNView>
    </View>
  );
}

/** Vibrates (and on the web, beeps) every couple of seconds. Returns the stop function. */
function startAlarm(): () => void {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 600, 400, 600, 1200], true);
    return () => Vibration.cancel();
  }
  const beep = () => {
    try {
      const AudioCtx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [0, 0.35].forEach((at) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.3);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1000);
    } catch {
      // No sound available: the red timer card still shows.
    }
    try {
      navigator.vibrate?.([400, 200, 400]);
    } catch {}
  };
  beep();
  const handle = setInterval(beep, 2500);
  return () => clearInterval(handle);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  top: { paddingHorizontal: 16, gap: 12, paddingBottom: 4, maxWidth: 760, width: '100%', alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  awake: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, maxWidth: 760, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: '100%', maxWidth: 520, aspectRatio: 4 / 3 },
  ingredients: { paddingVertical: 4, paddingHorizontal: 16 },
  ingredient: { flexDirection: 'row', gap: 14, paddingVertical: 14, alignItems: 'flex-start' },
  amount: { width: 96, fontFamily: Fonts.bodyBold, fontSize: 18, lineHeight: 26 },
  timers: { paddingHorizontal: 16, paddingTop: 10, gap: 8, maxWidth: 760, width: '100%', alignSelf: 'center' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  dismiss: { paddingHorizontal: 20, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  nav: { height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  navBack: { paddingHorizontal: 22, borderWidth: 1 },
  navText: { fontFamily: Fonts.bodyBold, fontSize: 18 },
});
