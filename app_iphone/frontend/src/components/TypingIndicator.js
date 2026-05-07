import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import LoadingDog from './LoadingDog';

export default function TypingIndicator() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <LoadingDog size={34} color={theme.textSecondary} />
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrapper: {
      alignSelf: 'flex-start',
      marginVertical: 4,
      marginHorizontal: 16,
    },
    bubble: {
      width: 54,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
    },
  });
}
