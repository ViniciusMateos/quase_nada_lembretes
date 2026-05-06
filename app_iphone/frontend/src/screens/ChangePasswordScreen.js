import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import PressableScale from '../components/PressableScale';

export default function ChangePasswordScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const screenTranslateX = useRef(new Animated.Value(0)).current;

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
    if (!currentPassword) errs.current = 'Informe a senha atual';
    if (!newPassword || newPassword.length < 8) errs.new = 'Nova senha deve ter no minimo 8 caracteres';
    if (newPassword !== confirmPassword) errs.confirm = 'As senhas nao coincidem';
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
      Alert.alert('Sucesso', 'Senha alterada com sucesso!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const code = error?.response?.data?.code;
      if (code === 'INVALID_CURRENT_PASSWORD') {
        setErrors({ current: 'Senha atual incorreta' });
      } else {
        Alert.alert('Erro', 'Nao foi possivel alterar a senha. Tente novamente.');
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
          <Text style={styles.headerTitle}>Alterar senha</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Senha atual</Text>
            <View style={[styles.inputWrapper, errors.current && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder="Sua senha atual"
                placeholderTextColor={theme.textPlaceholder}
                value={currentPassword}
                onChangeText={text => {
                  setCurrentPassword(text);
                  if (errors.current) setErrors(e => ({ ...e, current: null }));
                }}
                secureTextEntry={!showCurrentPassword}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowCurrentPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showCurrentPassword ? 'Ocultar senha atual' : 'Mostrar senha atual'}
              >
                <PasswordVisibilityIcon hidden={showCurrentPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.current ? <Text style={styles.fieldError}>{errors.current}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Nova senha</Text>
            <View style={[styles.inputWrapper, errors.new && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder="Minimo 8 caracteres"
                placeholderTextColor={theme.textPlaceholder}
                value={newPassword}
                onChangeText={text => {
                  setNewPassword(text);
                  if (errors.new) setErrors(e => ({ ...e, new: null }));
                }}
                secureTextEntry={!showNewPassword}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowNewPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
              >
                <PasswordVisibilityIcon hidden={showNewPassword} color={theme.textPlaceholder} />
              </PressableScale>
            </View>
            {errors.new ? <Text style={styles.fieldError}>{errors.new}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Confirmar nova senha</Text>
            <View style={[styles.inputWrapper, errors.confirm && styles.inputError]}>
              <TextInput
                style={styles.inputInner}
                placeholder="Repita a nova senha"
                placeholderTextColor={theme.textPlaceholder}
                value={confirmPassword}
                onChangeText={text => {
                  setConfirmPassword(text);
                  if (errors.confirm) setErrors(e => ({ ...e, confirm: null }));
                }}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />
              <PressableScale
                onPress={() => setShowConfirmPassword(p => !p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.eyeButton}
                accessibilityLabel={showConfirmPassword ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'}
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
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Alterar senha</Text>
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
