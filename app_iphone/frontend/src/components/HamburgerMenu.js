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
import { ThemeCover, useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import ChevronIcon from './ChevronIcon';
import PressableScale from './PressableScale';

let BlurView = null;
try { BlurView = require('expo-blur').BlurView; } catch (e) { BlurView = null; }

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
  const { t, lang, setLang } = useI18n();
  const slideAnim = useRef(new Animated.Value(340)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(340);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const close = () => {
    Animated.timing(slideAnim, { toValue: 340, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const goToAccount = () => {
    close();
    setTimeout(() => navigation.navigate('Account'), 240);
  };

  const goToNotifications = () => {
    close();
    setTimeout(() => navigation.navigate('NotificationSettings'), 240);
  };

  const drawerBg = isDark ? 'rgba(18,16,22,0.55)' : 'rgba(248,248,250,0.72)';
  const cardBg = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          {BlurView && <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: drawerBg }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textSecondary }]}>{t('chat.menu.title')}</Text>
            <PressableScale onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 20, fontWeight: '600' }}>✕</Text>
            </PressableScale>
          </View>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={toggleTheme}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('chat.menu.theme')}</Text>
            <View style={[styles.themeToggleTrack, { backgroundColor: isDark ? theme.surface2 : theme.border }]}>
              <Image
                source={require('../../assets/icon-tema-claro.png')}
                style={[styles.themeToggleIcon, { tintColor: isDark ? theme.textSecondary : theme.primary }]}
              />
              <Image
                source={require('../../assets/icon-tema-escuro.png')}
                style={[styles.themeToggleIcon, { tintColor: isDark ? theme.primary : theme.textSecondary }]}
              />
              <View style={[styles.themeToggleThumb, { left: isDark ? 29 : 3, backgroundColor: theme.primary }]} />
            </View>
          </PressableScale>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={goToNotifications}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('chat.menu.notifications')}</Text>
            <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
          </PressableScale>

          {/* Idioma: mesmo formato do toggle de tema — trilho com a pílula
              deslizando entre as duas opções. */}
          <PressableScale
            style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          >
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('common.language')}</Text>
            <View style={[styles.langTrack, { backgroundColor: isDark ? theme.surface2 : theme.border }]}>
              <View style={[styles.langThumb, { left: lang === 'pt' ? 3 : 39, backgroundColor: theme.primary }]} />
              <Text style={[styles.langText, { color: lang === 'pt' ? '#FFFFFF' : theme.textSecondary }]}>PT</Text>
              <Text style={[styles.langText, { color: lang === 'en' ? '#FFFFFF' : theme.textSecondary }]}>EN</Text>
            </View>
          </PressableScale>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={goToAccount}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('common.account')}</Text>
            <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
          </PressableScale>
        </Animated.View>

        {/* Modal é uma janela nativa separada: a cortina do ThemeProvider não
            alcança aqui dentro. Sem esta, o menu trocaria de tema fora da
            animação, depois do resto — que era o "pisca" que sobrava. */}
        <ThemeCover />
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
    width: '85%',
    maxWidth: 360,
    height: '100%',
    paddingTop: 60,
    paddingHorizontal: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  title: { fontSize: 13, fontWeight: '700', fontFamily: 'System', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 12,
  },
  cardText: { fontSize: 16, fontWeight: '500', fontFamily: 'System' },
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
  themeToggleIcon: { width: 15, height: 15, zIndex: 1 },
  themeToggleThumb: { position: 'absolute', top: 3, width: 26, height: 24, borderRadius: 12 },

  // Trilho do idioma: um pouco mais largo que o de tema porque carrega texto
  // ("PT"/"EN") em vez de ícone.
  langTrack: {
    width: 70,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    position: 'relative',
  },
  langThumb: { position: 'absolute', top: 3, width: 28, height: 24, borderRadius: 12 },
  langText: { fontSize: 11, fontWeight: '700', zIndex: 1, fontFamily: 'System' },
});
