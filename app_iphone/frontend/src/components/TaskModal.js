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
import PressableScale from './PressableScale';
import { useI18n } from '../i18n';

// Cores das prioridades — espelham o site (vermelho/amarelo/verde).
export const PRIORITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' };

// Função, não constante: os rótulos precisam ser resolvidos a cada render, senão
// congelariam no idioma vigente no momento do import.
export function getPriorities(t) {
  return [
    { key: 'high', label: t('tasks.priority.high'), color: PRIORITY_COLORS.high },
    { key: 'medium', label: t('tasks.priority.medium'), color: PRIORITY_COLORS.medium },
    { key: 'low', label: t('tasks.priority.low'), color: PRIORITY_COLORS.low },
  ];
}

export default function TaskModal({ visible, task, initialName, onSave, onClose, theme }) {
  const { t, lang, progresso } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const priorities = useMemo(() => getPriorities(t), [t, lang, progresso]);
  // Estado inicializado DIRETO do task. Isto só funciona porque o pai remonta o
  // modal a cada abertura (key={...} no TaskModal): num componente novo, o
  // initializer do useState roda de novo e lê o task fresco. Era a causa de "o
  // título muda, a descrição não": um TextInput multiline controlado não repinta
  // quando o value é trocado por código. Nascendo com o valor certo, some o bug.
  const [name, setName] = useState(task?.name || initialName || '');
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const [notes, setNotes] = useState(task?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // O sheet fica ancorado no rodapé e o teclado sobe POR CIMA dele — quem
  // empurra o conteúdo é o automaticallyAdjustKeyboardInsets do ScrollView.
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);

  // Altura mínima do sheet. Fechado, ele tem a altura do conteúdo (compacto).
  // Com o teclado aberto, cresce pra ocupar TUDO que sobra acima dele — senão o
  // campo de anotações fica espremido numa fresta, que é o que incomodava.
  // Volta sozinho quando o teclado desce.
  const minAltura = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const alturaTela = Dimensions.get('window').height;

    const mostrar = Keyboard.addListener('keyboardWillShow', e => {
      // 24 de folga entre o topo do sheet e o topo da tela.
      const disponivel = alturaTela - e.endCoordinates.height - 24;
      Animated.timing(minAltura, {
        toValue: Math.max(0, disponivel),
        duration: e.duration || 250,
        useNativeDriver: false, // minHeight é layout: não existe no driver nativo
      }).start();
    });

    const esconder = Keyboard.addListener('keyboardWillHide', e => {
      Animated.timing(minAltura, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    return () => { mostrar.remove(); esconder.remove(); };
  }, [visible, minAltura]);

  // O teclado nativo cola o campo focado na sua borda — dá um respiro. O delay
  // curto faz o empurrão andar junto com a animação de abrir o teclado.
  const nudgeAboveKeyboard = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: scrollYRef.current + 28, animated: true }), 120);
  };

  // Ao focar as anotações, leva o CAMPO pro alto da área visível (não só um
  // empurrãozinho): como ele cresce pra baixo com o texto, começar lá em cima dá
  // o máximo de espaço antes de precisar rolar.
  const notesRef = useRef(null);
  const notesYRef = useRef(0);
  const revealNotes = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, notesYRef.current - 12), animated: true });
    }, 180); // espera o teclado começar a subir
  };

  // Anima o sheet descendo + overlay sumindo e então dispara o callback (fechar).
  // Usado tanto no cancelar/arrastar quanto ao salvar com sucesso — assim a
  // tela "volta" com o modal descendo em vez de sumir seco.
  const animateOut = cb => {
    Keyboard.dismiss();
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

  // Só a animação de entrada. Os campos NÃO são preenchidos aqui — já nascem com
  // o valor certo (useState inicializado do task), porque o pai remonta o modal
  // a cada abertura. Reintroduzir setNotes aqui traria de volta o bug do buffer.
  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(400);
      overlayOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
      ]).start();
    }
  }, [visible, task, sheetTranslateY, overlayOpacity]);

  const handleClose = () => animateOut(onClose);

  const handleSave = async () => {
    if (!name.trim()) {
      // Flag em vez do texto: o rótulo é resolvido no render e acompanha o idioma.
      setError('required');
      return;
    }
    setIsSaving(true);
    try {
      // notes SEMPRE como string (mesmo vazia), nunca null. O backend só grava
      // quando `notes is not None` — mandar null ao apagar tudo fazia ele IGNORAR
      // a limpeza e manter o texto velho. String vazia esvazia de verdade.
      await onSave({ name: name.trim(), priority, notes: notes.trim() });
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
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* O minHeight animado vai num nó SEPARADO do transform de propósito:
              transform roda no driver nativo, e basta uma prop nativa pra que o
              Animated.View inteiro migre pra lá — aí minHeight (que é layout, e
              não existe no módulo nativo) quebra com "Style property 'minHeight'
              is not supported by native animated module". Mesma armadilha do
              height no AnimatedExpand. Um nó por driver. */}
          <Animated.View style={{ minHeight: minAltura }}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            scrollEventThrottle={16}
            onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          >
            <Text style={styles.sheetTitle}>{task ? t('tasks.modal.editTitle') : t('tasks.modal.newTitle')}</Text>

            <Text style={styles.label}>{t('tasks.modal.nameLabel')}</Text>
            <TextInput
              style={[styles.input, error && styles.inputError]}
              value={name}
              onChangeText={text => { setName(text); if (error) setError(null); }}
              placeholder={t('tasks.modal.namePlaceholder')}
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="sentences"
              editable={!isSaving}
            />
            {error ? <Text style={styles.fieldError}>{t('tasks.modal.nameRequired')}</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>{t('tasks.modal.priorityLabel')}</Text>
            <View style={styles.priorityRow}>
              {priorities.map(p => {
                const active = priority === p.key;
                return (
                  // O flex:1 (que faz os três dividirem a linha) fica no wrapper,
                  // e o PressableScale usa o modo padrão — com o estilo do pill na
                  // View interna, que é a que recebe a escala.
                  //
                  // Com applyStyleToRoot era o contrário: o fundo/borda ficavam na
                  // raiz (sem escala) e só o conteúdo encolhia. Animava, mas o que
                  // se movia era invisível.
                  <View key={p.key} style={styles.prioritySlot}>
                  <PressableScale
                    style={[
                      styles.priorityPill,
                      styles.priorityContent,
                      active && { backgroundColor: p.color, borderColor: p.color },
                    ]}
                    onPress={() => setPriority(p.key)}
                    disabled={isSaving}
                  >
                    {!active && <View style={[styles.priorityDot, { backgroundColor: p.color }]} />}
                    <Text style={[styles.priorityPillText, active && styles.priorityPillTextActive]}>
                      {p.label}
                    </Text>
                  </PressableScale>
                  </View>
                );
              })}
            </View>

            <Text
              style={[styles.label, { marginTop: 14 }]}
              onLayout={e => { notesYRef.current = e.nativeEvent.layout.y; }}
            >
              {t('tasks.modal.notesLabel')}
            </Text>
            <TextInput
              ref={notesRef}
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('tasks.modal.notesPlaceholder')}
              placeholderTextColor={theme.textPlaceholder}
              onFocus={revealNotes}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              editable={!isSaving}
            />

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose} disabled={isSaving}>
                <Text style={[styles.btnText, styles.btnCancelText]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <LoadingDog size={28} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.btnText, styles.btnSaveText]}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
          </Animated.View>
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
      maxHeight: Dimensions.get('window').height * 0.94,
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
    notesInput: { minHeight: 120, paddingTop: 12 },
    inputError: { borderColor: theme.error },
    fieldError: {
      color: theme.error,
      fontSize: 12,
      marginTop: 4,
      marginLeft: 4,
      fontFamily: 'System',
    },
    priorityRow: { flexDirection: 'row', gap: 8 },
    prioritySlot: { flex: 1 },
    priorityPill: {
      paddingVertical: 11,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
    },
    priorityContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
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
