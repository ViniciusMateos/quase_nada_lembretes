import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { changePassword } from '../api/auth.api';
import { useTheme } from '../context/ThemeContext';

export default function ChangePasswordScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!currentPassword) errs.current = 'Informe a senha atual';
    if (!newPassword || newPassword.length < 8) errs.new = 'Nova senha deve ter no mínimo 8 caracteres';
    if (newPassword !== confirmPassword) errs.confirm = 'As senhas não coincidem';
    setErrors(errs);
    return Object.keys(errs).length === 0;
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
        Alert.alert('Erro', 'Não foi possível alterar a senha. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
          <Text style={styles.backButton}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alterar senha</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Senha atual</Text>
            <TextInput
              style={[styles.input, errors.current && styles.inputError]}
              placeholder="Sua senha atual"
              placeholderTextColor={theme.textPlaceholder}
              value={currentPassword}
              onChangeText={text => { setCurrentPassword(text); if (errors.current) setErrors(e => ({ ...e, current: null })); }}
              secureTextEntry
              editable={!isLoading}
            />
            {errors.current ? <Text style={styles.fieldError}>{errors.current}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              style={[styles.input, errors.new && styles.inputError]}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.textPlaceholder}
              value={newPassword}
              onChangeText={text => { setNewPassword(text); if (errors.new) setErrors(e => ({ ...e, new: null })); }}
              secureTextEntry
              editable={!isLoading}
            />
            {errors.new ? <Text style={styles.fieldError}>{errors.new}</Text> : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Confirmar nova senha</Text>
            <TextInput
              style={[styles.input, errors.confirm && styles.inputError]}
              placeholder="Repita a nova senha"
              placeholderTextColor={theme.textPlaceholder}
              value={confirmPassword}
              onChangeText={text => { setConfirmPassword(text); if (errors.confirm) setErrors(e => ({ ...e, confirm: null })); }}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
            />
            {errors.confirm ? <Text style={styles.fieldError}>{errors.confirm}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Alterar senha</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
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
    backButton: { fontSize: 17, color: theme.primary, fontFamily: 'System', width: 60 },
    container: { padding: 24 },
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
      marginTop: 8,
      minHeight: 52,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', fontFamily: 'System' },
  });
}
