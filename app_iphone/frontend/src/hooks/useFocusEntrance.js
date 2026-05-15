import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function useFocusEntrance() {
  const entrance = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      entrance.setValue(0);
      Animated.spring(entrance, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    }, [entrance]),
  );

  return {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };
}
