import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  MESES_ABREV_CAP,
  MESES_CAP,
  MESES_CURTOS,
  getMonday,
  getWeekRangeLabel,
  getWeeksForMonth,
} from '../utils/dateUtils';

const GRID_GAP = 10;

export default function WeekNavigator({ currentDate, onChangeWeek, onSetAbsoluteDate, theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerView, setPickerView] = useState('weeks'); // 'weeks' | 'months' | 'years'
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState(currentDate.getMonth());
  const [gridW, setGridW] = useState(0);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const viewAnim = useRef(new Animated.Value(1)).current; // transição entre ano/mês/semana

  // Referência de "hoje" pra destacar ano/mês/semana atuais no picker.
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayMondayTime = getMonday(today).getTime();

  useEffect(() => {
    if (isPickerOpen) {
      overlayOpacity.setValue(0);
      cardScale.setValue(0.92);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 9 }),
      ]).start();
    }
  }, [isPickerOpen, overlayOpacity, cardScale]);

  // Anima a troca entre as telas do picker (some/aparece com fade + leve zoom).
  useEffect(() => {
    viewAnim.setValue(0);
    Animated.timing(viewAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [pickerView, viewAnim]);

  const openPicker = () => {
    setPickerYear(currentDate.getFullYear());
    setPickerMonth(currentDate.getMonth());
    setPickerView('weeks');
    setIsPickerOpen(true);
  };

  const closePicker = () => {
    Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
      .start(() => setIsPickerOpen(false));
  };

  const handleSelectWeek = monday => {
    onSetAbsoluteDate(monday);
    closePicker();
  };

  const cellW = gridW > 0 ? Math.floor((gridW - GRID_GAP * 2) / 3) : 0;

  const renderGrid = items => (
    <View style={styles.grid} onLayout={e => setGridW(e.nativeEvent.layout.width)}>
      {cellW > 0 && items.map(it => (
        <Pressable
          key={it.key}
          style={({ pressed }) => [
            styles.gridCell,
            { width: cellW },
            it.isToday && !it.active && styles.gridCellToday,
            it.active && styles.gridCellActive,
            pressed && styles.pressedScale,
          ]}
          onPress={it.onPress}
        >
          <Text
            style={[
              styles.gridCellText,
              it.isToday && !it.active && styles.gridCellTextToday,
              it.active && styles.gridCellTextActive,
            ]}
          >
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderContent = () => {
    if (pickerView === 'years') {
      const years = Array.from({ length: 12 }, (_, i) => pickerYear - 4 + i);
      return renderGrid(
        years.map(y => ({
          key: String(y),
          label: String(y),
          active: y === pickerYear,
          isToday: y === todayYear,
          onPress: () => { setPickerYear(y); setPickerView('months'); },
        })),
      );
    }

    if (pickerView === 'months') {
      return renderGrid(
        MESES_ABREV_CAP.map((m, i) => ({
          key: m,
          label: m,
          active: i === pickerMonth,
          isToday: i === todayMonth && pickerYear === todayYear,
          onPress: () => { setPickerMonth(i); setPickerView('weeks'); },
        })),
      );
    }

    // weeks
    const weeks = getWeeksForMonth(pickerYear, pickerMonth);
    const currentMonday = getMonday(currentDate).getTime();
    return (
      <View>
        {weeks.map((w, i) => {
          const selected = w.monday.getTime() === currentMonday;
          const isToday = w.monday.getTime() === todayMondayTime;
          const range = `${w.monday.getDate()} ${MESES_CURTOS[w.monday.getMonth()]} - ${w.sunday.getDate()} ${MESES_CURTOS[w.sunday.getMonth()]}`;
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.weekRow,
                isToday && !selected && styles.weekRowToday,
                selected && styles.weekRowSelected,
                pressed && styles.pressedScale,
              ]}
              onPress={() => handleSelectWeek(w.monday)}
            >
              <Text style={[styles.weekRowTitle, selected && styles.weekRowTitleSelected]}>
                Semana {i + 1}{isToday ? '  · hoje' : ''}
              </Text>
              <Text style={styles.weekRowRange}>{range}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <View style={styles.bar}>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressedScale]}
          onPress={() => onChangeWeek(-7)}
          accessibilityLabel="Semana anterior"
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.rangeWrap, pressed && styles.pressedScale]}
          onPress={openPicker}
          accessibilityLabel="Escolher semana"
        >
          <Text style={styles.rangeText} numberOfLines={1}>{getWeekRangeLabel(currentDate)}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, pressed && styles.pressedScale]}
          onPress={() => onChangeWeek(7)}
          accessibilityLabel="Próxima semana"
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <Modal visible={isPickerOpen} transparent animationType="none" onRequestClose={closePicker}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                {pickerView === 'years' ? (
                  <Text style={styles.headerTitle}>Selecione o ano</Text>
                ) : (
                  <Pressable onPress={() => setPickerView('years')} hitSlop={6}>
                    <Text style={styles.headerYear}>{pickerYear}</Text>
                  </Pressable>
                )}
                {pickerView === 'weeks' && (
                  <>
                    <Text style={styles.headerDot}>•</Text>
                    <Pressable onPress={() => setPickerView('months')} hitSlop={6}>
                      <Text style={styles.headerMonth}>{MESES_CAP[pickerMonth]}</Text>
                    </Pressable>
                  </>
                )}
                {pickerView === 'months' && (
                  <>
                    <Text style={styles.headerDot}>•</Text>
                    <Text style={styles.headerTitle}>Selecione o mês</Text>
                  </>
                )}
              </View>
              <Pressable onPress={closePicker} hitSlop={10}>
                <Text style={styles.closeX}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardBody}>
              <Animated.View
                style={{
                  opacity: viewAnim,
                  transform: [{ scale: viewAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
                }}
              >
                {renderContent()}
              </Animated.View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    pressedScale: { transform: [{ scale: 0.95 }], opacity: 0.85 },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 6,
      paddingVertical: 6,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    arrowBtn: { width: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    arrow: { fontSize: 26, color: theme.textSecondary, fontWeight: '700', lineHeight: 28 },
    rangeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rangeText: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System', textAlign: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '78%',
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 8,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    headerYear: { fontSize: 18, fontWeight: '700', color: theme.textSecondary, fontFamily: 'System' },
    headerMonth: { fontSize: 18, fontWeight: '700', color: theme.primary, fontFamily: 'System' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.primary, fontFamily: 'System' },
    headerDot: { fontSize: 16, color: theme.textPlaceholder, marginHorizontal: 8 },
    closeX: { fontSize: 18, color: theme.textSecondary, fontWeight: '600', paddingLeft: 8 },
    cardScroll: { flexGrow: 0 },
    cardBody: { paddingBottom: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    gridCell: {
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: GRID_GAP,
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    gridCellActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    gridCellToday: { borderColor: theme.primary, borderWidth: 2 },
    gridCellText: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System' },
    gridCellTextActive: { color: '#FFFFFF' },
    gridCellTextToday: { color: theme.primary },
    weekRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 12,
      marginBottom: 10,
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    weekRowToday: { borderColor: theme.primary, borderWidth: 2 },
    weekRowSelected: { borderColor: theme.primary, borderWidth: 2, backgroundColor: theme.primary + '1A' },
    weekRowTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System' },
    weekRowTitleSelected: { color: theme.primary },
    weekRowRange: { fontSize: 13, color: theme.textSecondary, fontFamily: 'System' },
  });
}
