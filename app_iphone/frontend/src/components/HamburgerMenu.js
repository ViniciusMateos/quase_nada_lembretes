import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import ChevronIcon from './ChevronIcon';
import PressableScale from './PressableScale';

export function HamburgerIcon() {
  return (
    <View style={{ gap: 4, padding: 4 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ width: 18, height: 2, backgroundColor: '#94A3B8' }} />
      ))}
    </View>
  );
}

export default function HamburgerMenu({ visible, onClose, navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const close = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const goToAccount = () => {
    close();
    setTimeout(() => navigation.navigate('Account'), 220);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          style={[styles.drawer, { backgroundColor: theme.surface, transform: [{ translateX: slideAnim }] }]}
        >
          <PressableScale style={styles.closeRow} onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 18 }}>x</Text>
          </PressableScale>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <PressableScale style={styles.row} onPress={toggleTheme}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowText, { color: theme.textPrimary }]}>Alterar tema</Text>
            </View>
            <View style={[styles.themeToggleTrack, { backgroundColor: isDark ? theme.surface2 : theme.border }]}>
              <Image
                source={require('../../assets/icon-tema-claro.png')}
                style={[
                  styles.themeToggleIcon,
                  { tintColor: isDark ? theme.textSecondary : theme.primary },
                ]}
              />
              <Image
                source={require('../../assets/icon-tema-escuro.png')}
                style={[
                  styles.themeToggleIcon,
                  { tintColor: isDark ? theme.primary : theme.textSecondary },
                ]}
              />
              <View
                style={[
                  styles.themeToggleThumb,
                  { left: isDark ? 29 : 3, backgroundColor: theme.primary },
                ]}
              />
            </View>
          </PressableScale>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <PressableScale style={styles.row} onPress={goToAccount}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowText, { color: theme.textPrimary }]}>Conta</Text>
            </View>
            <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    flexDirection: 'row',
  },
  drawer: {
    width: 280,
    height: '100%',
    paddingTop: 56,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  closeRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  divider: { height: 1, marginHorizontal: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowText: { fontSize: 16, fontFamily: 'System' },
  themeToggleTrack: {
    width: 58,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    position: 'relative',
  },
  themeToggleIcon: {
    width: 15,
    height: 15,
    zIndex: 1,
  },
  themeToggleThumb: {
    position: 'absolute',
    top: 3,
    width: 26,
    height: 24,
    borderRadius: 12,
  },
});
