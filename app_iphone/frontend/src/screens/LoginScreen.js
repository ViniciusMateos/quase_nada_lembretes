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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login as apiLogin } from '../api/auth.api';
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

function getApiErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 401) return 'E-mail ou senha incorretos';
  if (status === 422) return 'Verifique os dados informados e tente novamente';
  if (!error?.response) return 'Sem conexão com o servidor. Verifique sua internet';
  return 'Erro ao entrar. Tente novamente';
}

export default function LoginScreen({ navigation }) {
  const { login: authLogin } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * 0.35, 130);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [rawError, setRawError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const validateForm = () => {
    let valid = true;
    if (!email.trim()) { setEmailError('E-mail é obrigatório'); valid = false; } else setEmailError(null);
    if (!password) { setPasswordError('Senha é obrigatória'); valid = false; } else setPasswordError(null);
    return valid;
  };

  const handleSubmit = async () => {
    setApiError(null);
    setRawError(null);
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const data = await apiLogin({ email: email.trim().toLowerCase(), password });
      authLogin(data.access_token, data.user, data.refresh_token);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
      setRawError(error);
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToAccountHub = () => {
    if (navigation.canGoBack()) {
      navigation.popToTop();
      return;
    }
    navigation.navigate('AccountHub');
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
            <Text style={styles.title}>Entrar</Text>
            <Text style={styles.subtitle}>Acesse sua conta</Text>
          </View>

          <ErrorBanner message={apiError} error={rawError} />

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              placeholder="seu@email.com"
              placeholderTextColor={theme.textPlaceholder}
              value={email}
              onChangeText={text => { setEmail(text); if (emailError && text.trim()) setEmailError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Senha</Text>
            <View style={[styles.inputWrapper, passwordError && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder="Sua senha"
                placeholderTextColor={theme.textPlaceholder}
                value={password}
                onChangeText={text => { const clean = removeEmoji(text); setPassword(clean); if (passwordError && clean) setPasswordError(null); }}
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
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
          </View>

          <PressableScale
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Entrar"
            accessibilityState={{ disabled: isLoading }}
          >
            {isLoading ? (
              <LoadingDog size={28} color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </PressableScale>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Não tenho conta </Text>
            <PressableScale onPress={() => navigation.navigate('Register')} disabled={isLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.footerLink}>Criar conta</Text>
            </PressableScale>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rendered after KAV so they're on top in web's DOM stacking order */}
      <PressableScale
        style={styles.backBtn}
        contentStyle={styles.iconButtonContent}
        applyStyleToRoot
        onPress={handleBackToAccountHub}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar para o hub de contas"
      >
        <ChevronIcon color={theme.textSecondary} size={32} />
      </PressableScale>
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

function makeStyles(theme, insets = { top: 0 }) {
  const topOffset = (insets.top || 0) + 8;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    themeToggle: {
      position: 'absolute',
      top: topOffset,
      right: 24,
      width: 44,
      height: 44,
      zIndex: 100,
      elevation: 12,
    },
    backBtn: {
      position: 'absolute',
      top: topOffset,
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
