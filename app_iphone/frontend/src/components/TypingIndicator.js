/**
 * Indicador de "IA digitando" — 3 pontos animados.
 * Animação: sequência de opacity 0→1→0 com defasagem entre pontos.
 * Estilo de bubble da IA, alinhado à esquerda.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const DOT_SIZE = 8;
const ANIMATION_DURATION = 400;
const DOT_DELAY = 160;

function AnimatedDot({ delay }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

export default function TypingIndicator() {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <AnimatedDot delay={0} />
        <AnimatedDot delay={DOT_DELAY} />
        <AnimatedDot delay={DOT_DELAY * 2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
    marginVertical: 4,
    marginHorizontal: 16,
  },
  bubble: {
    backgroundColor: '#1A1A2E',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#94A3B8',
  },
});
