import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const themeStorage = new MMKV();

export const DARK_THEME = {
  isDark: true,
  background: '#0B0B0D',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  primary: '#0A84FF',
  primaryLight: '#5EB0FF',
  textPrimary: '#F1F5F9',
  textSecondary: '#98989F',
  textPlaceholder: '#5A5A60',
  border: '#3A3A3C',
  error: '#EF4444',
  tabBar: '#1A1A1F',
  tabBarBorder: '#2A2A2F',
};

export const LIGHT_THEME = {
  isDark: false,
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  primary: '#0A84FF',
  primaryLight: '#4DA3FF',
  textPrimary: '#1A1A2E',
  textSecondary: '#475569',
  textPlaceholder: '#94A3B8',
  border: '#E2E8F0',
  error: '#EF4444',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = themeStorage.getString('theme');
    return saved !== 'light';
  });

  // Cortina: uma View sólida por cima de tudo, na cor de fundo do tema de
  // DESTINO, que sobe e desce numa SEQUÊNCIA CONTÍNUA.
  //
  // Duas versões anteriores, e por que falharam:
  //
  // 1. Baixar a opacidade da árvore toda pra 0.25 e trocar o tema 120ms depois:
  //    a 0.25 você via a tela ANTIGA apagada (lê como piscada), e o re-render
  //    pesado travava o JS no meio da animação de volta.
  //
  // 2. Cortina que subia até 1, ESPERAVA o setState + dois requestAnimationFrame,
  //    e só então descia: esse tempo parado em opacidade 1 é uma tela sólida
  //    branca ou preta — o "flash". Quanto mais pesado o re-render, maior o flash.
  //
  // Agora a cortina nunca PARA: sobe e desce de uma vez só, no driver nativo, e
  // a troca de tema é disparada perto do pico. Como a animação roda no lado
  // nativo, ela não espera nem trava com o re-render — o pico é um instante, não
  // uma pausa.
  const cover = useRef(new Animated.Value(0)).current;
  const [coverColor, setCoverColor] = useState(DARK_THEME.background);
  const animando = useRef(false);
  const trocaRef = useRef(null);

  useEffect(() => () => clearTimeout(trocaRef.current), []);

  const toggleTheme = () => {
    if (animando.current) return; // toques repetidos não empilham animação
    animando.current = true;

    const next = !isDark;
    setCoverColor((next ? DARK_THEME : LIGHT_THEME).background);
    cover.setValue(0);

    Animated.sequence([
      Animated.timing(cover, {
        toValue: 1,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cover, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => { animando.current = false; });

    // Troca perto do pico (a cortina está quase opaca) — o re-render acontece
    // escondido, mas sem a animação ter que esperar por ele.
    trocaRef.current = setTimeout(() => {
      themeStorage.set('theme', next ? 'dark' : 'light');
      setIsDark(next);
    }, 190);
  };

  const theme = useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);

  // A cortina sai no contexto porque um Modal (o menu hambúrguer, os sheets)
  // renderiza numa JANELA NATIVA SEPARADA, acima da árvore do app: uma cortina
  // desenhada aqui cobre a tela mas NÃO cobre o Modal. Sem isso, o fundo troca
  // escondido e o menu troca depois, na cara do usuário. Quem abre Modal deve
  // desenhar <ThemeCover /> dentro dele.
  const value = useMemo(
    () => ({ theme, isDark, toggleTheme, cover, coverColor }),
    [theme, isDark, coverColor], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <ThemeCover />
      </View>
    </ThemeContext.Provider>
  );
}

/** Cortina do tema. Renderize dentro de todo Modal que possa estar aberto na troca. */
export function ThemeCover() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: ctx.coverColor, opacity: ctx.cover },
      ]}
    />
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return context;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
