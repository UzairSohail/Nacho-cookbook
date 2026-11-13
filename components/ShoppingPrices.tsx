/**
 * Woolworths and Coles prices on the shopping list: the total card, the two
 * prices under each line, and the panel for picking another product or size.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Chip, Icon, Text, TextInput, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  costAt,
  findProducts,
  formatSize,
  formatUnitPrice,
  money,
  STORE_NAMES,
  STORE_SHORT,
  STORES,
  unitPrice,
  type LineCost,
  type ListTotals,
  type Need,
  type PriceData,
  type Product,
  type StoreId,
} from '@/src/core';
import type { PriceStatus } from '@/src/prices/priceData';

const dateText = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));

export function PriceSummary({
  totals,
  status,
  updated,
  staples,
  onUseCheapest,
  ai,
}: {
  totals: ListTotals;
  ai: AiControls;
  /** Buy every item at whichever store is cheaper for it. */
  onUseCheapest: () => void;
  status: PriceStatus;
  updated: string | null;
  /** Pantry staples on the list, which aren't counted. */
  staples: number;
}) {
  const c = useTheme();
  if (status === 'loading' && !totals.priced) {
    return (
      <Card tone="sunken" style={styles.compact}>
        <Icon name="price" size={18} color={c.textMuted} />
        <Text variant="muted" style={{ flex: 1, fontSize: 13 }}>Estimated cost: getting today’s Woolworths and Coles prices…</Text>
      </Card>
    );
  }
  if (!totals.priced) {
    return (
      <Card tone="sunken" style={styles.compact}>
        <Icon name="price" size={18} color={c.textMuted} />
        <Text variant="muted" style={{ flex: 1, fontSize: 13 }}>
          Estimated cost:{' '}
          {status === 'offline'
            ? 'prices need a connection the first time. They’ll show once you’re back online.'
            : status === 'unavailable'
              ? 'today’s prices couldn’t be loaded. Try again later.'
              : 'none of these items were found at Woolworths or Coles.'}
        </Text>
      </Card>
    );
  }
  const cheaper: StoreId | null =
    totals.missing.woolies === totals.missing.coles && totals.woolies !== totals.coles
      ? totals.woolies < totals.coles
        ? 'woolies'
        : 'coles'
      : null;
  const notes: string[] = [];
  if (staples) notes.push(`Pantry staples aren’t counted (${staples}).`);
  if (totals.unpriced) notes.push(`${totals.unpriced} ${totals.unpriced === 1 ? 'item has' : 'items have'} no price.`);
  return (
    <Card style={styles.summary}>
      <RNView style={styles.gap}>
        <Text variant="label">ESTIMATED COST</Text>
        <RNView style={styles.totalRow}>
          <Text variant="title" accessibilityLabel={`About ${money(totals.chosen)}`}>
            {money(totals.chosen)}
          </Text>
          <Text variant="muted" style={{ flexShrink: 1 }}>
            at the store picked for each item
          </Text>
        </RNView>
        <RNView style={styles.storeTotals}>
          {STORES.map((s) => (
            <RNView
              key={s}
              style={[
                styles.storeTotal,
                { borderColor: cheaper === s ? c.accent : c.border, backgroundColor: c.background },
              ]}>
              <RNView style={styles.storeTotalTop}>
                <Text variant="muted" style={{ fontSize: 13 }}>
                  All at {STORE_SHORT[s]}
                </Text>
                <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 16 }}>{money(totals[s])}</Text>
              </RNView>
              {cheaper === s ? (
                <Text variant="muted" style={{ color: c.accent, fontFamily: Fonts.bodyBold, fontSize: 12 }}>
                  Cheaper by {money(Math.abs(totals.woolies - totals.coles))}
                </Text>
              ) : totals.missing[s] ? (
                <Text variant="muted" style={{ fontSize: 12 }}>
                  {totals.missing[s]} not found
                </Text>
              ) : null}
            </RNView>
          ))}
        </RNView>
      </RNView>
      <CheapestMix totals={totals} onUse={onUseCheapest} />
      <AiPicks ai={ai} />
      <RNView style={[styles.section, { borderTopColor: c.border }]}>
        <Text variant="muted" style={styles.small}>
          {notes.length ? `${notes.join(' ')} ` : ''}Online prices from hotprices.org{updated ? `, ${dateText(updated)}` : ''}.
          Your store may differ. Costs count whole packs.
        </Text>
      </RNView>
    </Card>
  );
}

