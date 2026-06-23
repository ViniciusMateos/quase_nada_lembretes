import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LoadingDog from './LoadingDog';

// Prioridades e cores — espelham o site (vermelho/amarelo/verde).
export const PRIORITIES = [
  { key: 'high', label: 'Alta', color: '#EF4444' },
  { key: 'medium', label: 'Média', color: '#F59E0B' },
  { key: 'low', label: 'Baixa', color: '#22C55E' },
];

export default function TaskModal({ visible, task, initialName, onSave, onClose, theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [kbHeight, setKbHeight] = useState(0);

  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Anima o sheet descendo + overlay sumindo e então dispara o callback (fechar).
  // Usado tanto no cancelar/arrastar quanto ao salvar com sucesso — assim a
  // tela "volta" com o modal descendo em vez de sumir seco.
  const animateOut = cb => {
    Keyboard.dismiss();
    keyboardOffset.setValue(0);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 520, duration: 280, useNativeDriver: true }),
    ]).start(() => cb && cb());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60 || g.vy > 0.5) {
          animateOut(onClose);
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setName(task?.name || initialName || '');
      setPriority(task?.priority || 'medium');
      setNotes(task?.notes || '');
      setError(null);
      setIsSaving(false);
      sheetTranslateY.setValue(400);
      overlayOpacity.setValue(0);
      keyboardOffset.setValue(0);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
      ]).start();
    }
  }, [visible, task, sheetTranslateY, overlayOpacity, keyboardOffset]);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setKbHeight(e.endCoordinates.height);
      Animated.timing(keyboardOffset, { toValue: -e.endCoordinates.height, duration: e.duration || 250, useNativeDriver: true }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      setKbHeight(0);
      Animated.timing(keyboardOffset, { toValue: 0, duration: e.duration || 250, useNativeDriver: true }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible, keyboardOffset]);

  const handleClose = () => animateOut(onClose);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), priority, notes: notes.trim() || null });
      // Sucesso → desce o modal mostrando a aba de volta.
      animateOut(onClose);
    } catch (e) {
      // Erro → mantém o modal aberto (o pai já avisa).
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View style={[styles.sheet, kbHeight > 0 && { maxHeight: Dimensions.get('window').height - kbHeight - 70 }, { transform: [{ translateY: Animated.add(sheetTranslateY, keyboardOffset) }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetTitle}>{task ? 'Editar tarefa' : 'Nova tarefa'}</Text>

            <Text style={styles.label}>Nome da tarefa</Text>
            <TextInput
              style={[styles.input, error && styles.inputError]}
              value={name}
              onChangeText={text => { setName(text); if (error) setError(null); }}
              placeholder="O que precisa ser feito?"
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="sentences"
              editable={!isSaving}
            />
            {error ? <Text style={styles.fieldError}>{error}</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Prioridade</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const active = priority === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={({ pressed }) => [
                      styles.priorityPill,
                      active && { backgroundColor: p.color, borderColor: p.color },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setPriority(p.key)}
                    disabled={isSaving}
                  >
                    {!active && <View style={[styles.priorityDot, { backgroundColor: p.color }]} />}
                    <Text style={[styles.priorityPillText, active && styles.priorityPillTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Anotações</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Descreva aqui... (opcional)"
              placeholderTextColor={theme.textPlaceholder}
              multiline
              textAlignVertical="top"
              editable={!isSaving}
            />

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose} disabled={isSaving}>
                <Text style={[styles.btnText, styles.btnCancelText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <LoadingDog size={28} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.btnText, styles.btnSaveText]}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: Dimensions.get('window').height * 0.88,
    },
    handleArea: { paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
    handle: { width: 48, height: 5, backgroundColor: theme.border, borderRadius: 3 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 20,
      marginTop: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    notesInput: { minHeight: 110, maxHeight: 220, paddingTop: 12 },
    inputError: { borderColor: theme.error },
    fieldError: {
      color: theme.error,
      fontSize: 12,
      marginTop: 4,
      marginLeft: 4,
      fontFamily: 'System',
    },
    priorityRow: { flexDirection: 'row', gap: 8 },
    priorityPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
    },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    priorityPillText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    priorityPillTextActive: { color: '#FFFFFF' },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
    btn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnCancel: { borderWidth: 1, borderColor: theme.border },
    btnSave: { backgroundColor: theme.primary },
    btnText: { fontSize: 15, fontWeight: '600', fontFamily: 'System' },
    btnCancelText: { color: theme.textSecondary },
    btnSaveText: { color: '#FFFFFF' },
  });
}
