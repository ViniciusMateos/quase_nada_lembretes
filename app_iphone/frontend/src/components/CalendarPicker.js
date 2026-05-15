import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const WEEK_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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
  const today = new Date();
  const [viewYear, setViewYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate ? selectedDate.getMonth() : today.getMonth());

  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cells = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={prevMonth} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navText}>{'‹'}</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{MONTHS_PT[viewMonth]} {viewYear}</Text>
        <Pressable onPress={nextMonth} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navText}>{'›'}</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEK_DAYS.map((d, i) => (
          <Text key={i} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
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
      </View>
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
