import React, { useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';

/**
 * Pressable com efeito ripple (luz que preenche a partir do ponto do toque),
 * estilo iOS/Instagram. Clipa no próprio container (precisa overflow hidden no
 * style passado, já forçado aqui).
 */
export default function Ripple({
  children,
  style,
  onPress,
  rippleColor = 'rgba(255,255,255,0.3)',
  disabled = false,
  ...props
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const diameter = Math.max(size.w, size.h) * 2 || 120;

  const handlePressIn = e => {
    const { locationX, locationY } = e.nativeEvent;
    setPos({ x: locationX, y: locationY });
    scale.setValue(0);
    opacity.setValue(0.5);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[{ overflow: 'hidden' }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: rippleColor,
          left: pos.x - diameter / 2,
          top: pos.y - diameter / 2,
          opacity,
          transform: [{ scale }],
        }}
      />
      {children}
    </Pressable>
  );
}
