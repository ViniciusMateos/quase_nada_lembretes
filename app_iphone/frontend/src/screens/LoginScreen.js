/**
 * Tela de login.
 * Estados: loading, erro (401 específico), validação inline.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { login as apiLogin } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import ErrorBanner from '../components/ErrorBanner';

const COLORS = {
  background: '#0A0A0F',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  error: '#EF4444',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textPlaceholder: '#475569',
  border: '#334155',
};

function getApiErrorMessage(error) {
  const status = error?.response?.status;

  if (status === 401) {
    return 'E-mail ou senha incorretos';
  }
  if (status === 422) {
    return 'Verifique os dados informados e tente novamente';
  }
  if (!error?.response) {
    return 'Sem conexão com o servidor. Verifique sua internet';
  }
  return 'Erro ao entrar. Tente novamente';
}

export default function LoginScreen({ navigation }) {
  const { login: authLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiError, setApiError] = useState(null);
  const [rawError, setRawError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  const validateForm = () => {
    let valid = true;

    if (!email.trim()) {
      setEmailError('E-mail é obrigatório');
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError('Senha é obrigatória');
      valid = false;
    } else {
      setPasswordError(null);
    }

    return valid;
  };

  const handleSubmit = async () => {
    setApiError(null);
    setRawError(null);
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const data = await apiLogin({
        email: email.trim().toLowerCase(),
        password,
      });
      authLogin(data.access_token, data.user);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
      setRawError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Entrar</Text>
            <Text style={styles.subtitle}>Acesse sua conta</Text>
          </View>

          <ErrorBanner message={apiError} error={rawError} />

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              placeholder="seu@email.com"
              placeholderTextColor={COLORS.textPlaceholder}
              value={email}
              onChangeText={text => {
                setEmail(text);
                if (emailError && text.trim()) setEmailError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="Sua senha"
              placeholderTextColor={COLORS.textPlaceholder}
              value={password}
              onChangeText={text => {
                setPassword(text);
                if (passwordError && text) setPasswordError(null);
              }}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
            />
            {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Entrar"
            accessibilityState={{ disabled: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Não tenho conta </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              disabled={isLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.footerLink}>Criar conta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  header: { marginBottom: 40 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: 'System',
  },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, fontFamily: 'System' },
  apiErrorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  apiErrorText: { color: COLORS.error, fontSize: 14, fontFamily: 'System', lineHeight: 20 },
  fieldContainer: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontFamily: 'System',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    fontFamily: 'System',
    minHeight: 50,
  },
  inputError: { borderColor: COLORS.error },
  fieldError: { color: COLORS.error, fontSize: 12, marginTop: 6, marginLeft: 4, fontFamily: 'System' },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', fontFamily: 'System' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  footerText: { color: COLORS.textSecondary, fontSize: 15, fontFamily: 'System' },
  footerLink: { color: COLORS.primaryLight, fontSize: 15, fontWeight: '600', fontFamily: 'System' },
});
