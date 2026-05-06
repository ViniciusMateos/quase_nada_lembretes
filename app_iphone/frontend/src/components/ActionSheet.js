import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import PressableScale from './PressableScale';

export default function ActionSheet({ visible, title, message, options = [], onCancel }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const slide = useRef(new Animated.Value(28)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 120,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: visible ? 0 : 28,
        duration: visible ? 220 : 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, slide, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {options.map(option => (
              <PressableScale
                key={option.label}
                style={styles.option}
                onPress={option.onPress}
              >
                <Text style={[styles.optionText, option.destructive && styles.destructiveText]}>
                  {option.label}
                </Text>
              </PressableScale>
            ))}
          </View>
          <PressableScale style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      paddingHorizontal: 10,
      paddingBottom: 10,
    },
    sheet: {
      gap: 8,
    },
    title: {
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      fontFamily: 'System',
      backgroundColor: theme.surface,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      paddingTop: 14,
      paddingHorizontal: 18,
    },
    message: {
      textAlign: 'center',
      color: theme.textPlaceholder,
      fontSize: 12,
      fontFamily: 'System',
      backgroundColor: theme.surface,
      paddingTop: 4,
      paddingBottom: 12,
      paddingHorizontal: 18,
    },
    actions: {
      overflow: 'hidden',
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
    },
    option: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    optionText: {
      color: theme.primary,
      fontSize: 18,
      fontFamily: 'System',
      fontWeight: '500',
    },
    destructiveText: {
      color: theme.error,
      fontWeight: '600',
    },
    cancelButton: {
      minHeight: 54,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
    },
    cancelText: {
      color: theme.primary,
      fontSize: 18,
      fontFamily: 'System',
      fontWeight: '700',
    },
  });
}
