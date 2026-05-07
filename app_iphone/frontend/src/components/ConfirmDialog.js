import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: visible ? 160 : 100,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: visible ? 1 : 0.9,
        useNativeDriver: true,
        tension: 180,
        friction: 16,
      }),
    ]).start();
  }, [fade, scale, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View style={[styles.dialog, { transform: [{ scale }] }]}>
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
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: theme.surface,
      borderRadius: 20,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 20,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: theme.isDark ? 0.5 : 0.22,
      shadowRadius: 28,
      elevation: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.textSecondary,
      fontFamily: 'System',
      marginBottom: 22,
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    button: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
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
