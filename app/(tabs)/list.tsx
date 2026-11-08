import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import {
  addDays,
  AISLE_ORDER,
  formatAmount,
  fortnightDates,
  listToText,
  parseQuantity,
  type DateRange,
  type ListItem,
} from '@/src/core';
import { useStore } from '@/src/state/store';

type RangeChoice = 'fortnight' | 'week1' | 'week2';

export default function ShoppingListScreen() {
  const { state, dispatch } = useStore();
  const c = useTheme();
  const { system, standard } = state.settings;
  const [choice, setChoice] = useState<RangeChoice>('fortnight');
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const days = fortnightDates(new Date().toISOString().slice(0, 10));
  const ranges: Record<RangeChoice, DateRange> = {
    fortnight: { start: days[0], end: days[13] },
    week1: { start: days[0], end: days[6] },
    week2: { start: days[7], end: addDays(days[7], 6) },
  };

  const amount = (q: number | null, unit: string | null) => {
    if (q == null) return '';
    const a = formatAmount(q, unit, system, { standard });
    return `${a.quantity}${a.unit ? ` ${a.unit}` : ''}`;
  };

  const share = () => {
    Share.share({ message: listToText(state.list, (q, u) => amount(q, u)) }).catch(() => {});
  };

  const aisles = AISLE_ORDER.filter((a) => state.list.some((i) => i.aisle === a));
  // Generated lines are keyed "<ingredient id>|<kind>", so staples can be flagged without storing anything extra.
  const staples = new Set(state.pantry);
  const isStaple = (item: ListItem) => !!item.key && staples.has(item.key.split('|')[0]);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Card style={styles.gap}>
        <Text variant="label">MAKE A LIST FROM THE PLAN</Text>
        <RNView style={styles.row}>
          {(['fortnight', 'week1', 'week2'] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => setChoice(r)}
              style={[styles.chip, { borderColor: c.tint, backgroundColor: choice === r ? c.tint : 'transparent' }]}>
              <Text style={{ color: choice === r ? c.onTint : c.tint, fontSize: 14 }}>
                {r === 'fortnight' ? 'Whole fortnight' : r === 'week1' ? 'Week 1' : 'Week 2'}
              </Text>
            </Pressable>
          ))}
        </RNView>
        <Button
          title={state.list.length ? 'Update from plan' : 'Generate list'}
          onPress={() => dispatch({ type: 'generateList', range: ranges[choice] })}
        />
        <Text variant="muted">Updating keeps anything you added or changed by hand.</Text>
      </Card>

      <RNView style={styles.row}>
        <TextInput
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Add an item"
          accessibilityLabel="Add an item"
          style={{ flex: 1 }}
          onSubmitEditing={() => {
            dispatch({ type: 'addItem', name: newItem });
            setNewItem('');
          }}
        />
        <Button
          title="Add"
          onPress={() => {
            dispatch({ type: 'addItem', name: newItem });
            setNewItem('');
          }}
        />
      </RNView>

      {aisles.map((aisle) => (
        <RNView key={aisle} style={styles.gap}>
          <Text variant="label">{aisle.toUpperCase()}</Text>
          <Card style={{ paddingVertical: 4 }}>
            {state.list
              .filter((i) => i.aisle === aisle)
              .map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  staple={isStaple(item)}
                  amount={amount(item.quantity, item.unit)}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                />
              ))}
          </Card>
        </RNView>
      ))}

      {state.list.length ? (
        <RNView style={styles.row}>
          <Button title="Share list" onPress={share} />
          <Button title="Clear ticked" kind="secondary" onPress={() => dispatch({ type: 'clearChecked' })} />
        </RNView>
      ) : (
        <Text variant="muted">Your list is empty. Plan some meals, then generate a list.</Text>
      )}

    </ScrollView>
  );
}

function Row({
  item,
  staple,
  amount,
  editing,
  onEdit,
}: {
  item: ListItem;
  staple: boolean;
  amount: string;
  editing: boolean;
  onEdit: () => void;
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
          style={[styles.check, { borderColor: c.accent, backgroundColor: item.checked ? c.accent : 'transparent' }]}>
          {item.checked ? <Text style={{ color: c.onTint, fontSize: 14 }}>✓</Text> : null}
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={onEdit}>
          <Text style={item.checked ? { textDecorationLine: 'line-through', color: c.textMuted } : undefined}>
            {amount ? <Text style={{ fontWeight: '600' }}>{amount} </Text> : null}
            {item.name}
          </Text>
          {item.sources.length || staple ? (
            <Text variant="muted">
              {staple ? <Text style={{ color: c.accent }}>Pantry staple, check the cupboard</Text> : null}
              {staple && item.sources.length ? ' · ' : ''}
              {item.sources.join(', ')}
            </Text>
          ) : null}
        </Pressable>
      </RNView>
      {editing ? (
        <RNView style={styles.gap}>
          <RNView style={styles.row}>
            <TextInput value={qty} onChangeText={setQty} placeholder="Amount" style={{ width: 90 }} />
            <TextInput value={unit} onChangeText={setUnit} placeholder="Unit" style={{ width: 80 }} />
            <TextInput value={name} onChangeText={setName} placeholder="Item" style={{ flex: 1, minWidth: 120 }} />
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
  chip: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
