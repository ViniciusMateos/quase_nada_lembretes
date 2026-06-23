import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Índice da última aba focada (compartilhado entre as telas) — define a direção
// do slide de entrada. Começa em 1 (Chat, aba inicial).
let lastIndex = 1;

const DIST = 90;

/**
 * Entrada direcional ao focar a tela (troca de aba por clique ou swipe):
 * a tela entra deslizando da direita se a aba é à direita da anterior, e da
 * esquerda se for à esquerda. `index` = posição da aba (Tarefas 0, Chat 1,
 * Lembretes 2).
 */
export default function useFocusEntrance(index = 0) {
  const tx = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      const dir = index > lastIndex ? 1 : index < lastIndex ? -1 : 0;
      lastIndex = index;
      tx.setValue(dir * DIST);
      op.setValue(dir === 0 ? 0.5 : 0.65);
      Animated.parallel([
        Animated.spring(tx, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }, [index, tx, op]),
  );

  return { opacity: op, transform: [{ translateX: tx }] };
}
