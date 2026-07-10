import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login as apiLogin } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingDog from '../components/LoadingDog';
import PasswordVisibilityIcon from '../components/PasswordVisibilityIcon';
import PressableScale from '../components/PressableScale';

const DEFAULT_AVATAR_COLOR = '#0A84FF';

const removeEmoji = str =>
  str.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|\u{FE0F}|\u{200D}/gu,
    '',
  );

function getApiErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 401) return 'Senha incorreta';
  if (!error?.response) return 'Sem conexão com o servidor';
  return 'Erro ao entrar. Tente novamente';
}

function AccountCard({ account, onPress, onRemove, theme, styles }) {
  const avatarColor = account.color || DEFAULT_AVATAR_COLOR;
  return (
    <PressableScale style={styles.card} onPress={() => onPress(account)}>
      <View style={[styles.cardAvatar, { backgroundColor: avatarColor }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.cardAvatarLogo}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{account.name}</Text>
        <Text style={styles.cardEmail} numberOfLines={1}>{account.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.cardRemove}
        onPress={() => onRemove(account.email)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.cardRemoveText}>✕</Text>
      </TouchableOpacity>
    </PressableScale>
  );
}

export default function AccountHubScreen({ navigation }) {
  const { savedAccounts, removeSavedAccount, login: authLogin } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * 0.28, 100);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [rawError, setRawError] = useState(null);
  const [removeConfirmEmail, setRemoveConfirmEmail] = useState(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(320)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  const closeModalRef = useRef(null);

  const openModal = (account) => {
    setSelectedAccount(account);
    setPassword('');
    setLoginError(null);
    setRawError(null);
    setShowPassword(false);
    sheetTranslateY.setValue(320);
    overlayOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
    ]).start();
  };

  const closeModal = () => {
    Keyboard.dismiss();
    keyboardOffset.setValue(0);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 320, duration: 200, useNativeDriver: true }),
    ]).start(() => setSelectedAccount(null));
  };

  closeModalRef.current = closeModal;

  useEffect(() => {
    if (!selectedAccount) return;
    const show = Keyboard.addListener('keyboardWillShow', e => {
      Animated.timing(keyboardOffset, {
        toValue: -e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [selectedAccount, keyboardOffset]);

  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && gs.vy >= 0,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          sheetTranslateY.setValue(gs.dy);
          overlayOpacity.setValue(Math.max(0, 1 - gs.dy / 300));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          closeModalRef.current?.();
        } else {
          Animated.parallel([
            Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
            Animated.timing(overlayOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const handleQuickLogin = async () => {
    if (!password) { setLoginError('Digite sua senha'); return; }
    setIsLoading(true);
    setLoginError(null);
    setRawError(null);
    try {
      const data = await apiLogin({ email: selectedAccount.email, password });
      authLogin(data.access_token, data.user, data.refresh_token);
    } catch (error) {
      setLoginError(getApiErrorMessage(error));
      setRawError(error);
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: logoSize, height: logoSize, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20, tintColor: isDark ? undefined : '#1A1A2E' }}
          accessibilityLabel="Logo Quase Nada"
        />

        {savedAccounts.length > 0 ? (
          <>
            <Text style={styles.title}>Bem-vindo de volta</Text>
            <Text style={styles.subtitle}>Escolha uma conta para continuar</Text>

            <View style={styles.accountList}>
              {savedAccounts.map(account => (
                <AccountCard
                  key={account.email}
                  account={account}
                  onPress={openModal}
                  onRemove={(email) => setRemoveConfirmEmail(email)}
                  theme={theme}
                  styles={styles}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Olá!</Text>
            <Text style={styles.subtitle}>Entre para começar a usar seus lembretes</Text>
          </>
        )}

        <PressableScale
          style={styles.otherAccountBtn}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.otherAccountText}>
            {savedAccounts.length > 0 ? '+ Entrar com outra conta' : 'Fazer login'}
          </Text>
        </PressableScale>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Não tem conta? </Text>
          <PressableScale onPress={() => navigation.navigate('Register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.registerLink}>Criar conta</Text>
          </PressableScale>
        </View>
      </ScrollView>

      {/* Quick-login modal */}
      <Modal
        visible={!!selectedAccount}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: Animated.add(sheetTranslateY, keyboardOffset) }] }]}>
            <View style={styles.sheetHandle} {...sheetPanResponder.panHandlers}>
              <View style={styles.handle} />
            </View>
            <View style={styles.sheetContent}>
                <View style={[styles.sheetAvatar, { backgroundColor: selectedAccount?.color || DEFAULT_AVATAR_COLOR }]}>
                  <Image
                    source={require('../../assets/logo.png')}
                    style={styles.sheetAvatarLogo}
                  />
                </View>
                <Text style={styles.sheetName}>{selectedAccount?.name}</Text>
                <Text style={styles.sheetEmail}>{selectedAccount?.email}</Text>

                <ErrorBanner message={loginError} error={rawError} />

                <View style={[styles.inputWrapper, loginError && styles.inputError]}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Sua senha"
                    placeholderTextColor={theme.textPlaceholder}
                    value={password}
                    onChangeText={text => {
                      const clean = removeEmoji(text);
                      setPassword(clean);
                      if (loginError) setLoginError(null);
                    }}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleQuickLogin}
                    autoFocus
                    editable={!isLoading}
                  />
                  <PressableScale
                    onPress={() => setShowPassword(p => !p)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingRight: 14 }}
                  >
                    <PasswordVisibilityIcon hidden={showPassword} color={theme.textPlaceholder} />
                  </PressableScale>
                </View>

                <PressableScale
                  style={[styles.sheetBtn, isLoading && { opacity: 0.6 }]}
                  onPress={handleQuickLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <LoadingDog size={28} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.sheetBtnText}>Entrar</Text>
                  )}
                </PressableScale>
              </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <ConfirmDialog
        visible={!!removeConfirmEmail}
        title="Remover conta"
        message={`Remover "${removeConfirmEmail}" da lista de contas? Você pode entrar novamente depois.`}
        confirmText="Remover"
        destructive
        onCancel={() => setRemoveConfirmEmail(null)}
        onConfirm={() => {
          removeSavedAccount(removeConfirmEmail);
          setRemoveConfirmEmail(null);
        }}
      />

      {/* Rendered after ScrollView/Modal so it's on top in web's stacking order */}
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
    themeToggle: {
      position: 'absolute',
      top: topOffset,
      right: 24,
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
      paddingTop: 56,
      paddingBottom: 40,
      justifyContent: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 6,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
      marginBottom: 32,
    },
    accountList: { gap: 10, marginBottom: 24 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    cardAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardAvatarLogo: {
      width: 26,
      height: 26,
      resizeMode: 'contain',
      tintColor: '#FFFFFF',
    },
    cardInfo: { flex: 1 },
    cardName: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 2,
    },
    cardEmail: {
      fontSize: 13,
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    cardRemove: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardRemoveText: {
      fontSize: 14,
      color: theme.textPlaceholder,
      fontFamily: 'System',
    },
    otherAccountBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      marginBottom: 20,
    },
    otherAccountText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.primary,
      fontFamily: 'System',
    },
    registerRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    registerText: { color: theme.textSecondary, fontSize: 14, fontFamily: 'System' },
    registerLink: { color: theme.primaryLight, fontSize: 14, fontWeight: '600', fontFamily: 'System' },
    // Modal styles
    overlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
    },
    sheetHandle: { paddingTop: 12, paddingBottom: 4, alignItems: 'center', paddingHorizontal: 60 },
    handle: { width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2 },
    sheetContent: {
      paddingHorizontal: 24,
      paddingBottom: 40,
      paddingTop: 8,
    },
    sheetAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      marginTop: 8,
      alignSelf: 'center',
    },
    sheetAvatarLogo: {
      width: 38,
      height: 38,
      resizeMode: 'contain',
      tintColor: '#FFFFFF',
    },
    sheetName: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 4,
      textAlign: 'center',
    },
    sheetEmail: {
      fontSize: 14,
      color: theme.textSecondary,
      fontFamily: 'System',
      marginBottom: 20,
      textAlign: 'center',
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      minHeight: 50,
      marginBottom: 16,
    },
    inputInner: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    inputError: { borderColor: theme.error },
    sheetBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    sheetBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'System',
    },
  });
}
