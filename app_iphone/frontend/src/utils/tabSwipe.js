import { Animated } from 'react-native';

/**
 * Posição (índice fracionário ABSOLUTO) da pílula do footer.
 * - As telas setam diretamente durante o swipe: tabPos = meuIndice + fração.
 * - No commit/cancel, animam pro índice destino.
 * - A LiquidTabBar também anima pro state.index quando troca por toque.
 *
 * Usar valor absoluto (em vez de base+offset) evita o "back-jump": a pílula
 * nunca volta pro índice antigo antes de seguir pro novo.
 */
// Começa em 1 (Chat) — primeira aba a abrir.
export const tabPos = new Animated.Value(1);

export function animateTabTo(index, duration = 220) {
  Animated.timing(tabPos, {
    toValue: index,
    duration,
    useNativeDriver: true,
  }).start();
}
