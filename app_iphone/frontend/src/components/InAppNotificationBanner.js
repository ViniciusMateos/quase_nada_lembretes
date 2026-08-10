import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { onInAppBanner } from '../utils/inAppBanner';
import { navigationRef } from '../api/client';

// Blur opcional (mesma abordagem do menu): se a lib não existir, cai num fundo sólido.
let BlurView = null;
try { BlurView = require('expo-blur').BlurView; } catch (e) { BlurView = null; }

const APP_ICON = require('../../assets/icon-prod.png');
const AUTO_MS = 4500;     // some sozinha, como uma notificação real
const OCULTO_Y = -260;    // posição fora da tela (acima)

// Notificação simulada estilo iOS: desliza de cima, some sozinha e sai quando
// arrastada pra cima — a "mesma pegada" de uma notificação de verdade do iPhone.
export default function InAppNotificationBanner() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme, isDark, insets.top), [theme, isDark, insets.top]);

  const [payload, setPayload] = useState(null);
  const translateY = useRef(new Animated.Value(OCULTO_Y)).current;
  const timer = useRef(null);

  const esconder = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(translateY, {
      toValue: OCULTO_Y,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setPayload(null));
  }, [translateY]);

  const mostrar = useCallback(p => {
    setPayload(p);
    translateY.setValue(OCULTO_Y);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 7,
      speed: 13,
    }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(esconder, AUTO_MS);
  }, [translateY, esconder]);

  useEffect(() => onInAppBanner(mostrar), [mostrar]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Tocar na notificação → vai pro Chat (onde está a conversa), com o mesmo slide
  // direcional de troca de tela (useFocusEntrance da ChatScreen faz a entrada).
  const aoTocar = useCallback(() => {
    esconder();
    try { navigationRef.current?.navigate('Main', { screen: 'Chat' }); } catch (e) {}
  }, [esconder]);

  const pan = useRef(
    PanResponder.create({
      // Captura (mesmo por cima do Pressable) só o arrasto pra CIMA = dismiss.
      // O toque sem arrasto fica com o Pressable de baixo → navega pro Chat.
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy < -3 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } },
      onPanResponderMove: (_, g) => { if (g.dy < 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -28 || g.vy < -0.4) {
          esconder();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 7 }).start();
          timer.current = setTimeout(esconder, AUTO_MS);
        }
      },
    }),
  ).current;

  if (!payload) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY }] }]} pointerEvents="box-none">
      <Animated.View style={styles.card} {...pan.panHandlers}>
        {BlurView && <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, styles.cardBg]} />
        <Pressable
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
          onPress={aoTocar}
        >
          <Image source={APP_ICON} style={styles.icon} />
          <View style={styles.body}>
            <View style={styles.headerRow}>
              <Text style={styles.appName} numberOfLines={1}>{t('common.appShortName')}</Text>
              <Text style={styles.time}>{t('common.now')}</Text>
            </View>
            {!!payload.title && <Text style={styles.title} numberOfLines={1}>{payload.title}</Text>}
            {!!payload.body && <Text style={styles.text} numberOfLines={2}>{payload.body}</Text>}
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function makeStyles(theme, isDark, topInset) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: topInset + 6,
      left: 0,
      right: 0,
      paddingHorizontal: 10,
      zIndex: 9000,
    },
    card: {
      borderRadius: 22,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.5 : 0.16,
      shadowRadius: 16,
      elevation: 8,
    },
    cardBg: {
      backgroundColor: isDark ? 'rgba(44,44,48,0.72)' : 'rgba(250,250,252,0.72)',
    },
    pressable: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    pressed: {
      opacity: 0.85,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      marginRight: 12,
    },
    body: { flex: 1 },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 1,
    },
    appName: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
      color: theme.textSecondary,
    },
    time: {
      fontSize: 12,
      color: theme.textSecondary,
      opacity: 0.7,
      marginLeft: 8,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    text: {
      fontSize: 14,
      color: theme.textPrimary,
      opacity: 0.85,
      marginTop: 1,
    },
  });
}
