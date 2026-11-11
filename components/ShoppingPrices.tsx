/**
 * Woolworths and Coles prices on the shopping list: the total card, the two
 * prices under each line, and the panel for picking another product or size.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View as RNView } from 'react-native';

import { Card, Chip, Text, TextInput, useTheme } from '@/components/Themed';
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
}: {
  totals: ListTotals;
  status: PriceStatus;
  updated: string | null;
  /** Pantry staples on the list, which aren't counted. */
  staples: number;
}) {
  const c = useTheme();
  if (status === 'loading' && !totals.priced) {
    return (
      <Card style={styles.gap}>
        <Text variant="label">ESTIMATED COST</Text>
        <Text variant="muted">Getting today’s Woolworths and Coles prices…</Text>
      </Card>
    );
  }
  if (!totals.priced) {
    return (
      <Card style={styles.gap}>
        <Text variant="label">ESTIMATED COST</Text>
        <Text variant="muted">
          {status === 'offline'
            ? 'Prices need a connection the first time. They’ll show once you’re back online.'
            : status === 'unavailable'
              ? 'Today’s prices couldn’t be loaded. Try again later.'
              : 'None of these items were found at Woolworths or Coles.'}
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
    <Card style={styles.gap}>
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
            <Text variant="muted">All at {STORE_SHORT[s]}</Text>
            <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 18 }}>{money(totals[s])}</Text>
            {cheaper === s ? (
              <Text variant="muted" style={{ color: c.accent, fontFamily: Fonts.bodyBold }}>
                Cheaper by {money(Math.abs(totals.woolies - totals.coles))}
              </Text>
            ) : totals.missing[s] ? (
              <Text variant="muted">{totals.missing[s]} not found</Text>
            ) : null}
          </RNView>
        ))}
      </RNView>
      {notes.length ? <Text variant="muted">{notes.join(' ')}</Text> : null}
      <Text variant="muted" style={{ fontSize: 12 }}>
        Online prices from hotprices.org{updated ? `, ${dateText(updated)}` : ''}. Your store may differ. Costs count
        whole packs.
      </Text>
    </Card>
  );
}

/** The two prices under a list line. Tapping one buys it there; "Compare" opens the panel. */
export function PriceLine({
  cost,
  open,
  onPickStore,
  onToggle,
}: {
  cost: LineCost;
  open: boolean;
  onPickStore: (store: StoreId) => void;
  onToggle: () => void;
}) {
  const c = useTheme();
  return (
    <RNView style={styles.priceLine}>
      {STORES.map((s) => {
        const sc = cost[s];
        const chosen = cost.chosen === s;
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen, disabled: !sc }}
            accessibilityLabel={sc ? `${STORE_NAMES[s]} ${money(sc.cost)}` : `${STORE_NAMES[s]}: not found`}
            disabled={!sc}
            onPress={() => onPickStore(s)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.pricePill,
              {
                borderColor: chosen ? c.accent : c.border,
                backgroundColor: chosen ? c.accent : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Text style={[styles.pillText, { color: chosen ? c.onTint : sc ? c.text : c.textMuted }]}>
              {STORE_SHORT[s]} {sc ? money(sc.cost) : '–'}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        hitSlop={8}
        style={({ pressed }) => [styles.compare, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.pillText, { color: c.tint }]}>{open ? 'Close' : 'Sizes'}</Text>
      </Pressable>
    </RNView>
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
                {sc.picked ? 'Your pick' : 'Suggested'}: {sc.product.name}, {formatSize(sc.product)}
                {sc.packs > 1 ? ` × ${sc.packs}` : ''} = {money(sc.cost)}
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
        Your picks are remembered for next time and shared with your household.
      </Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  storeTotals: { flexDirection: 'row', gap: 8 },
  storeTotal: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 12, padding: 10, gap: 2 },
  priceLine: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  pricePill: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, minHeight: 30, justifyContent: 'center' },
  pillText: { fontFamily: Fonts.bodyMedium, fontSize: 13 },
  compare: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 4 },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 12 },
  storeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  options: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  option: { flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
});
