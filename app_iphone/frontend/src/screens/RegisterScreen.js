import React, { useMemo, useState } from 'react';
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
  Image,
  useWindowDimensions,
} from 'react-native';
import { register } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ErrorBanner from '../components/ErrorBanner';

function validateName(value) {
  if (!value.trim()) return 'Nome é obrigatório';
  if (value.trim().length < 2) return 'Nome deve ter pelo menos 2 caracteres';
  return null;
}

function validateEmail(value) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!value.trim()) return 'E-mail é obrigatório';
  if (!emailRegex.test(value.trim())) return 'Digite um e-mail válido';
  return null;
}

function validatePassword(value) {
  if (!value) return 'Senha é obrigatória';
  if (value.length < 8) return 'A senha deve ter pelo menos 8 caracteres';
  return null;
}

function getApiErrorMessage(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code || error?.response?.data?.detail;
  if (status === 409 || code === 'EMAIL_ALREADY_EXISTS') return 'Este e-mail já está cadastrado';
  if (status === 422) return 'Verifique os dados informados e tente novamente';
  if (!error?.response) return 'Sem conexão com o servidor. Verifique sua internet';
  return 'Erro ao criar conta. Tente novamente';
}

export default function RegisterScreen({ navigation }) {
  const { login: authLogin } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * 0.35, 130);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ name: null, email: null, password: null });
  const [apiError, setApiError] = useState(null);
  const [rawError, setRawError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const validateAll = () => {
    const newErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  };

  const handleFieldBlur = field => {
    const validators = { name: validateName, email: validateEmail, password: validatePassword };
    const values = { name, email, password };
    setErrors(prev => ({ ...prev, [field]: validators[field](values[field]) }));
  };

  const handleSubmit = async () => {
    setApiError(null);
    setRawError(null);
    if (!validateAll()) return;
    setIsLoading(true);
    try {
      const data = await register({ name: name.trim(), email: email.trim().toLowerCase(), password });
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
      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Image
          source={isDark ? require('../../assets/icon-tema-claro.png') : require('../../assets/icon-tema-escuro.png')}
          style={{ width: 26, height: 26, tintColor: theme.textSecondary }}
        />
      </TouchableOpacity>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: logoSize, height: logoSize, resizeMode: 'contain', alignSelf: 'center', marginBottom: 24, tintColor: isDark ? undefined : '#1A1A2E' }}
            accessibilityLabel="Logo Quase Nada"
          />

          <View style={styles.header}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>Bem-vindo ao Quase Nada Lembretes</Text>
          </View>

          <ErrorBanner message={apiError} error={rawError} />

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="Seu nome"
              placeholderTextColor={theme.textPlaceholder}
              value={name}
              onChangeText={text => { setName(text); if (errors.name) setErrors(prev => ({ ...prev, name: validateName(text) })); }}
              onBlur={() => handleFieldBlur('name')}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="seu@email.com"
              placeholderTextColor={theme.textPlaceholder}
              value={email}
              onChangeText={text => { setEmail(text); if (errors.email) setErrors(prev => ({ ...prev, email: validateEmail(text) })); }}
              onBlur={() => handleFieldBlur('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.textPlaceholder}
              value={password}
              onChangeText={text => { setPassword(text); if (errors.password) setErrors(prev => ({ ...prev, password: validatePassword(text) })); }}
              onBlur={() => handleFieldBlur('password')}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
            />
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Criar conta"
            accessibilityState={{ disabled: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Criar conta</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Já tenho conta </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.footerLink}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    themeToggle: {
      position: 'absolute',
      top: 56,
      right: 24,
      zIndex: 10,
    },
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 48,
      paddingBottom: 32,
      justifyContent: 'center',
    },
    header: { marginBottom: 40 },
    title: { fontSize: 32, fontWeight: '700', color: theme.textPrimary, marginBottom: 8, fontFamily: 'System' },
    subtitle: { fontSize: 16, color: theme.textSecondary, fontFamily: 'System' },
    fieldContainer: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, fontFamily: 'System' },
    input: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.textPrimary,
      fontFamily: 'System',
      minHeight: 50,
    },
    inputError: { borderColor: theme.error },
    fieldError: { color: theme.error, fontSize: 12, marginTop: 6, marginLeft: 4, fontFamily: 'System' },
    button: {
      backgroundColor: theme.primary,
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
    footerText: { color: theme.textSecondary, fontSize: 15, fontFamily: 'System' },
    footerLink: { color: theme.primaryLight, fontSize: 15, fontWeight: '600', fontFamily: 'System' },
  });
}
