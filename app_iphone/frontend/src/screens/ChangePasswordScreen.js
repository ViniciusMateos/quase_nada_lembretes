import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { changePassword } from '../api/auth.api';
import { useTheme } from '../context/ThemeContext';
import PasswordVisibilityIcon from '../components/PasswordVisibilityIcon';
import ChevronIcon from '../components/ChevronIcon';
import LoadingDog from '../components/LoadingDog';
import PressableScale from '../components/PressableScale';
import useKeyboardNudge from '../utils/useKeyboardNudge';
import { useI18n } from '../i18n';

const removeEmoji = str =>
  str.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|\u{FE0F}|\u{200D}/gu,
    '',
  );

export default function ChangePasswordScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const screenTranslateX = useRef(new Animated.Value(0)).current;
  const { scrollRef, scrollProps, nudge } = useKeyboardNudge();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!currentPassword) errs.current = t('auth.changePw.errCurrentRequired');
    if (!newPassword || newPassword.length < 8) errs.new = t('auth.changePw.errNewTooShort');
    if (newPassword !== confirmPassword) errs.confirm = t('auth.changePw.errMismatch');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGoBack = () => {
    Animated.timing(screenTranslateX, {
      toValue: Dimensions.get('window').width,
      duration: 260,
      useNativeDriver: true,
    }).start(() => navigation.goBack());
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      Alert.alert(t('auth.changePw.successTitle'), t('auth.changePw.successMessage'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const code = error?.response?.data?.code;
      if (code === 'INVALID_CURRENT_PASSWORD') {
        setErrors({ current: t('auth.changePw.errCurrentIncorrect') });
      } else {
        Alert.alert(t('auth.changePw.failTitle'), t('auth.changePw.failMessage'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[styles.screen, { transform: [{ translateX: screenTranslateX }] }]}>
        <View style={styles.header}>
          <PressableScale onPress={handleGoBack} hitSlop={{ top: 10, bottom: 10, left: 18, right: 18 }}>
            <ChevronIcon color={theme.primary} size={38} style={styles.backButton} />
          </PressableScale>
          <Text style={styles.headerTitle}>{t('auth.changePw.title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>{t('auth.changePw.currentLabel')}</Text>
            <View style={[styles.inputWrapper, errors.current && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder={t('auth.changePw.currentPlaceholder')}
                placeholderTextColor={theme.textPlaceholder}
                value={currentPassword}
                onChangeText={text => {
                  const clean = removeEmoji(text);
                  setCurrentPassword(clean);
                  if (errors.current) setErrors(e => ({ ...e, current: null }));
                }}
                onFocus={nudge}
                secureTextEntry={!showCurrentPassword}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowCurrentPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showCurrentPassword ? t('auth.a11y.hideCurrentPassword') : t('auth.a11y.showCurrentPassword')}
              >
                <PasswordVisibilityIcon hidden={showCurrentPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.current ? <Text style={styles.fieldError}>{errors.current}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>{t('auth.changePw.newLabel')}</Text>
            <View style={[styles.inputWrapper, errors.new && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder={t('auth.field.min8')}
                placeholderTextColor={theme.textPlaceholder}
                value={newPassword}
                onChangeText={text => {
                  const clean = removeEmoji(text);
                  setNewPassword(clean);
                  if (errors.new) setErrors(e => ({ ...e, new: null }));
                }}
                onFocus={nudge}
                secureTextEntry={!showNewPassword}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowNewPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showNewPassword ? t('auth.a11y.hideNewPassword') : t('auth.a11y.showNewPassword')}
              >
                <PasswordVisibilityIcon hidden={showNewPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.new ? <Text style={styles.fieldError}>{errors.new}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>{t('auth.changePw.confirmLabel')}</Text>
            <View style={[styles.inputWrapper, errors.confirm && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder={t('auth.changePw.confirmPlaceholder')}
                placeholderTextColor={theme.textPlaceholder}
                value={confirmPassword}
                onChangeText={text => {
                  const clean = removeEmoji(text);
                  setConfirmPassword(clean);
                  if (errors.confirm) setErrors(e => ({ ...e, confirm: null }));
                }}
                onFocus={nudge}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowConfirmPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showConfirmPassword ? t('auth.a11y.hideConfirmPassword') : t('auth.a11y.showConfirmPassword')}
              >
                <PasswordVisibilityIcon hidden={showConfirmPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.confirm ? <Text style={styles.fieldError}>{errors.confirm}</Text> : null}
          </View>

          <PressableScale
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <LoadingDog size={28} color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.changePw.submit')}</Text>
            )}
          </PressableScale>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    backButton: {
      width: 44,
      textAlign: 'center',
    },
    container: { padding: 24 },
    fieldContainer: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, fontFamily: 'System' },
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
      marginTop: 8,
      minHeight: 52,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', fontFamily: 'System' },
  });
}
