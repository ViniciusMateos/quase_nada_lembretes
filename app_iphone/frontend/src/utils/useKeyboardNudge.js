import { useCallback, useRef } from 'react';

// O `automaticallyAdjustKeyboardInsets` (nativo do iOS) garante que o campo
// focado não fique embaixo do teclado, mas ele encosta o campo na borda do
// teclado — e isso não é configurável por prop. Este hook devolve o que falta:
// um empurrãozinho extra depois que o teclado assenta, pro campo ficar com um
// respiro acima dele.
//
// Uso:
//   const { scrollRef, scrollProps, nudge } = useKeyboardNudge();
//   <ScrollView ref={scrollRef} {...scrollProps} automaticallyAdjustKeyboardInsets />
//   <TextInput onFocus={nudge} />
export default function useKeyboardNudge(extra = 28) {
  const scrollRef = useRef(null);
  const scrollY = useRef(0);

  // Delay curto de propósito: o empurrão acontece DURANTE a animação de abrir o
  // teclado (~250ms) e termina junto com ela, em vez de dar um segundo pulo
  // depois que o teclado já parou.
  const nudge = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY.current + extra, animated: true });
    }, 120);
  }, [extra]);

  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: e => { scrollY.current = e.nativeEvent.contentOffset.y; },
  };

  return { scrollRef, scrollProps, nudge };
}