export interface AiControls {
  /** Lines Gemini has picked for, as they are now. */
  answered: number;
  /** Lines it hasn't seen (new or changed since). */
  stale: number;
  busy: boolean;
  error: string | null;
  canAsk: boolean;
  onAsk: () => void;
  onForget: () => void;
}

/** Asking Gemini to pick what to buy: products, pack sizes and lines that are the same thing. */
function AiPicks({ ai }: { ai: AiControls }) {
  const c = useTheme();
  const asked = ai.answered > 0;
  return (
    <RNView style={[styles.section, { borderTopColor: c.border }]}>
      <RNView style={styles.sectionHead}>
        <Text variant="label" style={{ flexShrink: 1 }}>
          ✨ AI PICKS (GEMINI)
        </Text>
        {ai.busy ? (
          <ActivityIndicator color={c.tint} />
        ) : !asked || ai.stale ? (
          <Chip
            small
            selected={ai.canAsk}
            label={!asked ? 'Pick with AI' : 'Update AI picks'}
            onPress={() => {
              if (ai.canAsk) ai.onAsk();
            }}
          />
        ) : (
          <Chip small label="Turn off" selected={false} onPress={ai.onForget} />
        )}
      </RNView>
      <Text variant="muted" style={styles.small} accessibilityLiveRegion="polite">
        {ai.busy
          ? 'Asking Gemini… this takes a few seconds.'
          : !asked
            ? 'Let Gemini choose sensible products and pack sizes, like one garlic bulb for 4 cloves, and buy items that are the same thing once.'
            : ai.stale
              ? `Gemini picked for ${ai.answered} ${ai.answered === 1 ? 'item' : 'items'}. ${ai.stale} ${ai.stale === 1 ? 'is' : 'are'} new or changed since.`
              : `Gemini picked for ${ai.answered === 1 ? 'the one item' : `all ${ai.answered} items`}. Your own picks still come first.`}
      </Text>
      {asked && ai.stale && !ai.busy ? (
        <RNView style={styles.row}>
          <Chip small label="Turn off AI picks" selected={false} onPress={ai.onForget} />
        </RNView>
      ) : null}
      {ai.error ? (
        <Text style={[styles.small, { color: c.tint }]} accessibilityLiveRegion="polite">
          {ai.error} The list is using the built-in matching.
        </Text>
      ) : null}
    </RNView>
  );
}

/** The cheapest store for every item, what that saves, and a button to switch to it. */
function CheapestMix({ totals, onUse }: { totals: ListTotals; onUse: () => void }) {
  const c = useTheme();
  const onIt = totals.chosen <= totals.cheapest + 0.005;
  const saves = STORES.filter((s) => totals.savings[s] >= 0.005);
  return (
    <RNView style={[styles.section, { borderTopColor: c.border }]}>
      <RNView style={styles.sectionHead}>
        <Text variant="label" style={{ color: c.accent }}>
          CHEAPEST OVERALL
        </Text>
        <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 16 }}>{money(totals.cheapest)}</Text>
      </RNView>
      {onIt ? (
        <Text style={[styles.small, { color: c.accent, fontFamily: Fonts.bodyBold }]} accessibilityLiveRegion="polite">
          ✓ Your list is on the cheapest mix
        </Text>
      ) : null}
      <Text variant="muted" style={styles.small}>
        {saves.length
          ? `Saves ${saves.map((s) => `${money(totals.savings[s])} compared with all at ${STORE_SHORT[s]}`).join(', and ')}.`
          : 'One store is cheapest for everything, so splitting the shop saves nothing.'}
        {onIt ? '' : ' Keeps the products you picked; only the store changes.'}
      </Text>
      {onIt ? null : <Button title={`Use cheapest (save ${money(totals.chosen - totals.cheapest)})`} onPress={onUse} />}
    </RNView>
  );
}

