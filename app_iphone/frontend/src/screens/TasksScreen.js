import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// SafeAreaView do safe-area-context: só o topo é protegido, pra lista descer
// até o fim da tela e passar por trás do tab bar.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import useFocusEntrance from '../hooks/useFocusEntrance';
import { listTasks, createTask, updateTask, deleteTask } from '../api/tasks.api';
import { getWeekKey, formatTodayLabel } from '../utils/dateUtils';
import { tabPos, animateTabTo } from '../utils/tabSwipe';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import LoadingDog from '../components/LoadingDog';
import ConfirmDialog from '../components/ConfirmDialog';
import HamburgerMenu, { HamburgerIcon } from '../components/HamburgerMenu';
import PressableScale from '../components/PressableScale';
import WeekNavigator from '../components/WeekNavigator';
import TaskModal from '../components/TaskModal';
import SortableTaskList from '../components/SortableTaskList';
import ReminderFormModal from '../components/ReminderFormModal';
import { useTabBarClearance } from '../components/LiquidTabBar';
import { createReminder, syncReminders } from '../api/reminders.api';
import { scheduleFromSync } from '../services/notifications';

const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };

function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pa = PRIORITY_ORDER[a.priority] || 9;
    const pb = PRIORITY_ORDER[b.priority] || 9;
    if (pa !== pb) return pa - pb;
    const oa = a.order_index == null ? 1e9 : a.order_index;
    const ob = b.order_index == null ? 1e9 : b.order_index;
    if (oa !== ob) return oa - ob;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
}

