/**
 * Modal para resolução de ambiguidade na intenção de deletar lembrete.
 * Exibe lista de candidatos para o usuário escolher qual deletar.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

const COLORS = {
  background: '#0A0A0F',
  surface: '#1A1A2E',
  surface2: '#16213E',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#334155',
  error: '#EF4444',
};

export default function ReminderAmbiguousModal({
  visible,
  candidates = [],
  onSelect,
  onCancel,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <Text style={styles.title}>Qual lembrete você quer deletar?</Text>
            <Text style={styles.subtitle}>
              Encontrei mais de um lembrete que pode ser esse. Escolha abaixo:
            </Text>

            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {candidates.map(candidate => (
                <TouchableOpacity
                  key={candidate.id}
                  style={styles.candidateButton}
                  onPress={() => onSelect(candidate.id)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Deletar: ${candidate.title}`}
                >
                  <Text style={styles.candidateText} numberOfLines={2}>
                    {candidate.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    fontFamily: 'System',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
    fontFamily: 'System',
  },
  list: {
    flexGrow: 0,
  },
  candidateButton: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  candidateText: {
    fontSize: 15,
    color: COLORS.primaryLight,
    fontFamily: 'System',
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.error,
    fontWeight: '600',
    fontFamily: 'System',
  },
});
