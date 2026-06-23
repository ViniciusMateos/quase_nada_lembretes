import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const ROW_H = 64; // altura fixa de cada linha (base do cálculo do drag)
const PRIORITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' };

function SortableRow({
  task,
  index,
  translateY,
  tasksRef,
  draggingIdRef,
  repositionSiblings,
  theme,
  onToggle,
  onEdit,
  onDelete,
  onReorder,
  onCreateReminder,
  setDragging,
  removing,
  onExited,
}) {
  const styles = useMemo(() => makeItemStyles(theme), [theme]);
  const color = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;

  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current; // entrada com fade-in
  const hintAnim = useRef(new Animated.Value(0)).current; // entrada do balão
  const [lifted, setLifted] = useState(false);
  const [showHint, setShowHint] = useState(false); // balão "criar lembrete"

  const indexRef = useRef(index);
  indexRef.current = index;
  const drag = useRef({ active: false, moved: false, timer: null, from: 0, base: 0, gStart: 0, gEnd: 0, hover: 0 }).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [opacity]);

  useEffect(() => {
    if (showHint) {
      hintAnim.setValue(0);
      Animated.spring(hintAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 11 }).start();
    }
  }, [showHint, hintAnim]);

  useEffect(() => {
    if (removing) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.82, duration: 220, useNativeDriver: true }),
      ]).start(() => onExited(task.id));
    }
  }, [removing, opacity, scale, onExited, task.id]);

  const resetToSlot = () => {
    Animated.spring(translateY, { toValue: indexRef.current * ROW_H, useNativeDriver: true, tension: 120, friction: 14 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 300, friction: 12 }).start();
        if (task.completed) return;
        drag.timer = setTimeout(() => {
          const list = tasksRef.current;
          const i = indexRef.current;
          const p = list[i]?.priority;
          let s = i;
          let e = i;
          while (s - 1 >= 0 && !list[s - 1].completed && list[s - 1].priority === p) s -= 1;
          while (e + 1 < list.length && !list[e + 1].completed && list[e + 1].priority === p) e += 1;
          drag.active = true;
          drag.moved = false;
          drag.from = i;
          drag.base = i * ROW_H;
          drag.gStart = s;
          drag.gEnd = e;
          drag.hover = i;
          draggingIdRef.current = task.id;
          setLifted(true);
          setShowHint(true); // segurou parado → mostra "criar lembrete"
          setDragging(true);
          Animated.spring(scale, { toValue: 1.04, useNativeDriver: true }).start();
        }, 200);
      },
      onPanResponderMove: (_, g) => {
        if (drag.active) {
          translateY.setValue(drag.base + g.dy);
          if (!drag.moved && Math.abs(g.dy) > 6) {
            drag.moved = true; // mexeu → vira reorder, some o balão
            setShowHint(false);
          }
          const hover = Math.min(Math.max(Math.round((drag.base + g.dy) / ROW_H), drag.gStart), drag.gEnd);
          if (hover !== drag.hover) {
            drag.hover = hover;
            repositionSiblings(task.id, drag.from, hover);
          }
        } else if (Math.abs(g.dy) > 8 || Math.abs(g.dx) > 8) {
          clearTimeout(drag.timer);
        }
      },
      onPanResponderTerminationRequest: () => !drag.active,
      onPanResponderRelease: (_, g) => {
        clearTimeout(drag.timer);
        if (drag.active) {
          const from = drag.from;
          const target = drag.hover;
          const wasMoved = drag.moved;
          drag.active = false;
          drag.moved = false;
          setLifted(false);
          setShowHint(false);
          setDragging(false);
          draggingIdRef.current = null;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
          if (wasMoved) {
            if (target !== from) onReorder(from, target);
            else resetToSlot();
          } else {
            // segurou parado e soltou → criar lembrete a partir da tarefa
            resetToSlot();
            onCreateReminder?.(task);
          }
        } else {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
          if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) onEdit(task);
        }
      },
      onPanResponderTerminate: () => {
        clearTimeout(drag.timer);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        if (drag.active) {
          drag.active = false;
          drag.moved = false;
          setLifted(false);
          setShowHint(false);
          setDragging(false);
          draggingIdRef.current = null;
          resetToSlot();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.rowAbs, lifted && styles.rowLifted, { opacity, transform: [{ translateY }, { scale }] }]}
      {...pan.panHandlers}
    >
      {showHint && (
        <Animated.View
          style={[
            styles.hintBalloon,
            {
              opacity: hintAnim,
              transform: [
                { scale: hintAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                { translateY: hintAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.hintBalloonText}>Soltar para criar lembrete</Text>
        </Animated.View>
      )}
      <View style={[styles.item, { borderLeftColor: color, backgroundColor: color + '14' }, task.completed && styles.itemCompleted]}>
        <TouchableOpacity
          style={[styles.checkbox, task.completed ? { backgroundColor: color, borderColor: color } : { borderColor: theme.border }]}
          onPress={() => onToggle(task)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.completed }}
        >
          {task.completed && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        <Text style={[styles.name, task.completed && styles.nameCompleted]} numberOfLines={1}>
          {task.name}
        </Text>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(task)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Excluir tarefa ${task.name}`}
        >
          <Text style={styles.deleteX}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export default function SortableTaskList({
  tasks,
  theme,
  onToggle,
  onEdit,
  onDelete,
  onReorder,
  onCreateReminder,
  setDragging,
  removingId,
  onExited,
}) {
  const anims = useRef(new Map()).current;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const draggingIdRef = useRef(null);

  tasks.forEach((t, i) => {
    if (!anims.has(t.id)) anims.set(t.id, new Animated.Value(i * ROW_H));
  });

  useEffect(() => {
    const ids = new Set(tasks.map(t => t.id));
    tasks.forEach((t, i) => {
      if (t.id === draggingIdRef.current) return;
      const a = anims.get(t.id);
      if (a) Animated.spring(a, { toValue: i * ROW_H, useNativeDriver: true, tension: 120, friction: 14 }).start();
    });
    anims.forEach((_, id) => { if (!ids.has(id)) anims.delete(id); });
  }, [tasks, anims]);

  const repositionSiblings = (draggingId, fromIndex, hoverIndex) => {
    const list = tasksRef.current;
    list.forEach((t, j) => {
      if (t.id === draggingId) return;
      let slot = j;
      if (hoverIndex > fromIndex && j > fromIndex && j <= hoverIndex) slot = j - 1;
      else if (hoverIndex < fromIndex && j >= hoverIndex && j < fromIndex) slot = j + 1;
      const a = anims.get(t.id);
      if (a) Animated.spring(a, { toValue: slot * ROW_H, useNativeDriver: true, tension: 160, friction: 18 }).start();
    });
  };

  return (
    <View style={{ height: tasks.length * ROW_H }}>
      {tasks.map((t, i) => (
        <SortableRow
          key={t.id}
          task={t}
          index={i}
          translateY={anims.get(t.id)}
          tasksRef={tasksRef}
          draggingIdRef={draggingIdRef}
          repositionSiblings={repositionSiblings}
          theme={theme}
          removing={removingId === t.id}
          onExited={onExited}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
          onCreateReminder={onCreateReminder}
          setDragging={setDragging}
        />
      ))}
    </View>
  );
}

function makeItemStyles(theme) {
  return StyleSheet.create({
    rowAbs: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: ROW_H,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    rowLifted: {
      zIndex: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.45 : 0.2,
      shadowRadius: 14,
      elevation: 12,
    },
    hintBalloon: {
      position: 'absolute',
      top: -14,
      alignSelf: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      zIndex: 30,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 8,
    },
    hintBalloonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontFamily: 'System' },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderLeftWidth: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: theme.surface,
    },
    itemCompleted: { opacity: 0.5 },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 7,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkmark: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', lineHeight: 18 },
    name: { flex: 1, marginHorizontal: 14, fontSize: 16, color: theme.textPrimary, fontFamily: 'System' },
    nameCompleted: { textDecorationLine: 'line-through', color: theme.textSecondary },
    deleteBtn: { padding: 4 },
    deleteX: { fontSize: 16, color: theme.textSecondary },
  });
}
