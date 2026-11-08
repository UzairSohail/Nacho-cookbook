import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { useAuth } from '@/src/backend/auth';

export default function HouseholdScreen() {
  const { createHousehold, joinHousehold, signOut } = useAuth();
  const c = useTheme();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(await action());
    setBusy(false);
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Your household' }} />
      <Text variant="muted">Everything in the app is shared with the people in your household.</Text>

      <Card style={styles.card}>
        <Text variant="heading">Start a household</Text>
        <Text variant="muted">You’ll get an invite code to share.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. Our kitchen" accessibilityLabel="Household name" />
        <Button title="Create household" disabled={busy} onPress={() => run(() => createHousehold(name))} />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Join a household</Text>
        <Text variant="muted">Ask whoever started it for the invite code in their Settings.</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Invite code"
          accessibilityLabel="Invite code"
          autoCapitalize="none"
        />
        <Button title="Join" kind="secondary" disabled={busy} onPress={() => run(() => joinHousehold(code))} />
      </Card>

      {message ? <Text style={{ color: c.tint }}>{message}</Text> : null}
      <Button title="Sign out" kind="secondary" onPress={signOut} style={{ borderWidth: 0 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { gap: 12 },
});