export default function TasksScreen({ navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabClear = useTabBarClearance();
  const entrance = useFocusEntrance(0);

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const weekKey = useMemo(() => getWeekKey(currentDate), [currentDate]);

  const [tasks, setTasks] = useState([]);
  const tasksRef = useRef([]);
  tasksRef.current = tasks;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  // Guarda só o ID, não o objeto. A tarefa em edição é DERIVADA do `tasks` atual
  // (logo abaixo) — então ela é sempre a versão mais fresca por construção. Antes
  // guardávamos o objeto num snapshot, que ficava velho quando um toque entregava
  // uma cópia congelada (PanResponder). Sem objeto guardado, não há o que ficar
  // velho: quando o save atualiza `tasks`, a derivada aponta pro novo na hora.
  const [editingTaskId, setEditingTaskId] = useState(null);
  // Bump a cada abertura do modal; vira a `key` do TaskModal pra forçar remount.
  const [openNonce, setOpenNonce] = useState(0);
  const editingTask = editingTaskId ? tasks.find(x => x.id === editingTaskId) || null : null;
  const [deletingTask, setDeletingTask] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reminderDraft, setReminderDraft] = useState(null);

  const hasLoadedRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  // Slide ao trocar de semana (só a lista desliza).
  const contentTX = useRef(new Animated.Value(0)).current;
  const contentOp = useRef(new Animated.Value(1)).current;
  const weekDirRef = useRef(0);
  const firstWeekRef = useRef(true);

  useEffect(() => {
    if (firstWeekRef.current) { firstWeekRef.current = false; return; }
    const dir = weekDirRef.current;
    contentTX.setValue(dir * 70);
    contentOp.setValue(0.2);
    Animated.parallel([
      Animated.timing(contentTX, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(contentOp, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [weekKey, contentTX, contentOp]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !overlayOpenRef.current &&
        !isDraggingRef.current &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2 && Math.abs(g.dx) > 20,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          swipeTranslateX.setValue(Math.max(g.dx, -screenWidth));
          tabPos.setValue(0 + Math.min(-g.dx / screenWidth, 1)); // Tarefas(0) → Chat(1)
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -80) {
          Animated.timing(swipeTranslateX, { toValue: -screenWidth, duration: 180, useNativeDriver: true })
            .start(() => { navigation.navigate('Chat'); requestAnimationFrame(() => swipeTranslateX.setValue(0)); });
          animateTabTo(1);
          return;
        }
        Animated.spring(swipeTranslateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        animateTabTo(0);
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        animateTabTo(0);
      },
    }),
  ).current;

  const fetchTasks = useCallback(async (wk, isRefresh = false) => {
    if (!isRefresh && !hasLoadedRef.current) setIsLoading(true);
    setError(null);
    try {
      const data = await listTasks(wk);
      setTasks(sortTasks(data.tasks || []));
      hasLoadedRef.current = true;
    } catch (err) {
      // Guarda só o flag: o texto é resolvido no render, então acompanha a troca de idioma.
      setError('load');
      console.warn('[TasksScreen] Erro ao carregar:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTasks(weekKey); }, [weekKey, fetchTasks]);
  useFocusEffect(useCallback(() => { fetchTasks(weekKey); }, [weekKey, fetchTasks]));

  useEffect(() => {
    overlayOpenRef.current = !!(modalVisible || deletingTask || menuVisible || reminderDraft);
  }, [modalVisible, deletingTask, menuVisible, reminderDraft]);

  const changeWeek = days => {
    weekDirRef.current = days > 0 ? 1 : -1;
    const d = new Date(currentDate);
    d.setDate(d.getDate() + days);
    setCurrentDate(d);
  };

  const setAbsoluteDate = d => {
    weekDirRef.current = 0;
    setCurrentDate(d);
  };

  const handleRefresh = () => { setIsRefreshing(true); fetchTasks(weekKey, true); };
  const openNew = () => { setOpenNonce(n => n + 1); setEditingTaskId(null); setModalVisible(true); };

  const handleSave = async ({ name, priority, notes }) => {
    if (editingTask) {
      const updated = await updateTask(editingTask.id, { name, priority, notes });
      setTasks(prev => sortTasks(prev.map(t => (t.id === updated.id ? updated : t))));
    } else {
      const created = await createTask({ name, priority, notes, week_key: weekKey });
      setTasks(prev => sortTasks([...prev, created]));
    }
  };

  const handleToggle = async task => {
    const next = !task.completed;
    setTasks(prev => sortTasks(prev.map(t => (t.id === task.id ? { ...t, completed: next } : t))));
    try {
      await updateTask(task.id, { completed: next, week_key: weekKey });
    } catch (err) {
      Alert.alert(t('common.error'), t('tasks.updateError'));
      fetchTasks(weekKey, true);
      console.warn('[TasksScreen] Erro ao concluir:', err);
    }
  };

  const confirmDelete = () => {
    const task = deletingTask;
    if (!task) return;
    setDeletingTask(null);
    setRemovingId(task.id);
    deleteTask(task.id).catch(err => {
      Alert.alert(t('common.error'), t('tasks.deleteError'));
      setRemovingId(null);
      fetchTasks(weekKey, true);
      console.warn('[TasksScreen] Erro ao excluir:', err);
    });
  };

  const handleExited = useCallback(id => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setRemovingId(null);
  }, []);

  const handleReorder = (from, to) => {
    const arr = [...tasksRef.current];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    const p = moved.priority;
    let idx = 0;
    const toPersist = [];
    const next = arr.map(t => {
      if (!t.completed && t.priority === p) {
        const oi = idx;
        idx += 1;
        if (t.order_index !== oi) {
          toPersist.push({ id: t.id, order_index: oi });
          return { ...t, order_index: oi };
        }
      }
      return t;
    });
    setTasks(next);
    toPersist.forEach(u => {
      updateTask(u.id, { order_index: u.order_index }).catch(err =>
        console.warn('[TasksScreen] Erro ao salvar ordem:', err),
      );
    });
  };

  // Resolve a tarefa FRESCA do estado atual (tasksRef) por id. O toque na linha
  // passa por um PanResponder criado uma vez, que entrega uma versão velha do
  // objeto — sem esta busca, reabrir logo após salvar mostrava os dados antigos.
  const openEdit = task => {
    setOpenNonce(n => n + 1);
    setEditingTaskId(task.id);
    setModalVisible(true);
  };

  // Segurar a tarefa parado → abre o modal de lembrete já com o nome da tarefa.
  const onCreateReminder = task => {
    setReminderDraft({
      title: task.name,
      recurrence: 'once',
      next_execution: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  };

  const handleCreateReminder = async payload => {
    try {
      await createReminder(payload);
    } catch (err) {
      Alert.alert(t('common.error'), t('tasks.reminderError'));
      console.warn('[TasksScreen] criar lembrete:', err);
      return;
    }
    setReminderDraft(null);
    try {
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (err) {
      console.warn('[TasksScreen] sync após criar lembrete:', err);
    }
    Alert.alert(t('tasks.reminderDoneTitle'), t('tasks.reminderDone'));
  };

  return (
    <View style={styles.safe}>
      <Animated.View
        style={[styles.swipePage, { opacity: entrance.opacity, transform: [...entrance.transform, { translateX: swipeTranslateX }] }]}
        {...panResponder.panHandlers}
      >
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('tasks.title')}</Text>
            <PressableScale
              onPress={() => setMenuVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
              accessibilityLabel={t('chat.menuA11y')}
              accessibilityRole="button"
            >
              <HamburgerIcon />
            </PressableScale>
          </View>

          {isLoading ? (
            <View style={styles.centered}>
              <LoadingDog size={76} color={theme.primary} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{t('tasks.loadError')}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => fetchTasks(weekKey)}>
                <Text style={styles.retryButtonText}>{t('tasks.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.dateBlock}>
                <Text style={styles.todayDate}>{formatTodayLabel()}</Text>
                <Text style={styles.editHint}>{t('tasks.hint')}</Text>
              </View>

              <View style={styles.listWrap}>
                {isRefreshing && (
                  <View style={styles.refreshOverlay} pointerEvents="none">
                    <LoadingDog size={42} color={theme.primary} />
                  </View>
                )}
                <ScrollView
                  scrollEnabled={!isDragging}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.listContent, { paddingBottom: tabClear }]}
                  onScrollEndDrag={e => {
                    if (e.nativeEvent.contentOffset.y < -70 && !isRefreshing) handleRefresh();
                  }}
                >
                  <WeekNavigator
                    currentDate={currentDate}
                    onChangeWeek={changeWeek}
                    onSetAbsoluteDate={setAbsoluteDate}
                    theme={theme}
                  />
                  <View style={styles.newBtnWrap}>
                    <PressableScale style={styles.newBtn} onPress={openNew} accessibilityRole="button" accessibilityLabel={t('tasks.newA11y')}>
                      <Text style={styles.newBtnText}>{t('tasks.new')}</Text>
                    </PressableScale>
                  </View>

                  <Animated.View style={{ opacity: contentOp, transform: [{ translateX: contentTX }] }}>
                    {tasks.length === 0 ? (
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>{t('tasks.empty')}</Text>
                        <Text style={styles.emptySubtext}>{t('tasks.emptySub')}</Text>
                      </View>
                    ) : (
                      <SortableTaskList
                        tasks={tasks}
                        theme={theme}
                        removingId={removingId}
                        onExited={handleExited}
                        onToggle={handleToggle}
                        onEdit={openEdit}
                        onDelete={setDeletingTask}
                        onReorder={handleReorder}
                        onCreateReminder={onCreateReminder}
                        setDragging={setIsDragging}
                      />
                    )}
                  </Animated.View>
                </ScrollView>
              </View>
            </>
          )}

          <TaskModal
            // key muda a cada abertura → o modal REMONTA do zero, e seus campos
            // (useState inicializado do task) nascem com o valor fresco. É o que
            // mata de vez o "descrição não atualiza": componente novo, sem estado
            // velho e sem buffer nativo dessincronizado.
            key={openNonce}
            visible={modalVisible}
            task={editingTask}
            onSave={handleSave}
            onClose={() => { setModalVisible(false); setEditingTaskId(null); }}
            theme={theme}
          />
          <ReminderFormModal
            visible={!!reminderDraft}
            reminder={reminderDraft}
            isNew
            onSave={handleCreateReminder}
            onClose={() => setReminderDraft(null)}
            theme={theme}
          />
          <ConfirmDialog
            visible={!!deletingTask}
            title={t('tasks.deleteTitle')}
            message={deletingTask ? t('tasks.deleteMessage', { name: deletingTask.name }) : ''}
            confirmText={t('common.delete')}
            destructive
            onCancel={() => setDeletingTask(null)}
            onConfirm={confirmDelete}
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
    headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    dateBlock: { alignItems: 'center', paddingTop: 10 },
    todayDate: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, fontFamily: 'System', textAlign: 'center' },
    editHint: { fontSize: 12, color: theme.textSecondary, fontFamily: 'System', textAlign: 'center', paddingVertical: 8, fontStyle: 'italic' },
    listWrap: { flex: 1, position: 'relative' },
    refreshOverlay: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
    listContent: { paddingTop: 6, paddingBottom: 32 },
    newBtnWrap: { paddingHorizontal: 16, marginBottom: 16 },
    newBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    newBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'System' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyBox: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
    emptyText: { fontSize: 16, color: theme.textSecondary, fontFamily: 'System', textAlign: 'center' },
    emptySubtext: { fontSize: 14, color: theme.textPlaceholder, fontFamily: 'System', marginTop: 8, textAlign: 'center' },
    errorText: { fontSize: 15, color: theme.error, fontFamily: 'System', textAlign: 'center', paddingHorizontal: 24 },
    retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: 8 },
    retryButtonText: { color: theme.primary, fontSize: 14, fontWeight: '600', fontFamily: 'System' },
  });
}
