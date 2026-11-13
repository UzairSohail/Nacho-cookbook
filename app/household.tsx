import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button, Card, SectionTitle, Text, TextInput, useTheme } from '@/components/Themed';
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
      <Stack.Screen
        options={{
          title: 'Your household',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.background },
        }}
      />
      <Text variant="muted" style={{ fontSize: 15, lineHeight: 22 }}>
        Everything in the app is shared with the people in your household.
      </Text>

      <Card style={styles.card}>
        <SectionTitle icon="home" tone={0} title="Start a household" hint="You’ll get an invite code to share." />
        <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. Our kitchen" accessibilityLabel="Household name" tone="sunken" />
        <Button title="Create household" disabled={busy} onPress={() => run(() => createHousehold(name))} />
      </Card>

      <Card style={styles.card}>
        <SectionTitle icon="people" tone={1} title="Join a household" hint="Ask whoever started it for the invite code in their Settings." />
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Invite code"
          accessibilityLabel="Invite code"
          autoCapitalize="none"
          tone="sunken"
        />
        <Button title="Join" kind="ink" disabled={busy} onPress={() => run(() => joinHousehold(code))} />
      </Card>

      {message ? <Text style={{ color: c.tint }}>{message}</Text> : null}
      <Button title="Sign out" kind="quiet" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { gap: 14 },
});