/**
 * The prices on the right of a list line: the store it's bought at, with the
 * other store underneath. Tapping it opens the panel to pick a store, product or size.
 */
export function PriceTag({
  cost,
  open,
  onToggle,
}: {
  cost: LineCost;
  open: boolean;
  onToggle: () => void;
}) {
  const c = useTheme();
  const first: StoreId = cost.chosen ?? 'woolies';
  const order = cost.coveredBy ? [] : STORES.slice().sort((a, b) => Number(b === first) - Number(a === first));
  const label = cost.coveredBy
    ? 'Bought with another item. Compare sizes'
    : `${STORES.map((s) => `${STORE_NAMES[s]} ${cost[s] ? money(cost[s]!.cost) : 'not found'}`).join(', ')}. ${open ? 'Close sizes' : 'Compare sizes'}`;
  const priced = !!(cost.woolies || cost.coles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
      onPress={onToggle}
      hitSlop={6}
      style={({ pressed }) => [styles.tag, { opacity: pressed ? 0.6 : 1 }]}>
      {cost.coveredBy ? (
        <Text variant="muted" style={{ fontSize: 13 }}>
          ✨ Included
        </Text>
      ) : priced ? (
        order.map((s, i) => {
          const sc = cost[s];
          const chosen = cost.chosen === s;
          return (
            <Text
              key={s}
              numberOfLines={1}
              style={
                chosen
                  ? { fontFamily: Fonts.bodyBold, fontSize: 14, color: c.accent }
                  : { fontFamily: Fonts.body, fontSize: i === 0 ? 14 : 12, color: c.textMuted }
              }>
              {STORE_SHORT[s]} {sc ? money(sc.cost) : '–'}
            </Text>
          );
        })
      ) : null}
      <Text style={[styles.tagLink, { color: c.tint }]}>
        {open ? 'Close ▴' : priced || cost.coveredBy ? 'Sizes ▾' : 'Find price ▾'}
      </Text>
    </Pressable>
  );
}

type SortBy = 'match' | 'unit';

