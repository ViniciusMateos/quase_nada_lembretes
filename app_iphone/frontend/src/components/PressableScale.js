import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

export default function PressableScale({
  children,
  style,
  contentStyle,
  applyStyleToRoot = false,
  pressScale = 0.96,
  disabled = false,
  onPressIn,
  onPressOut,
  ...props
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = toValue => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      tension: 180,
      friction: 10,
    }).start();
  };

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={applyStyleToRoot ? style : undefined}
      onPressIn={event => {
        if (!disabled) animate(pressScale);
        onPressIn?.(event);
      }}
      onPressOut={event => {
        if (!disabled) animate(1);
        onPressOut?.(event);
      }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            applyStyleToRoot ? contentStyle : style,
            { transform: [{ scale }], opacity: disabled ? 0.55 : pressed ? 0.92 : 1 },
          ]}
        >
          {typeof children === 'function' ? children({ pressed }) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
