import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View as RNView } from 'react-native';

import { PriceLine, PricePanel, PriceSummary } from '@/components/ShoppingPrices';
import { Button, Card, Chip, Text, TextInput, useTheme } from '@/components/Themed';
import {
  addDays,
  AISLE_LABELS,
  costLine,
  needFor,
  totalsFor,
  AISLE_ORDER,
  formatAmount,
  listToText,
  parseQuantity,
  periodRange,
  today,
  type Ingredient,
  type LineCost,
  type ListItem,
  type MeasureStandard,
  type PriceData,
} from '@/src/core';
import { usePriceData } from '@/src/prices/priceData';
import { periodName, usePlanPeriod } from '@/src/state/planPeriod';
import { useStore } from '@/src/state/store';

type RangeChoice = 'this' | 'next';

export default function ShoppingListScreen() {
  const { state, dispatch } = useStore();
  const c = useTheme();
  const { system, standard } = state.settings;
  const period = usePlanPeriod();
  const name = periodName(period);
  const [choice, setChoice] = useState<RangeChoice>('this');
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [priceOpenId, setPriceOpenId] = useState<string | null>(null);
  const prices = usePriceData();

  const current = periodRange(today(), period);
  const range = choice === 'this' ? current : periodRange(addDays(current.start, period), period);

  const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rangeText = `${short.format(new Date(range.start))} – ${short.format(new Date(range.end))}`;

  const generate = () => {
    const planned = state.plan.some((e) => e.recipeId && e.date >= range.start && e.date <= range.end);
    setNote(planned ? null : `Nothing is planned for ${rangeText} yet. Add recipes in the Planner first.`);
    if (planned) dispatch({ type: 'generateList', range });
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    dispatch({ type: 'addItem', name: newItem });
    setNewItem('');
  };

  const amount = (q: number | null, unit: string | null) => {
    if (q == null) return '';
    const a = formatAmount(q, unit, system, { standard });
    return `${a.quantity}${a.unit ? ` ${a.unit}` : ''}`;
  };

  const share = () => {
    Share.share({ message: listToText(state.list, (q, u) => amount(q, u)) }).catch(() => {});
  };

  // Unknown aisle names from older rows land in Other rather than vanishing.
  const aisleOf = (item: ListItem) => (AISLE_ORDER.includes(item.aisle) ? item.aisle : 'other');
  const aisles = AISLE_ORDER.filter((a) => state.list.some((i) => aisleOf(i) === a));
  // Within an aisle, things still to get come first, then what's already in the trolley.
  const inAisle = (aisle: string) =>
    state.list
      .filter((i) => aisleOf(i) === aisle)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
  const tickedCount = state.list.filter((i) => i.checked).length;
  // Generated lines are keyed "<ingredient id>|<kind>", so staples can be flagged without storing anything extra.
  const staples = new Set(state.pantry);
  const isStaple = (item: ListItem) => !!item.key && staples.has(item.key.split('|')[0]);

  // Each line's ingredient (for its price pick and density): by id for generated lines, by name for hand-added ones.
  const ingredientOf = useMemo(() => {
    const byId = new Map(state.ingredients.map((i) => [i.id, i]));
    const byName = new Map(state.ingredients.map((i) => [i.name.trim().toLowerCase(), i]));
    return (item: ListItem): Ingredient | undefined =>
      item.key ? byId.get(item.key.split('|')[0]) : byName.get(item.name.trim().toLowerCase());
  }, [state.ingredients]);

  const costs = useMemo(() => {
    const m = new Map<string, LineCost>();
    for (const item of state.list) {
      const ing = ingredientOf(item);
      m.set(item.id, lineCostFor(item, ing, prices.data, standard));
    }
    return m;
  }, [state.list, ingredientOf, prices.data, standard]);
  const totals = totalsFor(state.list.filter((i) => !isStaple(i)).map((i) => costs.get(i.id)!));
  const stapleCount = state.list.filter(isStaple).length;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Card style={styles.gap}>
        <Text variant="label">MAKE A LIST FROM THE PLAN</Text>
        <RNView style={styles.row}>
          {(['this', 'next'] as const).map((r) => (
            <Chip
              key={r}
              role="radio"
              label={`${r === 'this' ? 'This' : 'Next'} ${name}`}
              selected={choice === r}
              onPress={() => {
                setChoice(r);
                setNote(null);
              }}
            />
          ))}
        </RNView>
        <Button
          title={state.list.length ? 'Update from plan' : 'Generate list'}
          onPress={generate}
        />
        {note ? <Text style={{ color: c.tint }}>{note}</Text> : null}
        <Text variant="muted">{rangeText}. Adding recipes in the Planner updates the list for you. Updating keeps anything you added or changed by hand.</Text>
      </Card>

      <RNView style={[styles.row, { flexWrap: 'nowrap' }]}>
        <TextInput
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Add an item"
          accessibilityLabel="Add an item"
          style={{ flex: 1, minWidth: 0 }}
          returnKeyType="done"
          onSubmitEditing={addItem}
        />
        <Button title="Add" onPress={addItem} />
      </RNView>

      {state.list.length ? (
        <RNView style={styles.gap}>
          <Text variant="muted" accessibilityLiveRegion="polite">
            {tickedCount === state.list.length
              ? `All ${state.list.length} ticked off. Nice work!`
              : `${tickedCount} of ${state.list.length} ticked off`}
          </Text>
          <RNView style={[styles.progress, { backgroundColor: c.border }]}>
            <RNView
              style={[styles.progressFill, { backgroundColor: c.accent, width: `${(tickedCount / state.list.length) * 100}%` }]}
            />
          </RNView>
        </RNView>
      ) : null}

      {state.list.length ? (
        <PriceSummary totals={totals} status={prices.status} updated={prices.data?.updated ?? null} staples={stapleCount} />
      ) : null}

      {aisles.map((aisle) => {
        const items = inAisle(aisle);
        const left = items.filter((i) => !i.checked).length;
        return (
          <RNView key={aisle} style={styles.gap}>
            <RNView style={styles.aisleHeader}>
              <Text variant="label" accessibilityRole="header">{AISLE_LABELS[aisle].toUpperCase()}</Text>
              <Text variant="muted" style={left === 0 ? { color: c.accent } : undefined}>
                {left === 0 ? 'All done ✓' : `${left} to get`}
              </Text>
            </RNView>
            <Card style={{ paddingVertical: 4 }}>
              {items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  staple={isStaple(item)}
                  amount={amount(item.quantity, item.unit)}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                  cost={costs.get(item.id)!}
                  ingredient={ingredientOf(item)}
                  standard={standard}
                  data={prices.data}
                  priceOpen={priceOpenId === item.id}
                  onTogglePrice={() => setPriceOpenId(priceOpenId === item.id ? null : item.id)}
                />
              ))}
            </Card>
          </RNView>
        );
      })}

      {state.list.length ? (
        <RNView style={styles.row}>
          <Button title="Share list" onPress={share} />
          <Button title="Clear ticked" kind="secondary" onPress={() => dispatch({ type: 'clearChecked' })} />
        </RNView>
      ) : (
        <Card style={{ gap: 6 }}>
          <Text variant="heading">Nothing on the list yet</Text>
          <Text variant="muted">Add recipes in the Planner and their ingredients show up here. You can add things by hand too.</Text>
        </Card>
      )}

    </ScrollView>
  );
}

