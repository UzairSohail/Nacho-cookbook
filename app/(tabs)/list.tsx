import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View as RNView } from 'react-native';

import { PricePanel, PriceSummary, PriceTag } from '@/components/ShoppingPrices';
import {
  Button,
  Card,
  Check,
  Chip,
  IconButton,
  ScreenHeader,
  Segmented,
  TAB_BAR_SPACE,
  Tag,
  Text,
  TextInput,
  useTheme,
} from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
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
import { aiPlanFor, askShopAi, forgetShopAi, linesToAsk, useShopAi, type ShopAiState } from '@/src/prices/shopAi';
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
  const shopAi = useShopAi();

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
      m.set(item.id, lineCostFor(item, ing, prices.data, standard, shopAi));
    }
    return m;
  }, [state.list, ingredientOf, prices.data, standard, shopAi]);
  const totals = totalsFor(state.list.filter((i) => !isStaple(i)).map((i) => costs.get(i.id)!));
  const stapleCount = state.list.filter(isStaple).length;
  // Gemini is asked about what's to be bought: not staples, which are checked in the cupboard first.
  const toBuy = state.list.filter((i) => !isStaple(i));
  const aiStale = linesToAsk(shopAi, toBuy).length;
  const aiAnswered = toBuy.length - aiStale;
  const nameOf = (id: string) => state.list.find((i) => i.id === id)?.name ?? 'another item';

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        eyebrow={rangeText}
        title="Shopping"
        right={
          state.list.length ? (
            <Button
              title="Share"
              icon="share"
              kind="secondary"
              small
              style={{ backgroundColor: c.card, borderColor: c.border, minHeight: 44 }}
              onPress={share}
            />
          ) : null
        }
      />

      <RNView style={styles.body}>
        <Card tone="ink" style={styles.planCard}>
          <Segmented
            onInk
            accessibilityLabel="Which plan"
            options={[['this', `This ${name}`], ['next', `Next ${name}`]] as const}
            value={choice}
            onChange={(r) => {
              setChoice(r);
              setNote(null);
            }}
          />
          {state.list.length ? (
            <RNView style={{ gap: 8 }}>
              <RNView style={styles.spread}>
                <Text variant="heading" style={{ color: c.onInk }} accessibilityLiveRegion="polite">
                  {tickedCount === state.list.length ? 'All ticked off!' : `${tickedCount} of ${state.list.length} ticked off`}
                </Text>
                <Text style={{ fontSize: 13, color: c.inkMuted }}>
                  {state.list.length - tickedCount ? `${state.list.length - tickedCount} to get` : 'Nice work'}
                </Text>
              </RNView>
              <RNView style={[styles.progress, { backgroundColor: c.inkSunken }]}>
                <RNView
                  style={[styles.progressFill, { backgroundColor: c.accent, width: `${(tickedCount / state.list.length) * 100}%` }]}
                />
              </RNView>
            </RNView>
          ) : (
            <Text variant="heading" style={{ color: c.onInk }}>Make a list from the plan</Text>
          )}
          <Button title={state.list.length ? 'Update from plan' : 'Generate list'} icon="refresh" onPress={generate} />
          {note ? <Text style={{ color: c.onInk, fontFamily: Fonts.bodyBold, fontSize: 14 }}>{note}</Text> : null}
          <Text style={{ fontSize: 13, lineHeight: 18, color: c.inkMuted }}>
            {state.list.length
              ? 'Adding recipes in the Planner updates the list for you. Anything you added or changed by hand is kept.'
              : 'Adding recipes in the Planner updates the list for you.'}
          </Text>
        </Card>

        {state.list.length ? (
          <PriceSummary totals={totals} status={prices.status} updated={prices.data?.updated ?? null} staples={stapleCount}
            onUseCheapest={() => dispatch({ type: 'useCheapestStores' })}
            ai={{
              answered: aiAnswered,
              stale: aiStale,
              busy: shopAi.busy,
              error: shopAi.error,
              canAsk: !!prices.data && toBuy.length > 0,
              onAsk: () => {
                if (prices.data) askShopAi(toBuy, prices.data, (i) => amount(i.quantity, i.unit));
              },
              onForget: forgetShopAi,
            }}
          />
        ) : null}

        <RNView style={[styles.row, { flexWrap: 'nowrap' }]}>
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Add an item"
            accessibilityLabel="Add an item"
            style={{ flex: 1, minWidth: 0, borderRadius: 16 }}
            returnKeyType="done"
            onSubmitEditing={addItem}
          />
          <IconButton icon="add" tone="ink" size={50} label="Add item" onPress={addItem} />
        </RNView>

        {aisles.map((aisle) => {
          const items = inAisle(aisle);
          const left = items.filter((i) => !i.checked).length;
          return (
            <RNView key={aisle} style={styles.aisle}>
              <RNView style={[styles.spread, { paddingHorizontal: 4 }]}>
                <Text variant="subheading" style={{ fontSize: 19 }} accessibilityRole="header">{AISLE_LABELS[aisle]}</Text>
                <Text variant="muted" style={[styles.small, left === 0 ? { color: c.accent, fontFamily: Fonts.bodyBold } : undefined]}>
                  {left === 0 ? 'All done' : `${left} to get`}
                </Text>
              </RNView>
              <Card style={{ paddingVertical: 0, paddingHorizontal: 14, borderRadius: 20 }}>
                {items.map((item, i) => (
                  <Row
                    key={item.id}
                    item={item}
                    last={i === items.length - 1}
                    staple={isStaple(item)}
                    amount={amount(item.quantity, item.unit)}
                    editing={editingId === item.id}
                    onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                    cost={costs.get(item.id)!}
                    ingredient={ingredientOf(item)}
                    standard={standard}
                    data={prices.data}
                    coveredByName={costs.get(item.id)?.coveredBy ? nameOf(costs.get(item.id)!.coveredBy!) : null}
                    priceOpen={priceOpenId === item.id}
                    showPrice={!isStaple(item) || !!costs.get(item.id)?.chosen}
                    onTogglePrice={() => setPriceOpenId(priceOpenId === item.id ? null : item.id)}
                  />
                ))}
              </Card>
            </RNView>
          );
        })}

        {state.list.length ? (
          tickedCount ? (
            <Button title="Clear ticked items" kind="secondary" style={{ marginTop: 8 }} onPress={() => dispatch({ type: 'clearChecked' })} />
          ) : null
        ) : (
          <Card style={{ gap: 6 }}>
            <Text variant="subheading">Nothing on the list yet</Text>
            <Text variant="muted">Add recipes in the Planner and their ingredients show up here. You can add things by hand too.</Text>
          </Card>
        )}
      </RNView>
    </ScrollView>
  );
}

