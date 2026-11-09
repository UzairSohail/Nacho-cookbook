import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { useAuth } from '@/src/backend/auth';

/** Shown after opening a password reset email: choose a new password. */
export default function ResetPasswordScreen() {
  const { account, updatePassword, cancelPasswordReset, signOut } = useAuth();
  const c = useTheme();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (password.length < 6) return setMessage('Use a password of at least 6 characters.');
    if (password !== again) return setMessage('The two passwords don’t match.');
    setBusy(true);
    setMessage(null);
    const error = await updatePassword(password);
    setBusy(false);
    if (error) setMessage(error);
  };

  // An expired link leaves no sign-in behind, so going back means the sign-in screen.
  const back = async () => {
    if (!account) await signOut();
    cancelPasswordReset();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title" style={styles.brand}>Nacho Cookbook</Text>
        <Card style={styles.card}>
          <Text variant="heading">Choose a new password</Text>
          {account?.email ? <Text variant="muted">For {account.email}</Text> : null}
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            accessibilityLabel="New password"
            secureTextEntry
            autoComplete="new-password"
          />
          <TextInput
            value={again}
            onChangeText={setAgain}
            placeholder="New password again"
            accessibilityLabel="New password again"
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={save}
          />
          {message ? <Text variant="muted" style={{ color: c.tint }}>{message}</Text> : null}
          <Button title={busy ? 'Please wait…' : 'Save new password'} onPress={save} disabled={busy} />
          <RNView style={{ alignItems: 'center' }}>
            <Button kind="secondary" title="Back" onPress={back} disabled={busy} style={{ borderWidth: 0 }} />
          </RNView>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 16, gap: 12, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { textAlign: 'center', fontSize: 34 },
  card: { gap: 12, marginTop: 12 },
});
