/**
 * Banner de aviso quando notificações estão desativadas.
 * Exibe botão para abrir Configurações do iOS diretamente.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

const COLORS = {
  warning: '#F59E0B',
  warningBackground: '#1C1400',
  warningBorder: '#92400E',
  textPrimary: '#F1F5F9',
};

export default function NotificationPermissionBanner() {
  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.message} numberOfLines={2}>
        Notificações desativadas. Ative em Configurações para receber seus lembretes.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleOpenSettings}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Abrir Configurações"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.buttonText}>Abrir Configurações</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.warningBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 12,
    color: COLORS.warning,
    lineHeight: 17,
    fontFamily: 'System',
  },
  button: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.warning,
    borderRadius: 6,
    minHeight: 30,
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'System',
  },
});
