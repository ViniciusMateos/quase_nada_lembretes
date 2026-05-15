import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function PasswordVisibilityIcon({ hidden, color }) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/olho.png')}
        style={[styles.icon, { tintColor: color }]}
        resizeMode="contain"
      />
      {hidden ? (
        <View style={[styles.slash, { backgroundColor: color }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 24,
    height: 24,
  },
  slash: {
    position: 'absolute',
    width: 28,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '-42deg' }],
  },
});
