/**
 * Banner de erro com botão "ver logs" para diagnóstico.
 * Aceita a mensagem amigável + o erro bruto do axios.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

const COLORS = {
  error: '#EF4444',
  errorBackground: 'rgba(239, 68, 68, 0.1)',
  errorBorder: '#EF4444',
  logLink: '#F87171',
};

function formatErrorLog(error) {
  if (!error) return 'Nenhum detalhe disponível.';

  const lines = [];

  lines.push(`[CÓDIGO] ${error.code || 'N/A'}`);
  lines.push(`[MENSAGEM] ${error.message || 'N/A'}`);

  if (error.config) {
    const url = error.config.baseURL
      ? `${error.config.baseURL}${error.config.url || ''}`
      : error.config.url || 'N/A';
    lines.push(`[URL] ${url}`);
    lines.push(`[MÉTODO] ${(error.config.method || 'N/A').toUpperCase()}`);
  }

  if (error.response) {
    lines.push(`[STATUS HTTP] ${error.response.status}`);
    lines.push(`[BODY] ${JSON.stringify(error.response.data)}`);
  } else {
    lines.push('[RESPOSTA] Sem resposta do servidor (timeout ou rede)');
  }

  return lines.join('\n');
}

export default function ErrorBanner({ message, error }) {
  if (!message) return null;

  const handleShowLogs = () => {
    Alert.alert(
      'Detalhes do Erro',
      formatErrorLog(error),
      [{ text: 'Fechar', style: 'cancel' }],
      { userInterfaceStyle: 'dark' },
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {error && (
        <TouchableOpacity onPress={handleShowLogs} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.logLink}>ver logs</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.errorBackground,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  message: {
    flex: 1,
    color: COLORS.error,
    fontSize: 14,
    fontFamily: 'System',
    lineHeight: 20,
  },
  logLink: {
    color: COLORS.logLink,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'System',
    textDecorationLine: 'underline',
    flexShrink: 0,
  },
});
