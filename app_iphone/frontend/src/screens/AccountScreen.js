import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { deleteAccount as apiDeleteAccount } from '../api/auth.api';
import ConfirmDialog from '../components/ConfirmDialog';
import ChevronIcon from '../components/ChevronIcon';
import LoadingDog from '../components/LoadingDog';
import PasswordVisibilityIcon from '../components/PasswordVisibilityIcon';
import PressableScale from '../components/PressableScale';

const AVATAR_COLORS = [
  '#FF8234', '#6366F1', '#8B5CF6',
  '#EC4899', '#14B8A6', '#10B981',
  '#3B82F6', '#EF4444', '#64748B',
];

// Smooth expand/collapse with height + opacity driven by a single progress value
function AnimatedExpand({ visible, children, expandedHeight = 300 }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (mountedRef.current) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          mountedRef.current = false;
          setMounted(false);
        }
      });
    }
  }, [visible]);

  if (!mounted) return null;
  return (
    <Animated.View
      style={{
        maxHeight: progress.interpolate({ inputRange: [0, 1], outputRange: [0, expandedHeight] }),
        opacity: progress,
        overflow: 'hidden',
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function AccountScreen({ navigation }) {
  const { user, logout, savedAccounts, removeSavedAccount, updateSavedAccount } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const screenTranslateX = useRef(new Animated.Value(0)).current;
  const avatarOpacity = useRef(new Animated.Value(1)).current;

  // Delete modal animation
  const deleteOverlayOpacity = useRef(new Animated.Value(0)).current;
  const deleteSheetEntry = useRef(new Animated.Value(400)).current;
  const deleteKeyboardOffset = useRef(new Animated.Value(0)).current;

  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentAccount = savedAccounts.find(a => a.email === user?.email);
  const avatarColor = currentAccount?.color || AVATAR_COLORS[0];

  const closeDeleteSheetRef = useRef(null);

  const openDeleteSheet = () => {
    deleteOverlayOpacity.setValue(0);
    deleteSheetEntry.setValue(400);
    setDeletePassword('');
    setDeleteError(null);
    setShowDeletePassword(false);
    setDeleteSheetVisible(true);
    Animated.parallel([
      Animated.timing(deleteOverlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(deleteSheetEntry, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
    ]).start();
  };

  const closeDeleteSheet = () => {
    Keyboard.dismiss();
    deleteKeyboardOffset.setValue(0);
    Animated.parallel([
      Animated.timing(deleteOverlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(deleteSheetEntry, { toValue: 400, duration: 200, useNativeDriver: true }),
    ]).start(() => setDeleteSheetVisible(false));
  };

  closeDeleteSheetRef.current = closeDeleteSheet;

  useEffect(() => {
    if (!deleteSheetVisible) return;
    const show = Keyboard.addListener('keyboardWillShow', e => {
      Animated.timing(deleteKeyboardOffset, {
        toValue: -e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      Animated.timing(deleteKeyboardOffset, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [deleteSheetVisible, deleteKeyboardOffset]);

  const deletePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && gs.vy >= 0,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          deleteSheetEntry.setValue(gs.dy);
          deleteOverlayOpacity.setValue(Math.max(0, 1 - gs.dy / 300));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          closeDeleteSheetRef.current?.();
        } else {
          Animated.parallel([
            Animated.spring(deleteSheetEntry, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
            Animated.timing(deleteOverlayOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const handleGoBack = () => {
    Animated.timing(screenTranslateX, {
      toValue: Dimensions.get('window').width,
      duration: 260,
      useNativeDriver: true,
    }).start(() => navigation.goBack());
  };

  const handleColorSelect = (color) => {
    Animated.timing(avatarOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      updateSavedAccount(user.email, { color });
      setColorPickerVisible(false);
      Animated.timing(avatarOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError('Digite sua senha'); return; }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiDeleteAccount({ email: user.email, password: deletePassword });
      closeDeleteSheet();
      removeSavedAccount(user.email);
      logout();
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401) setDeleteError('Senha incorreta');
      else if (!error?.response) setDeleteError('Sem conexão com o servidor');
      else setDeleteError('Erro ao excluir conta. Tente novamente');
      setDeletePassword('');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[styles.screen, { transform: [{ translateX: screenTranslateX }] }]}>
        <View style={styles.header}>
          <PressableScale onPress={handleGoBack} hitSlop={{ top: 10, bottom: 10, left: 18, right: 18 }}>
            <ChevronIcon color={theme.primary} size={38} style={styles.backButton} />
          </PressableScale>
          <Text style={styles.headerTitle}>Conta</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setColorPickerVisible(false)}
        >
          <Pressable onPress={() => colorPickerVisible && setColorPickerVisible(false)}>
            <View style={styles.profileSection}>
              {/* Avatar centered, pencil absolutely positioned */}
              <View style={styles.avatarContainer}>
                <Animated.View style={[styles.avatar, { backgroundColor: avatarColor, opacity: avatarOpacity }]}>
                  <Image
                    source={require('../../assets/logo.png')}
                    style={styles.avatarLogo}
                  />
                </Animated.View>
                <PressableScale
                  style={[styles.editColorBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setColorPickerVisible(v => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Image
                    source={require('../../assets/lapis-icon.png')}
                    style={[styles.editColorIcon, { tintColor: theme.textSecondary }]}
                  />
                </PressableScale>
              </View>

              {/* Color picker — slides down when visible, slides up when hidden */}
              <AnimatedExpand visible={colorPickerVisible} expandedHeight={210}>
                <View
                  style={[styles.colorPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onStartShouldSetResponder={() => true}
                >
                  {[0, 1, 2].map(row => (
                    <View key={row} style={styles.colorRow}>
                      {AVATAR_COLORS.slice(row * 3, row * 3 + 3).map(color => (
                        <PressableScale
                          key={color}
                          style={[
                            styles.swatch,
                            { backgroundColor: color },
                            avatarColor === color && styles.swatchSelected,
                          ]}
                          onPress={() => handleColorSelect(color)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </AnimatedExpand>

              <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
            </View>

            <View style={styles.section}>
              <PressableScale style={styles.menuItem} onPress={() => navigation.navigate('ChangePassword')}>
                <Text style={styles.menuItemText}>Alterar senha</Text>
                <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
              </PressableScale>
              <View style={styles.divider} />
              <PressableScale style={styles.menuItem} onPress={openDeleteSheet}>
                <Text style={[styles.menuItemText, { color: theme.error }]}>Excluir conta</Text>
                <ChevronIcon direction="right" color={theme.error} size={26} />
              </PressableScale>
            </View>

            <View style={styles.logoutSection}>
              <PressableScale style={styles.logoutButton} onPress={() => setConfirmLogoutVisible(true)}>
                <Text style={styles.logoutButtonText}>Sair</Text>
              </PressableScale>
            </View>
          </Pressable>
        </ScrollView>

        <ConfirmDialog
          visible={confirmLogoutVisible}
          title="Sair da conta"
          message="Tem certeza que deseja sair?"
          confirmText="Sair"
          destructive
          onCancel={() => setConfirmLogoutVisible(false)}
          onConfirm={() => { setConfirmLogoutVisible(false); logout(); }}
        />
      </Animated.View>

      {/* Delete account modal — fade overlay + spring sheet, no native slide */}
      <Modal
        visible={deleteSheetVisible}
        transparent
        animationType="none"
        onRequestClose={() => !isDeleting && closeDeleteSheet()}
      >
        <Animated.View style={[styles.deleteOverlayContainer, { opacity: deleteOverlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !isDeleting && closeDeleteSheet()} />
          <Animated.View
            style={[
              styles.deleteSheet,
              { backgroundColor: theme.surface, transform: [{ translateY: Animated.add(deleteSheetEntry, deleteKeyboardOffset) }] },
            ]}
          >
            <View style={styles.sheetHandle} {...deletePanResponder.panHandlers}>
              <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>
            <View>
              <Text style={[styles.deleteTitle, { color: theme.textPrimary }]}>Excluir conta</Text>
              <Text style={[styles.deleteWarning, { color: theme.textSecondary }]}>
                Esta ação é irreversível. Todos os seus lembretes e dados serão permanentemente apagados.
              </Text>

              {deleteError ? (
                <Text style={[styles.deleteErrorText, { color: theme.error }]}>{deleteError}</Text>
              ) : null}

              <View style={[styles.inputWrapper, { backgroundColor: theme.surface2, borderColor: deleteError ? theme.error : theme.border }]}>
                <TextInput
                  style={[styles.inputInner, { color: theme.textPrimary }]}
                  placeholder="Confirme sua senha"
                  placeholderTextColor={theme.textPlaceholder}
                  value={deletePassword}
                  onChangeText={t => { setDeletePassword(t); if (deleteError) setDeleteError(null); }}
                  secureTextEntry={!showDeletePassword}
                  editable={!isDeleting}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleDeleteAccount}
                />
                <PressableScale
                  onPress={() => setShowDeletePassword(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ paddingRight: 14 }}
                >
                  <PasswordVisibilityIcon hidden={showDeletePassword} color={theme.textPlaceholder} />
                </PressableScale>
              </View>

              <View style={styles.deleteActions}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <PressableScale
                    style={[styles.cancelBtn, { backgroundColor: theme.surface2, borderColor: theme.border }]}
                    onPress={closeDeleteSheet}
                    disabled={isDeleting}
                  >
                    <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>Cancelar</Text>
                  </PressableScale>
                </View>
                <View style={{ flex: 1 }}>
                  <PressableScale
                    style={[styles.confirmDeleteBtn, isDeleting && { opacity: 0.6 }]}
                    onPress={handleDeleteAccount}
                    disabled={isDeleting}
                  >
                    {isDeleting
                      ? <LoadingDog size={28} color="#FFFFFF" />
                      : <Text style={styles.confirmDeleteBtnText}>Excluir</Text>
                    }
                  </PressableScale>
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    screen: { flex: 1, backgroundColor: theme.background },
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
    backButton: { width: 44, textAlign: 'center' },
    content: { paddingBottom: 40 },
    profileSection: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    // Avatar is self-sized (88×88); pencil is absolute so avatar stays truly centered
    avatarContainer: {
      marginBottom: 8,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLogo: {
      width: 52,
      height: 52,
      resizeMode: 'contain',
      tintColor: '#FFFFFF',
    },
    editColorBtn: {
      position: 'absolute',
      bottom: 0,
      right: -8,
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editColorIcon: { width: 14, height: 14, resizeMode: 'contain' },
    colorPicker: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
      marginTop: 2,
      marginBottom: 4,
      rowGap: 12,
    },
    colorRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      columnGap: 14,
    },
    swatch: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    swatchSelected: {
      borderWidth: 3,
      borderColor: '#FFFFFF',
      transform: [{ scale: 1.12 }],
    },
    userName: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 4,
      marginTop: 12,
    },
    userEmail: {
      fontSize: 15,
      color: theme.textSecondary,
      fontFamily: 'System',
    },
    section: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    menuItemText: {
      fontSize: 16,
      color: theme.textPrimary,
      fontFamily: 'System',
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 16,
    },
    logoutSection: {
      marginHorizontal: 16,
      marginTop: 24,
    },
    logoutButton: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderWidth: 1,
      borderColor: '#EF4444',
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: '#EF4444',
      fontSize: 17,
      fontWeight: '700',
      fontFamily: 'System',
    },
    // Delete modal
    deleteOverlayContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    deleteSheet: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 24,
      paddingBottom: 44,
    },
    sheetHandle: {
      paddingTop: 12,
      paddingBottom: 10,
      alignItems: 'center',
      paddingHorizontal: 60,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
    },
    deleteTitle: {
      fontSize: 20,
      fontWeight: '700',
      fontFamily: 'System',
      marginBottom: 10,
    },
    deleteWarning: {
      fontSize: 14,
      fontFamily: 'System',
      lineHeight: 20,
      marginBottom: 16,
    },
    deleteErrorText: {
      fontSize: 13,
      fontFamily: 'System',
      marginBottom: 8,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 50,
      marginBottom: 20,
    },
    inputInner: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: 'System',
    },
    deleteActions: {
      flexDirection: 'row',
    },
    cancelBtn: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    cancelBtnText: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'System',
    },
    confirmDeleteBtn: {
      backgroundColor: '#EF4444',
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    confirmDeleteBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      fontFamily: 'System',
    },
  });
}
