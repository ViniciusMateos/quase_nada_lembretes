import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

// Expande/recolhe animando a altura real do conteúdo.
//
// Histórico do que NÃO funciona aqui, pra ninguém repetir:
//  - LayoutAnimation: é no-op na New Architecture (newArchEnabled: true).
//  - `maxHeight` até um valor estimado à mão: como a estimativa é maior que o
//    conteúdo, ele aparece inteiro no comecinho e a animação parece instantânea.
//  - Medir numa CÓPIA invisível dos filhos: além de montar tudo em dobro, dois
//    expands aninhados viravam quatro cópias e a animação saía torta.
//  - Misturar `height` (JS) e `opacity` (nativo) no mesmo Animated.View: basta
//    uma prop ir pro driver nativo pra que o nó inteiro vá junto, e aí `height`
//    quebra ("Style property 'height' is not supported by native animated").
//
// Como funciona agora — sem cópia, medindo o próprio conteúdo:
//   1. Ao abrir, o container fica com altura 0 e o filho é medido FORA DO FLUXO
//      (position absolute), invisível. Medir com altura AUTO parecia natural,
//      mas por um frame o conteúdo ocupava o espaço inteiro e empurrava tudo
//      abaixo — depois a animação recomeçava do zero. Era a piscada.
//   2. O onLayout devolve a altura real; o filho volta pro fluxo e a altura
//      anima de 0 até ela.
//   3. Terminada a abertura, solta pra altura AUTO — assim o conteúdo pode
//      crescer sozinho depois (um expand aninhado, um chip novo) sem ficar preso
//      numa altura congelada.
//   4. Ao fechar, anima da última altura medida até 0 e desmonta.
const ABRE = 380;
const FECHA = 300;

export default function AnimatedExpand({ visible, children }) {
  const altura = useRef(new Animated.Value(0)).current;
  const opacidade = useRef(new Animated.Value(0)).current;
  const medida = useRef(0);

  const [montado, setMontado] = useState(visible);
  // 'medindo' → altura auto e invisível | 'animando' → altura controlada |
  // 'aberto' → altura auto e visível
  const [fase, setFase] = useState(visible ? 'aberto' : 'fechado');

  useEffect(() => {
    if (visible) {
      setMontado(true);
      setFase('medindo');
      altura.setValue(0);
      opacidade.setValue(0);
      return;
    }
    if (!montado) return;

    setFase('animando');
    altura.setValue(medida.current);
    Animated.parallel([
      Animated.timing(altura, {
        toValue: 0,
        duration: FECHA,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacidade, {
        toValue: 0,
        duration: FECHA * 0.7,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMontado(false);
        setFase('fechado');
      }
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const aoMedir = e => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    medida.current = h;

    if (fase !== 'medindo') return;
    setFase('animando');
    Animated.parallel([
      Animated.timing(altura, {
        toValue: h,
        duration: ABRE,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacidade, {
        toValue: 1,
        duration: ABRE * 0.8,
        delay: ABRE * 0.15,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      // Solta a altura: daqui pra frente o conteúdo manda (crescer/encolher
      // sozinho continua funcionando).
      if (finished) setFase('aberto');
    });
  };

  if (!montado) return null;

  const medindo = fase === 'medindo';

  return (
    <Animated.View
      style={{
        // Medindo: altura 0 (nada se mexe na tela). Animando: altura controlada.
        // Aberto: undefined = auto, o conteúdo manda.
        height: medindo ? 0 : fase === 'animando' ? altura : undefined,
        opacity: fase === 'aberto' ? 1 : opacidade,
        overflow: 'hidden',
      }}
    >
      <View
        // Fora do fluxo só enquanto mede: assim o onLayout devolve a altura
        // natural sem que o conteúdo empurre nada (o container está em 0).
        style={medindo ? { position: 'absolute', left: 0, right: 0, top: 0 } : null}
        onLayout={aoMedir}
      >
        {children}
      </View>
    </Animated.View>
  );
}