function lineCostFor(item: ListItem, ing: Ingredient | undefined, data: PriceData | null, standard: MeasureStandard) {
  const density = ing?.density ?? null;
  return costLine(item.name, needFor(item.quantity, item.unit, { standard, density }), data, ing?.pricePick, {
    produce: item.aisle === 'produce',
    density,
  });
}

function Row({
  item,
  staple,
  amount,
  editing,
  onEdit,
  cost,
  ingredient,
  standard,
  data,
  priceOpen,
  onTogglePrice,
}: {
  item: ListItem;
  staple: boolean;
  amount: string;
  editing: boolean;
  onEdit: () => void;
  cost: LineCost;
  ingredient: Ingredient | undefined;
  standard: MeasureStandard;
  data: PriceData | null;
  priceOpen: boolean;
  onTogglePrice: () => void;
}) {
  const { dispatch } = useStore();
  const c = useTheme();
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.quantity == null ? '' : String(Math.round(item.quantity * 100) / 100));
  const [unit, setUnit] = useState(item.unit ?? '');

  return (
    <RNView style={[styles.item, { borderBottomColor: c.border }]}>
      <RNView style={styles.itemRow}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.name}
          onPress={() => dispatch({ type: 'toggleItem', id: item.id })}
          hitSlop={10}
          style={[styles.check, { borderColor: c.accent, backgroundColor: item.checked ? c.accent : 'transparent' }]}>
          {item.checked ? <Text style={{ color: c.onTint, fontSize: 14 }}>✓</Text> : null}
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={onEdit}>
          <Text style={item.checked ? { textDecorationLine: 'line-through', color: c.textMuted } : undefined}>
            {amount ? <Text style={{ fontWeight: '600' }}>{amount} </Text> : null}
            {item.name}
          </Text>
          {staple ? <Text variant="muted" style={{ color: c.accent }}>Pantry staple: check the cupboard first</Text> : null}
          {item.sources.length ? <Text variant="muted">{item.sources.join(', ')}</Text> : null}
        </Pressable>
      </RNView>
      {cost.woolies || cost.coles || priceOpen ? (
        <RNView style={styles.priceIndent}>
          <PriceLine
            cost={cost}
            open={priceOpen}
            onToggle={onTogglePrice}
            onPickStore={(store) => dispatch({ type: 'pickStore', id: item.id, store })}
          />
        </RNView>
      ) : null}
      {priceOpen ? (
        <PricePanel
          name={item.name}
          need={needFor(item.quantity, item.unit, { standard, density: ingredient?.density })}
          density={ingredient?.density}
          produce={item.aisle === 'produce'}
          cost={cost}
          data={data}
          hasPick={!!ingredient?.pricePick}
          onPickProduct={(store, product) => dispatch({ type: 'pickProduct', id: item.id, store, product })}
          onPickStore={(store) => dispatch({ type: 'pickStore', id: item.id, store })}
          onReset={() => dispatch({ type: 'clearPricePick', id: item.id })}
        />
      ) : null}
      {editing ? (
        <RNView style={styles.gap}>
          <RNView style={styles.row}>
            <TextInput value={qty} onChangeText={setQty} placeholder="Amount" style={{ width: 90 }} />
            <TextInput value={unit} onChangeText={setUnit} placeholder="Unit" style={{ width: 80 }} />
            <TextInput value={name} onChangeText={setName} placeholder="Item" style={{ flex: 1, minWidth: 120 }} />
          </RNView>
          <RNView style={styles.gap}>
            <Text variant="label">AISLE</Text>
            <RNView style={styles.row}>
              {AISLE_ORDER.map((a) => (
                <Chip
                  key={a}
                  small
                  role="radio"
                  label={AISLE_LABELS[a]}
                  selected={item.aisle === a}
                  onPress={() => dispatch({ type: 'setItemAisle', id: item.id, aisle: a })}
                />
              ))}
            </RNView>
            <Text variant="muted">Moves it straight away. Next time it’s on a list it goes here too.</Text>
          </RNView>
          <RNView style={styles.row}>
            <Button
              title="Save"
              onPress={() => {
                dispatch({
                  type: 'editItem',
                  id: item.id,
                  patch: { name: name.trim() || item.name, quantity: parseQuantity(qty), unit: unit.trim() || null },
                });
                onEdit();
              }}
            />
            <Button title="Delete" kind="secondary" onPress={() => dispatch({ type: 'deleteItem', id: item.id })} />
          </RNView>
        </RNView>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  aisleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  priceIndent: { paddingLeft: 40 },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
