import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { Button, Card, IconButton, Text, TextInput, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { useAuth } from '@/src/backend/auth';

export default function SignInScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const c = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        <BrandMark tagline="Recipes, a fortnight of meals, and one shopping list." />
        <Card style={styles.card}>
          <Text variant="heading">{mode === 'signIn' ? 'Welcome back' : 'Create an account'}</Text>
          <RNView style={styles.field}>
            <Text variant="label">EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              tone="sunken"
            />
          </RNView>
          <RNView style={styles.field}>
            <RNView style={styles.spread}>
              <Text variant="label">PASSWORD</Text>
              {mode === 'signIn' ? (
                <Pressable accessibilityRole="button" onPress={forgotPassword} disabled={busy} hitSlop={10}>
                  <Text style={{ color: c.tint, fontFamily: Fonts.bodyBold, fontSize: 13 }}>Forgot?</Text>
                </Pressable>
              ) : null}
            </RNView>
            <RNView style={[styles.password, { backgroundColor: c.sunken }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'signIn' ? 'Your password' : 'Choose a password'}
                accessibilityLabel="Password"
                secureTextEntry={!showPassword}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                onSubmitEditing={submit}
                tone="sunken"
                style={{ flex: 1, minWidth: 0 }}
              />
              <IconButton
                icon={showPassword ? 'hide' : 'show'}
                tone="clear"
                label={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((v) => !v)}
              />
            </RNView>
          </RNView>
          {message ? <Text variant="muted" style={{ color: c.tint }}>{message}</Text> : null}
          <Button title={busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy} />
        </Card>
        <RNView style={styles.divider}>
          <RNView style={[styles.rule, { backgroundColor: c.borderStrong }]} />
          <Text variant="muted" style={{ fontSize: 13 }}>{mode === 'signIn' ? 'New here?' : 'Have an account?'}</Text>
          <RNView style={[styles.rule, { backgroundColor: c.borderStrong }]} />
        </RNView>
        <Button
          kind="secondary"
          title={mode === 'signIn' ? 'Create an account' : 'Sign in instead'}
          onPress={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setMessage(null);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },
  card: { gap: 14, marginTop: 16, borderRadius: 28, padding: 20 },
  field: { gap: 6 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  password: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingRight: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1 },
});
