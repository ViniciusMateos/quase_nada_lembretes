import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listReminders, deleteReminder, syncReminders, updateReminder } from '../api/reminders.api';
import { scheduleFromSync } from '../services/notifications';
import { useTheme } from '../context/ThemeContext';
import LoadingDog from '../components/LoadingDog';
import ConfirmDialog from '../components/ConfirmDialog';
import HamburgerMenu, { HamburgerIcon } from '../components/HamburgerMenu';
import ActionSheet from '../components/ActionSheet';
import PressableScale from '../components/PressableScale';

function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function formatDateForInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function formatTimeForInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
    hour12: false,
  }).format(date);
}

function parseBRDatetime(dateStr, timeStr) {
  const dateParts = dateStr.trim().split('/');
  const timeParts = timeStr.trim().split(':');
  if (dateParts.length !== 3 || timeParts.length !== 2) return null;
  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const year = parseInt(dateParts[2], 10);
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  if ([day, month, year, hours, minutes].some(isNaN)) return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  if (year < 2024 || year > 2100) return null;
  const date = new Date(year, month, day, hours, minutes, 0, 0);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function groupReminders(reminders) {
  const upcoming = reminders.filter(r => !r.recurrence || r.recurrence === 'once');
  const recurring = reminders.filter(r => r.recurrence && r.recurrence !== 'once');
  return { upcoming, recurring };
}

function EditReminderModal({ visible, reminder, onSave, onClose, theme }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const styles = useMemo(() => makeModalStyles(theme), [theme]);

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setDate(formatDateForInput(reminder.next_execution));
      setTime(formatTimeForInput(reminder.next_execution));
      setErrors({});
    }
  }, [reminder]);

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Título é obrigatório';
    const parsed = parseBRDatetime(date, time);
    if (!parsed) newErrors.datetime = 'Data/hora inválida — use DD/MM/AAAA e HH:MM';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(reminder.id, { title: title.trim(), scheduled_time: parsed });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Editar lembrete</Text>

            <Text style={styles.label}>Título</Text>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              value={title}
              onChangeText={text => { setTitle(text); if (errors.title) setErrors(e => ({ ...e, title: null })); }}
              placeholder="Nome do lembrete"
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="sentences"
              editable={!isSaving}
            />
            {errors.title ? <Text style={styles.fieldError}>{errors.title}</Text> : null}

            <Text style={styles.label}>Data</Text>
            <TextInput
              style={[styles.input, errors.datetime && styles.inputError]}
              value={date}
              onChangeText={text => { setDate(text); if (errors.datetime) setErrors(e => ({ ...e, datetime: null })); }}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={theme.textPlaceholder}
              keyboardType="numeric"
              editable={!isSaving}
            />

            <Text style={styles.label}>Horário</Text>
            <TextInput
              style={[styles.input, errors.datetime && styles.inputError]}
              value={time}
              onChangeText={text => { setTime(text); if (errors.datetime) setErrors(e => ({ ...e, datetime: null })); }}
              placeholder="HH:MM"
              placeholderTextColor={theme.textPlaceholder}
              keyboardType="numeric"
              editable={!isSaving}
            />
            {errors.datetime ? <Text style={styles.fieldError}>{errors.datetime}</Text> : null}

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose} disabled={isSaving}>
                <Text style={[styles.btnText, styles.btnCancelText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <LoadingDog size={20} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.btnText, styles.btnSaveText]}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReminderItem({ reminder, onEdit, onDelete, onLongPress, theme }) {
  const styles = useMemo(() => makeItemStyles(theme), [theme]);
  const pressAnim = useRef(new Animated.Value(1)).current;
  const [isHolding, setIsHolding] = useState(false);

  const animatePress = toValue => {
    Animated.spring(pressAnim, {
      toValue,
      useNativeDriver: true,
      tension: 120,
      friction: 7,
    }).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
    <Pressable
      style={[styles.item, isHolding && styles.itemHolding]}
      onPress={() => onEdit(reminder)}
      onPressIn={() => animatePress(0.985)}
      onPressOut={() => {
        setIsHolding(false);
        animatePress(1);
      }}
      onLongPress={() => {
        setIsHolding(true);
        animatePress(1.02);
        onLongPress(reminder);
      }}
      delayLongPress={350}
    >
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{reminder.title}</Text>
        <Text style={styles.itemDate}>{formatDateTime(reminder.next_execution)}</Text>
        {reminder.recurrence_str ? (
          <Text style={styles.itemRecurrence}>{reminder.recurrence_str}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(reminder)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Deletar lembrete ${reminder.title}`}
      >
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </Pressable>
    </Animated.View>
  );
}

export default function RemindersScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deletingReminder, setDeletingReminder] = useState(null);
  const [actionReminder, setActionReminder] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const hasLoadedRemindersRef = useRef(false);
  const screenWidth = Dimensions.get('window').width;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 2 && Math.abs(g.dx) > 20,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          swipeTranslateX.setValue(Math.min(g.dx, screenWidth));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Animated.timing(swipeTranslateX, {
            toValue: screenWidth,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            swipeTranslateX.setValue(0);
            navigation.navigate('Chat');
          });
          return;
        }

        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    }),
  ).current;

  const fetchReminders = useCallback(async (isRefresh = false) => {
    if (!isRefresh && !hasLoadedRemindersRef.current) setIsLoading(true);
    setError(null);
    try {
      const data = await listReminders();
      setReminders(data.reminders || []);
      hasLoadedRemindersRef.current = true;
    } catch (err) {
      setError('Erro ao carregar lembretes. Puxe para atualizar.');
      console.warn('[RemindersScreen] Erro ao carregar:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReminders();
    }, [fetchReminders]),
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchReminders(true);
  };

  const handleDelete = reminder => {
    setDeletingReminder(reminder);
  };

  const handleReminderAction = reminder => {
    setActionReminder(reminder);
  };

  const handleActionEdit = () => {
    const reminder = actionReminder;
    setActionReminder(null);
    if (reminder) setEditingReminder(reminder);
  };

  const handleActionDelete = () => {
    const reminder = actionReminder;
    setActionReminder(null);
    if (reminder) setDeletingReminder(reminder);
  };

  const confirmDelete = async () => {
    const reminder = deletingReminder;
    if (!reminder) return;

    setDeletingReminder(null);
    try {
      await deleteReminder(reminder.id);
      setReminders(prev => prev.filter(r => r.id !== reminder.id));
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível deletar o lembrete.');
      console.warn('[RemindersScreen] Erro ao deletar:', err);
    }
  };

  const handleEdit = reminder => {
    setEditingReminder(reminder);
  };

  const handleSaveEdit = async (id, data) => {
    try {
      const updated = await updateReminder(id, data);
      setReminders(prev => prev.map(r => (r.id === id ? updated : r)));
      setEditingReminder(null);
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar o lembrete.');
      console.warn('[RemindersScreen] Erro ao atualizar:', err);
    }
  };

  const { upcoming, recurring } = groupReminders(reminders);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <LoadingDog size={56} color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchReminders()}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sections = [];
  if (upcoming.length > 0) {
    sections.push({ type: 'header', id: 'header-upcoming', title: 'Próximos' });
    upcoming.forEach(r => sections.push({ type: 'item', id: r.id, reminder: r }));
  }
  if (recurring.length > 0) {
    sections.push({ type: 'header', id: 'header-recurring', title: 'Recorrentes' });
    recurring.forEach(r => sections.push({ type: 'item', id: r.id, reminder: r }));
  }

  return (
    <View style={styles.safe}>
    <Animated.View
      style={[styles.swipePage, { transform: [{ translateX: swipeTranslateX }] }]}
      {...panResponder.panHandlers}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meus Lembretes</Text>
          <PressableScale
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
            accessibilityLabel="Menu"
            accessibilityRole="button"
          >
            <HamburgerIcon />
          </PressableScale>
        </View>
        {reminders.length > 0 && (
          <Text style={styles.editHint}>Clique no lembrete para editar</Text>
        )}
        <FlatList
          data={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={styles.sectionHeader}>{item.title}</Text>;
            }
            return (
              <ReminderItem
                reminder={item.reminder}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onLongPress={handleReminderAction}
                theme={theme}
              />
            );
          }}
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Nenhum lembrete criado ainda.</Text>
              <Text style={styles.emptySubtext}>Peça ao chat para criar um!</Text>
            </View>
          }
        />

        <EditReminderModal
          visible={!!editingReminder}
          reminder={editingReminder}
          onSave={handleSaveEdit}
          onClose={() => setEditingReminder(null)}
          theme={theme}
        />
        <ConfirmDialog
          visible={!!deletingReminder}
          title="Deletar lembrete"
          message={deletingReminder ? `Deseja deletar "${deletingReminder.title}"?` : ''}
          confirmText="Deletar"
          destructive
          onCancel={() => setDeletingReminder(null)}
          onConfirm={confirmDelete}
        />
        <ActionSheet
          visible={!!actionReminder}
          title={actionReminder?.title || 'Lembrete'}
          message="Escolha uma acao para este lembrete"
          options={[
            { label: 'Editar', onPress: handleActionEdit },
            { label: 'Excluir', destructive: true, onPress: handleActionDelete },
          ]}
          onCancel={() => setActionReminder(null)}
        />
        <HamburgerMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          navigation={navigation}
        />
      </SafeAreaView>
    </Animated.View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    swipePage: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    editHint: {
      fontSize: 12,
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
      paddingVertical: 8,
      fontStyle: 'italic',
    },
    listContent: { paddingBottom: 24 },
    emptyContainer: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 8,
      fontFamily: 'System',
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      fontFamily: 'System',
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textPlaceholder,
      fontFamily: 'System',
      marginTop: 8,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 15,
      color: theme.error,
      fontFamily: 'System',
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: theme.surface,
      borderRadius: 8,
    },
    retryButtonText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: 'System',
    },
  });
}

function makeItemStyles(theme) {
  return StyleSheet.create({
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 12,
      padding: 16,
    },
    itemHolding: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.35 : 0.14,
      shadowRadius: 12,
      elevation: 5,
    },
    itemContent: { flex: 1 },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 4,
      fontFamily: 'System',
    },
    itemDate: {
      fontSize: 13,
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    itemRecurrence: {
      fontSize: 12,
      color: theme.primary,
      marginTop: 2,
      fontFamily: 'System',
    },
    deleteButton: { marginLeft: 12, padding: 4 },
    deleteButtonText: { fontSize: 16, color: theme.textSecondary },
  });
}

function makeModalStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingBottom: 40,
      paddingTop: 12,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 20,
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
      marginBottom: 14,
    },
    inputError: { borderColor: theme.error },
    fieldError: {
      color: theme.error,
      fontSize: 12,
      marginTop: -10,
      marginBottom: 10,
      marginLeft: 4,
      fontFamily: 'System',
    },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    btn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnCancel: {
      borderWidth: 1,
      borderColor: theme.border,
    },
    btnSave: {
      backgroundColor: theme.primary,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'System',
    },
    btnCancelText: { color: theme.textSecondary },
    btnSaveText: { color: '#FFFFFF' },
  });
}
