import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import PressableScale from './PressableScale';

const MENU_WIDTH = 185;
const ITEM_HEIGHT = 50;
const MARGIN = 14;

export default function ActionSheet({ visible, options = [], onCancel, anchorPosition }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: visible ? 140 : 90,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: visible ? 1 : 0.82,
        useNativeDriver: true,
        tension: 220,
        friction: 18,
      }),
    ]).start();
  }, [fade, scale, visible]);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const menuHeight = options.length * ITEM_HEIGHT;

  let top = screenHeight / 2 - menuHeight / 2;
  let left = screenWidth / 2 - MENU_WIDTH / 2;

  if (anchorPosition) {
    const { pageX, pageY } = anchorPosition;
    top = pageY + menuHeight + MARGIN * 2 > screenHeight
      ? Math.max(MARGIN, pageY - menuHeight - MARGIN)
      : pageY + MARGIN;
    left = pageX + MENU_WIDTH > screenWidth - MARGIN
      ? screenWidth - MENU_WIDTH - MARGIN
      : Math.max(MARGIN, pageX);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View
          pointerEvents="box-none"
          style={[styles.menu, { top, left, transform: [{ scale }] }]}
        >
          {options.map((option, index) => (
            <PressableScale
              key={option.label}
              style={[styles.option, index < options.length - 1 && styles.optionBorder]}
              onPress={option.onPress}
            >
              <Text style={[styles.optionText, option.destructive && styles.destructiveText]}>
                {option.label}
              </Text>
            </PressableScale>
          ))}
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
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    menu: {
      position: 'absolute',
      width: MENU_WIDTH,
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.45 : 0.2,
      shadowRadius: 18,
      elevation: 12,
    },
    option: {
      height: ITEM_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    optionBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    optionText: {
      color: theme.primary,
      fontSize: 16,
      fontFamily: 'System',
      fontWeight: '500',
    },
    destructiveText: {
      color: theme.error,
      fontWeight: '600',
    },
  });
}
