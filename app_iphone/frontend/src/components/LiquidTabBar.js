import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../context/ThemeContext';
import { tabPos, animateTabTo } from '../utils/tabSwipe';

const H_PAD = 6;
const GAP = 4;
const BAR_H = 60;

let BlurView = null;
try { BlurView = require('expo-blur').BlurView; } catch (e) { BlurView = null; }

// Liquid glass nativo do iOS 26. Quando disponível, o material vira o glass real
// do sistema; fora dele (iOS mais antigo / Android) cai no BlurView simulado.
const HAS_GLASS = isLiquidGlassAvailable();

// Ripple radial aproximado por anéis concêntricos (sem lib).
const RIPPLE_RINGS = [
  { s: 1, o: 0.05 },
  { s: 0.72, o: 0.08 },
  { s: 0.46, o: 0.13 },
  { s: 0.24, o: 0.22 },
];

export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  return BAR_H + (insets.bottom || 12) + 10;
}

export default function LiquidTabBar({ state, descriptors, navigation }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, !!BlurView, HAS_GLASS), [theme]);
  const [bar, setBar] = useState({ w: 0, h: 0 });

  const count = state.routes.length;
  const barTint = theme.isDark ? 'dark' : 'light';

  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const [ripple, setRipple] = useState({ x: 0, y: 0 });
  const pulseRef = useRef(null);
  const firstRef = useRef(true);

  const idxRef = useRef(state.index);
  idxRef.current = state.index;
  const cellRef = useRef(0);
  const routesRef = useRef(state.routes);
  routesRef.current = state.routes;
  const navRef = useRef(navigation);
  navRef.current = navigation;

  // Ao trocar de aba (clique/programático) anima só a posição; a escala é
  // derivada da posição (abaixo), então o squash vale também no arraste.
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      tabPos.setValue(state.index);
      return;
    }
    Animated.timing(tabPos, { toValue: state.index, duration: 320, useNativeDriver: true }).start();
  }, [state.index]);

  const innerWidth = bar.w - H_PAD * 2;
  const cellWidth = count > 0 ? innerWidth / count : 0;
  cellRef.current = cellWidth;
  const translateX = tabPos.interpolate({
    inputRange: [0, Math.max(1, count - 1)],
    outputRange: [0, cellWidth * (count - 1)],
    extrapolate: 'clamp',
  });
  // Escala derivada da posição: 1 em cima das abas (inteiros), 0.66 no meio do
  // caminho — então a pílula encolhe enquanto se move (clique E arraste) e cresce
  // ao chegar.
  const scaleInput = [];
  const scaleOutput = [];
  for (let i = 0; i <= (count - 1) * 2; i++) {
    scaleInput.push(i / 2);
    scaleOutput.push(i % 2 === 0 ? 1 : 0.66);
  }
  const pillScale = scaleInput.length > 1
    ? tabPos.interpolate({ inputRange: scaleInput, outputRange: scaleOutput, extrapolate: 'clamp' })
    : 1;
  const rippleD = bar.w ? bar.w * 1.7 : 320;

  const stopPulse = () => {
    if (pulseRef.current) { pulseRef.current.stop(); pulseRef.current = null; }
  };

  // Swipe na própria barra: a pílula segue o dedo e troca de aba ao soltar.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => {
        const cw = cellRef.current || 1;
        const max = count - 1;
        tabPos.setValue(Math.min(Math.max(idxRef.current + g.dx / cw, 0), max));
      },
      onPanResponderRelease: (_, g) => {
        const cw = cellRef.current || 1;
        const max = count - 1;
        const target = Math.min(Math.max(Math.round(idxRef.current + g.dx / cw), 0), max);
        if (target !== idxRef.current) navRef.current.navigate(routesRef.current[target].name);
        else animateTabTo(idxRef.current);
      },
      onPanResponderTerminate: () => animateTabTo(idxRef.current),
    }),
  ).current;

  const onTabPressIn = (index, e) => {
    const { locationX, locationY } = e.nativeEvent;
    setRipple({ x: H_PAD + index * cellWidth + locationX, y: 7 + locationY });
    stopPulse();
    rippleScale.setValue(0.1);
    rippleOpacity.setValue(0.6);
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(rippleScale, { toValue: 0.16, duration: 650, useNativeDriver: true }),
        Animated.timing(rippleScale, { toValue: 0.1, duration: 650, useNativeDriver: true }),
      ]),
    );
    pulseRef.current.start();
  };

  const onTabPressOut = () => {
    stopPulse();
    Animated.parallel([
      Animated.timing(rippleScale, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(rippleOpacity, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();
  };

  const onTabPress = (route, focused) => {
    if (!focused) navigation.navigate(route.name); // squash vem pelo efeito do state.index
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom ? insets.bottom : 12 }]}>
      <View
        style={styles.bar}
        onLayout={e => setBar({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        {...pan.panHandlers}
      >
        {HAS_GLASS ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme={theme.isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : BlurView ? (
          <BlurView intensity={40} tint={barTint} style={StyleSheet.absoluteFill} />
        ) : null}

        {bar.w > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { width: cellWidth - GAP * 2, left: H_PAD + GAP, transform: [{ translateX }, { scale: pillScale }] }]}
          >
            {HAS_GLASS ? (
              // Pílula em glass "clear" (mais translúcido) com tint da marca e
              // isInteractive pro efeito líquido de morphing ao mover.
              <GlassView
                glassEffectStyle="clear"
                isInteractive
                tintColor="rgba(10,132,255,0.4)"
                colorScheme={theme.isDark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
            ) : (
              <>
                {BlurView && <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />}
                <View style={styles.pillTint} />
              </>
            )}
          </Animated.View>
        )}

        {bar.w > 0 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: ripple.x - rippleD / 2,
              top: ripple.y - rippleD / 2,
              width: rippleD,
              height: rippleD,
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            }}
          >
            {RIPPLE_RINGS.map((c, i) => {
              const sz = rippleD * c.s;
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: (rippleD - sz) / 2,
                    top: (rippleD - sz) / 2,
                    width: sz,
                    height: sz,
                    borderRadius: sz / 2,
                    backgroundColor: `rgba(255,255,255,${c.o})`,
                  }}
                />
              );
            })}
          </Animated.View>
        )}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? route.name;
          const focused = state.index === index;
          const color = focused ? '#FFFFFF' : theme.textSecondary;

          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              onPress={() => onTabPress(route, focused)}
              onPressIn={e => onTabPressIn(index, e)}
              onPressOut={onTabPressOut}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={String(label)}
            >
              {options.tabBarIcon ? options.tabBarIcon({ color, size: 22, focused }) : null}
              <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(theme, hasBlur, hasGlass) {
  // Com liquid glass nativo a barra fica transparente pra o material do sistema
  // aparecer. Sem ele: chapado + desfocado sobre o blur (ou opaco no fallback).
  const glassBar = hasGlass
    ? 'transparent'
    : hasBlur
      ? (theme.isDark ? 'rgba(24,22,28,0.55)' : 'rgba(248,248,250,0.7)')
      : (theme.isDark ? 'rgba(26,24,30,0.92)' : 'rgba(255,255,255,0.95)');
  const glassBorder = hasGlass
    ? (theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.35)')
    : (theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)');
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 6,
      backgroundColor: 'transparent',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 30,
      paddingHorizontal: H_PAD,
      paddingVertical: 7,
      backgroundColor: glassBar,
      borderWidth: 1,
      borderColor: glassBorder,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.35 : 0.12,
      shadowRadius: 14,
      elevation: 8,
    },
    pill: {
      position: 'absolute',
      top: 7,
      bottom: 7,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: hasGlass ? 'rgba(255,255,255,0.22)' : 'rgba(90,176,255,0.55)',
      backgroundColor: 'transparent',
    },
    // azul da marca translúcido por cima do blur (fallback sem glass nativo)
    pillTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,132,255,0.72)' },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      gap: 3,
    },
    label: { fontSize: 12, fontWeight: '600', fontFamily: 'System' },
  });
}
