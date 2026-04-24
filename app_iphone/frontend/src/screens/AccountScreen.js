import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AccountScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const handleLogout = () => {
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: logout },
      ],
      { userInterfaceStyle: theme.isDark ? 'dark' : 'light' },
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
          <Text style={styles.backButton}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conta</Text>
        <View style={{ width: 60 }} />
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
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('ChangePassword')}
          activeOpacity={0.7}
        >
          <Text style={styles.menuItemText}>Alterar senha</Text>
          <Text style={styles.menuItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logoutSection}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutButtonText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
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
      fontSize: 17,
      color: theme.primary,
      fontFamily: 'System',
      width: 60,
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
    menuItemArrow: {
      fontSize: 20,
      color: theme.textSecondary,
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
