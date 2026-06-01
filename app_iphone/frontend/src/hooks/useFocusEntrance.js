import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function useFocusEntrance() {
  const entrance = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      entrance.setValue(0.85);
      Animated.timing(entrance, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }, [entrance]),
  );

  return {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0.85, 1],
          outputRange: [2, 0],
        }),
      },
    ],
  };
}
