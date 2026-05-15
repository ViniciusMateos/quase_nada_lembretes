import React from 'react';
import { StyleSheet, Text } from 'react-native';

export default function ChevronIcon({ direction = 'left', color, size = 34, style }) {
  return (
    <Text
      style={[
        styles.icon,
        {
          color,
          fontSize: size,
          lineHeight: size + 2,
          width: Math.ceil(size * 0.72),
        },
        style,
      ]}
    >
      {direction === 'right' ? '›' : '‹'}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontFamily: 'System',
    fontWeight: '300',
    textAlign: 'center',
  },
});
