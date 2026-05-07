import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
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
import ChevronIcon from '../components/ChevronIcon';
import LoadingDog from '../components/LoadingDog';
import PasswordVisibilityIcon from '../components/PasswordVisibilityIcon';
import PressableScale from '../components/PressableScale';

const removeEmoji = str =>
  str.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|\u{FE0F}|\u{200D}/gu,
    '',
  );

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
  const [showPassword, setShowPassword] = useState(false);
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
      authLogin(data.access_token, data.user, data.refresh_token);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
      setRawError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
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
            <View style={[styles.inputWrapper, errors.password && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={theme.textPlaceholder}
                value={password}
                onChangeText={text => { const clean = removeEmoji(text); setPassword(clean); if (errors.password) setErrors(prev => ({ ...prev, password: validatePassword(clean) })); }}
                onBlur={() => handleFieldBlur('password')}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <PasswordVisibilityIcon hidden={showPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          <PressableScale
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Criar conta"
            accessibilityState={{ disabled: isLoading }}
          >
            {isLoading ? (
              <LoadingDog size={28} color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Criar conta</Text>
            )}
          </PressableScale>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Já tenho conta </Text>
            <PressableScale onPress={() => navigation.navigate('Login')} disabled={isLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.footerLink}>Entrar</Text>
            </PressableScale>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {navigation.canGoBack() && (
        <PressableScale
          style={styles.backBtn}
          contentStyle={styles.iconButtonContent}
          applyStyleToRoot
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronIcon color={theme.textSecondary} size={32} />
        </PressableScale>
      )}
      <PressableScale
        style={styles.themeToggle}
        contentStyle={styles.iconButtonContent}
        applyStyleToRoot
        onPress={toggleTheme}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      >
        <Image
          source={isDark ? require('../../assets/icon-tema-claro.png') : require('../../assets/icon-tema-escuro.png')}
          style={{ width: 26, height: 26, tintColor: theme.textSecondary }}
        />
      </PressableScale>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    themeToggle: {
      position: 'absolute',
      top: 24,
      right: 24,
      width: 44,
      height: 44,
      zIndex: 100,
      elevation: 12,
    },
    backBtn: {
      position: 'absolute',
      top: 24,
      left: 16,
      width: 44,
      height: 44,
      zIndex: 100,
      elevation: 12,
    },
    iconButtonContent: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
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
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      minHeight: 50,
    },
    inputInner: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    eyeButton: { paddingRight: 14 },
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