function lineCostFor(
  item: ListItem,
  ing: Ingredient | undefined,
  data: PriceData | null,
  standard: MeasureStandard,
  shopAi: ShopAiState,
) {
  const density = ing?.density ?? null;
  return costLine(item.name, needFor(item.quantity, item.unit, { standard, density }), data, ing?.pricePick, {
    produce: item.aisle === 'produce',
    density,
    ai: aiPlanFor(shopAi, item),
  });
}

function Row({
  item,
  last,
  showPrice,
  staple,
  amount,
  editing,
  onEdit,
  cost,
  ingredient,
  standard,
  data,
  coveredByName,
  priceOpen,
  onTogglePrice,
}: {
  item: ListItem;
  last: boolean;
  showPrice: boolean;
  staple: boolean;
  amount: string;
  editing: boolean;
  onEdit: () => void;
  cost: LineCost;
  ingredient: Ingredient | undefined;
  standard: MeasureStandard;
  data: PriceData | null;
  coveredByName: string | null;
  priceOpen: boolean;
  onTogglePrice: () => void;
}) {
  const { dispatch } = useStore();
  const c = useTheme();
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.quantity == null ? '' : String(Math.round(item.quantity * 100) / 100));
  const [unit, setUnit] = useState(item.unit ?? '');

  return (
    <RNView style={[styles.item, { borderBottomColor: c.sunken, borderBottomWidth: last ? 0 : 1 }]}>
      <RNView style={styles.itemRow}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.name}
          onPress={() => dispatch({ type: 'toggleItem', id: item.id })}
          hitSlop={10}>
          <Check checked={item.checked} />
        </Pressable>
        <Pressable style={styles.itemText} onPress={onEdit} accessibilityHint="Edit this item">
          <Text style={[{ fontSize: 15 }, item.checked ? { textDecorationLine: 'line-through', color: c.textFaint } : undefined]}>
            {amount ? <Text style={{ fontFamily: Fonts.bodyBold }}>{amount} </Text> : null}
            {item.name}
          </Text>
          {staple && !item.checked ? (
            <RNView style={{ marginVertical: 2 }}>
              <Tag label="Staple · check the cupboard" tone="accent" />
            </RNView>
          ) : null}
          {item.sources.length ? (
            <Text variant="muted" style={[styles.small, { fontSize: 12, lineHeight: 16 }, item.checked && { color: c.textFaint }]} numberOfLines={editing ? undefined : 1}>
              {item.sources.join(', ')}
            </Text>
          ) : null}
          {cost.coveredBy ? (
            <Text variant="muted" style={styles.small}>
              ✨ Bought with {coveredByName ?? 'another item'}
              {cost.aiBuy ? ` (${cost.aiBuy})` : ''}
            </Text>
          ) : cost.aiBuy ? (
            <Text variant="muted" style={styles.small}>
              ✨ Buy {cost.aiBuy}
            </Text>
          ) : null}
        </Pressable>
        {showPrice ? <PriceTag cost={cost} open={priceOpen} onToggle={onTogglePrice} /> : null}
      </RNView>
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
            <TextInput value={qty} onChangeText={setQty} placeholder="Amount" tone="sunken" style={{ width: 90 }} />
            <TextInput value={unit} onChangeText={setUnit} placeholder="Unit" tone="sunken" style={{ width: 80 }} />
            <TextInput value={name} onChangeText={setName} placeholder="Item" tone="sunken" style={{ flex: 1, minWidth: 120 }} />
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
              small
              onPress={() => {
                dispatch({
                  type: 'editItem',
                  id: item.id,
                  patch: { name: name.trim() || item.name, quantity: parseQuantity(qty), unit: unit.trim() || null },
                });
                onEdit();
              }}
            />
            <Button title="Delete" small kind="secondary" icon="delete" onPress={() => dispatch({ type: 'deleteItem', id: item.id })} />
          </RNView>
        </RNView>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: TAB_BAR_SPACE + 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  planCard: { gap: 14, padding: 18, borderRadius: 24 },
  aisle: { gap: 8, marginTop: 10 },
  gap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  item: { paddingVertical: 12, gap: 10, minHeight: 64, justifyContent: 'center' },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  small: { fontSize: 13, lineHeight: 18 },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
