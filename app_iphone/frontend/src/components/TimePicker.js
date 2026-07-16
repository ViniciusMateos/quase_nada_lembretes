import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) =>
    String(start + i).padStart(2, '0'),
  );
}

function Column({ values, selectedIndex, onSelect, theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (scrollRef.current && selectedIndex >= 0) {
      scrollRef.current.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback(
    event => {
      const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, values.length - 1));
      isScrolling.current = false;
      onSelect(clamped);
    },
    [onSelect, values.length],
  );

  return (
    <View style={styles.column}>
      <View style={styles.selectionLine} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        scrollEventThrottle={16}
      >
        {values.map((val, idx) => (
          <View key={val} style={styles.item}>
            <Text
              style={[
                styles.itemText,
                idx === selectedIndex && styles.itemTextSelected,
              ]}
            >
              {val}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
    </View>
  );
}

export default function TimePicker({ value, onChange, is12h, theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const hours = is12h ? range(1, 12) : range(0, 23);
  const minutes = range(0, 59);
  const periods = ['AM', 'PM'];

  const hourIndex = is12h
    ? Math.max(0, hours.indexOf(String(value.hours).padStart(2, '0')))
    : Math.max(0, value.hours);

  const minuteIndex = Math.max(0, value.minutes);

  const periodIndex = value.period === 'PM' ? 1 : 0;

  const onHourSelect = useCallback(
    idx => onChange({ ...value, hours: parseInt(hours[idx], 10) }),
    [hours, onChange, value],
  );
  const onMinuteSelect = useCallback(
    idx => onChange({ ...value, minutes: idx }),
    [onChange, value],
  );
  const onPeriodSelect = useCallback(
    idx => onChange({ ...value, period: periods[idx] }),
    [onChange, periods, value],
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Column
          values={hours}
          selectedIndex={hourIndex}
          onSelect={onHourSelect}
          theme={theme}
        />
        <Text style={styles.colon}>:</Text>
        <Column
          values={minutes}
          selectedIndex={minuteIndex}
          onSelect={onMinuteSelect}
          theme={theme}
        />
        {is12h ? (
          <Column
            values={periods}
            selectedIndex={periodIndex}
            onSelect={onPeriodSelect}
            theme={theme}
          />
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      marginTop: 8,
      backgroundColor: theme.surface2,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: PICKER_HEIGHT,
      paddingHorizontal: 16,
    },
    column: {
      width: 64,
      height: PICKER_HEIGHT,
      overflow: 'hidden',
      position: 'relative',
    },
    item: {
      height: ITEM_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemText: {
      fontSize: 22,
      color: theme.textSecondary,
      fontFamily: 'System',
      fontWeight: '400',
    },
    itemTextSelected: {
      color: theme.textPrimary,
      fontWeight: '700',
      fontSize: 24,
    },
    selectionLine: {
      position: 'absolute',
      top: ITEM_HEIGHT,
      left: 4,
      right: 4,
      height: ITEM_HEIGHT,
      borderTopWidth: 1.5,
      borderBottomWidth: 1.5,
      borderColor: theme.primary,
      borderRadius: 4,
      backgroundColor: theme.isDark ? 'rgba(10,132,255,0.10)' : 'rgba(10,132,255,0.07)',
      zIndex: 1,
    },
    fadeTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: ITEM_HEIGHT,
      backgroundColor: theme.surface2,
      opacity: 0.85,
      zIndex: 2,
    },
    fadeBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: ITEM_HEIGHT,
      backgroundColor: theme.surface2,
      opacity: 0.85,
      zIndex: 2,
    },
    colon: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.textPrimary,
      marginHorizontal: 4,
      marginBottom: 4,
    },
  });
}
