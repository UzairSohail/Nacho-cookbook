import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { useAuth } from '@/src/backend/auth';

export default function SignInScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const c = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    if (mode === 'signIn') {
      const error = await signIn(email, password);
      if (error) setMessage(error);
    } else {
      const { error, needsConfirmation } = await signUp(email, password);
      if (error) setMessage(error);
      else if (needsConfirmation) {
        setMessage('Check your email for a confirmation link, then sign in here.');
        setMode('signIn');
      }
    }
    setBusy(false);
  };

  const forgotPassword = async () => {
    setBusy(true);
    setMessage(null);
    const error = await sendPasswordReset(email);
    setMessage(
      error ??
        'If there’s an account for that email, a link to choose a new password is on its way. Open it on this phone, or any device, and it will take you to the web app.',
    );
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title" style={styles.brand}>Nacho Cookbook</Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>Recipes, a fortnight of meals, and one shopping list.</Text>
        <Card style={styles.card}>
          <Text variant="heading">{mode === 'signIn' ? 'Sign in' : 'Create an account'}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            onSubmitEditing={submit}
          />
          {message ? <Text variant="muted" style={{ color: c.tint }}>{message}</Text> : null}
          <Button title={busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy} />
          <RNView style={{ alignItems: 'center' }}>
            {mode === 'signIn' ? (
              <Button
                kind="secondary"
                title="Forgot password?"
                onPress={forgotPassword}
                disabled={busy}
                style={{ borderWidth: 0 }}
              />
            ) : null}
            <Button
              kind="secondary"
              title={mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
              onPress={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                setMessage(null);
              }}
              style={{ borderWidth: 0 }}
            />
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
