import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import PressableScale from './PressableScale';

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <PressableScale style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </PressableScale>
            <PressableScale
              style={[styles.button, destructive ? styles.destructiveButton : styles.confirmButton]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 20,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: theme.isDark ? 0.4 : 0.18,
      shadowRadius: 24,
      elevation: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.textSecondary,
      fontFamily: 'System',
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    cancelButton: {
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    confirmButton: {
      backgroundColor: theme.primary,
    },
    destructiveButton: {
      backgroundColor: theme.error,
    },
    cancelText: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'System',
    },
    confirmText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
      fontFamily: 'System',
    },
  });
}
