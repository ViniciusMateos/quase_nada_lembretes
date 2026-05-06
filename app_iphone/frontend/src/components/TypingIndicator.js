/**
 * Indicador de "IA digitando" — 3 pontos animados.
 * Animação: sequência de opacity 0→1→0 com defasagem entre pontos.
 * Estilo de bubble da IA, alinhado à esquerda.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const DOT_SIZE = 8;
const ANIMATION_DURATION = 400;
const DOT_DELAY = 160;

function AnimatedDot({ delay, style }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -4,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]} />;
}

export default function TypingIndicator() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <AnimatedDot delay={0} style={styles.dot} />
        <AnimatedDot delay={DOT_DELAY} style={styles.dot} />
        <AnimatedDot delay={DOT_DELAY * 2} style={styles.dot} />
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrapper: {
      alignSelf: 'flex-start',
      marginVertical: 4,
      marginHorizontal: 16,
    },
    bubble: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      backgroundColor: theme.textSecondary,
    },
  });
}