/** Products at both stores for one line, to pick a different product or pack size. */
export function PricePanel({
  name,
  need,
  density,
  produce,
  cost,
  data,
  hasPick,
  onPickProduct,
  onPickStore,
  onReset,
}: {
  name: string;
  need: Need;
  density?: number | null;
  produce: boolean;
  cost: LineCost;
  data: PriceData | null;
  hasPick: boolean;
  onPickProduct: (store: StoreId, product: Product) => void;
  onPickStore: (store: StoreId | null) => void;
  onReset: () => void;
}) {
  const c = useTheme();
  const [query, setQuery] = useState(name);
  const [sort, setSort] = useState<SortBy>('unit');
  const [more, setMore] = useState(false);

  const lists = useMemo(() => {
    const out = {} as Record<StoreId, Product[]>;
    for (const s of STORES) {
      const found = data ? findProducts(query, data.stores[s], { produce, limit: 30, within: 40 }).map((m) => m.product) : [];
      if (sort === 'unit') {
        // Like with like: per kg first, then per litre, then each.
        const order = { g: 0, ml: 1, ea: 2 };
        found.sort((a, b) => order[a.unit] - order[b.unit] || unitPrice(a).value - unitPrice(b).value);
      }
      out[s] = found;
    }
    return out;
  }, [data, query, produce, sort]);

  return (
    <RNView style={[styles.panel, { borderColor: c.border, backgroundColor: c.background }]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search both stores"
        accessibilityLabel="Search both stores"
        returnKeyType="search"
      />
      <RNView style={styles.row}>
        <Chip small role="radio" label="Cheapest per kg/L" selected={sort === 'unit'} onPress={() => setSort('unit')} />
        <Chip small role="radio" label="Best match" selected={sort === 'match'} onPress={() => setSort('match')} />
      </RNView>
      {STORES.map((s) => {
        const sc = cost[s];
        const shown = lists[s].slice(0, more ? 30 : 5);
        return (
          <RNView key={s} style={styles.gap}>
            <RNView style={styles.storeHeader}>
              <Text variant="label">{STORE_NAMES[s].toUpperCase()}</Text>
              {sc ? (
                <Chip
                  small
                  tone="accent"
                  role="radio"
                  label={cost.chosen === s ? 'Buying here' : 'Buy here'}
                  selected={cost.chosen === s}
                  onPress={() => onPickStore(s)}
                />
              ) : null}
            </RNView>
            {sc ? (
              <Text variant="muted">
                {sc.picked ? 'Your pick' : sc.ai ? 'Gemini’s pick' : 'Suggested'}: {sc.product.name}, {formatSize(sc.product)}
                {sc.packs > 1 ? ` × ${sc.packs}` : ''} = {money(sc.cost)} ({formatUnitPrice(sc.product)})
              </Text>
            ) : (
              <Text variant="muted">Nothing picked at {STORE_SHORT[s]} yet.</Text>
            )}
            {shown.length ? (
              <RNView style={[styles.options, { borderColor: c.border, backgroundColor: c.card }]}>
                {shown.map((p, i) => {
                  const line = costAt(s, p, need, true, density);
                  const selected = sc?.product.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => onPickProduct(s, p)}
                      style={({ pressed }) => [
                        styles.option,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                        { opacity: pressed ? 0.6 : 1 },
                      ]}>
                      <RNView style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 15, fontFamily: selected ? Fonts.bodyBold : Fonts.body }} numberOfLines={2}>
                          {selected ? '✓ ' : ''}
                          {p.name}
                        </Text>
                        <Text variant="muted" style={{ fontSize: 13 }}>
                          {formatSize(p)} · {formatUnitPrice(p)}
                        </Text>
                      </RNView>
                      <RNView style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 15 }}>{money(p.price)}</Text>
                        {line.packs > 1 ? (
                          <Text variant="muted" style={{ fontSize: 12 }}>
                            × {line.packs} = {money(line.cost)}
                          </Text>
                        ) : null}
                      </RNView>
                    </Pressable>
                  );
                })}
              </RNView>
            ) : (
              <Text variant="muted">
                {data ? `No products at ${STORE_SHORT[s]} match “${query.trim()}”. Try fewer words.` : 'Prices aren’t loaded yet.'}
              </Text>
            )}
          </RNView>
        );
      })}
      <RNView style={styles.row}>
        {(lists.woolies.length > 5 || lists.coles.length > 5) ? (
          <Chip small label={more ? 'Show fewer' : 'Show more sizes'} selected={false} onPress={() => setMore(!more)} />
        ) : null}
        {cost.storePicked ? (
          <Chip small label="Use the cheaper store" selected={false} onPress={() => onPickStore(null)} />
        ) : null}
        {hasPick ? <Chip small label="Back to suggestions" selected={false} onPress={onReset} /> : null}
      </RNView>
      <Text variant="muted" style={{ fontSize: 12 }}>
        Your picks are remembered for next time, shared with your household, and always beat Gemini’s.
      </Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  storeTotals: { flexDirection: 'row', gap: 8 },
  summary: { gap: 14 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 32 },
  small: { fontSize: 13, lineHeight: 18 },
  storeTotal: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  storeTotalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  tag: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 76, minHeight: 44, gap: 1 },
  tagLink: { fontFamily: Fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18 },
  storeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  options: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  option: { flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
});
