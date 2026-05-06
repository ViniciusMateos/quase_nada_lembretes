import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import ChevronIcon from '../components/ChevronIcon';
import PressableScale from '../components/PressableScale';

export default function AccountScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const screenTranslateX = useRef(new Animated.Value(0)).current;
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const handleGoBack = () => {
    Animated.timing(screenTranslateX, {
      toValue: Dimensions.get('window').width,
      duration: 260,
      useNativeDriver: true,
    }).start(() => navigation.goBack());
  };

  const handleLogout = () => {
    setConfirmLogoutVisible(true);
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

      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
        </View>
        <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
        <Text style={styles.userEmail}>{user?.email || ''}</Text>
      </View>

      <View style={styles.section}>
        <PressableScale
          style={styles.menuItem}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <Text style={styles.menuItemText}>Alterar senha</Text>
          <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
        </PressableScale>
      </View>

      <View style={styles.logoutSection}>
        <PressableScale style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sair</Text>
        </PressableScale>
      </View>

      <ConfirmDialog
        visible={confirmLogoutVisible}
        title="Sair da conta"
        message="Tem certeza que deseja sair?"
        confirmText="Sair"
        destructive
        onCancel={() => setConfirmLogoutVisible(false)}
        onConfirm={() => {
          setConfirmLogoutVisible(false);
          logout();
        }}
      />
      </Animated.View>
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
    backButton: {
      width: 44,
      textAlign: 'center',
    },
    profileSection: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    avatarContainer: {
      marginBottom: 16,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 32,
      fontWeight: '700',
      color: '#FFFFFF',
      fontFamily: 'System',
    },
    userName: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.textPrimary,
      fontFamily: 'System',
      marginBottom: 4,
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
  });
}
