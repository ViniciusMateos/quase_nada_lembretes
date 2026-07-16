import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import PressableScale from './PressableScale';
import { useI18n } from '../i18n';
import { mesesCap } from '../utils/dateUtils';

// Iniciais dos dias (domingo → sábado) e nomes dos meses saem do idioma ativo:
// nada de array congelado no import.

function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: month - 1, year: month === 0 ? year - 1 : year, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, outside: false });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, month: month + 1, year: month === 11 ? year + 1 : year, outside: true });
  }
  return cells;
}

function isSameDay(cell, date) {
  if (!date) return false;
  return cell.day === date.getDate() && cell.month === date.getMonth() && cell.year === date.getFullYear();
}

function isToday(cell) {
  const t = new Date();
  return cell.day === t.getDate() && cell.month === t.getMonth() && cell.year === t.getFullYear();
}

export default function CalendarPicker({ selectedDate, onSelect, theme }) {
  const { t, lang, progresso } = useI18n();
  const today = new Date();
  const [viewYear, setViewYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate ? selectedDate.getMonth() : today.getMonth());

  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cells = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekDays = useMemo(() => t('reminders.cal.weekDayInitials').split(','), [t, lang, progresso]);
  const monthNames = useMemo(() => mesesCap(), [lang, progresso]);

  // Slide direcional ao trocar de mês: avançar = conteúdo sai pra esquerda e o
  // novo entra da direita; voltar = o oposto. (Animated core, padrão do app.)
  const slideX = useRef(new Animated.Value(0)).current;
  const gridOpacity = useRef(new Animated.Value(1)).current;
  const animatingRef = useRef(false);

  const changeMonth = direction => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    Animated.parallel([
      Animated.timing(slideX, { toValue: -direction * 26, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(gridOpacity, { toValue: 0, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      if (direction > 0) {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
      } else {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
      }
      slideX.setValue(direction * 26);
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
        Animated.timing(gridOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => { animatingRef.current = false; });
    });
  };

  const prevMonth = () => changeMonth(-1);
  const nextMonth = () => changeMonth(1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <PressableScale onPress={prevMonth} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navText}>{'‹'}</Text>
        </PressableScale>
        <Text style={styles.monthTitle}>{monthNames[viewMonth]} {viewYear}</Text>
        <PressableScale onPress={nextMonth} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navText}>{'›'}</Text>
        </PressableScale>
      </View>

      <View style={styles.weekRow}>
        {weekDays.map((d, i) => (
          <Text key={i} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      <Animated.View style={[styles.grid, { transform: [{ translateX: slideX }], opacity: gridOpacity }]}>
        {cells.map((cell, idx) => {
          const selected = isSameDay(cell, selectedDate);
          const today_ = isToday(cell);
          return (
            <Pressable
              key={idx}
              style={[styles.cell, selected && styles.cellSelected]}
              onPress={() => {
                if (!cell.outside) {
                  onSelect(new Date(cell.year, cell.month, cell.day));
                }
              }}
              hitSlop={2}
            >
              <Text
                style={[
                  styles.cellText,
                  cell.outside && styles.cellOutside,
                  selected && styles.cellTextSelected,
                  today_ && !selected && styles.cellToday,
                ]}
              >
                {cell.day}
              </Text>
              {today_ && !selected ? <View style={styles.todayDot} /> : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

function makeStyles(theme) {
  const CELL_SIZE = 36;
  return StyleSheet.create({
    container: {
      marginTop: 8,
      backgroundColor: theme.surface2,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    navBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navText: {
      fontSize: 24,
      color: theme.primary,
      fontWeight: '600',
      lineHeight: 28,
    },
    monthTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekDay: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    cell: {
      width: `${100 / 7}%`,
      height: CELL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellSelected: {
      backgroundColor: theme.primary,
      borderRadius: CELL_SIZE / 2,
    },
    cellText: {
      fontSize: 14,
      color: theme.textPrimary,
      fontFamily: 'System',
      fontWeight: '400',
    },
    cellOutside: {
      color: theme.textPlaceholder,
    },
    cellTextSelected: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    cellToday: {
      color: theme.primary,
      fontWeight: '600',
    },
    todayDot: {
      position: 'absolute',
      bottom: 3,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.primary,
    },
  });
}
