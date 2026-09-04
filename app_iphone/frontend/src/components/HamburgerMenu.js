import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ThemeCover, useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import ChevronIcon from './ChevronIcon';
import PressableScale from './PressableScale';
import LoadingDog from './LoadingDog';
import { OTA_VERSION } from '../constants/otaVersion';

let BlurView = null;
try { BlurView = require('expo-blur').BlurView; } catch (e) { BlurView = null; }

// Se o bundle rodando veio de um `eas update` (OTA) ou do JS embutido no build.
// Em dev client os Constants de update podem não existir — cai no fallback.
let Updates = null;
try { Updates = require('expo-updates'); } catch (e) { Updates = null; }
function rodandoDeUpdate() {
  try {
    return Updates?.isEmbeddedLaunch === false; // false = veio de um OTA
  } catch (e) {
    return false;
  }
}

// Amarelo de alerta do app (mesmo tom do banner de notificações e da prioridade
// média). Usado quando há OTA nova esperando: rodapé "desatualizado" e o item de
// "Atualizar agora".
const OTA_ALERTA = '#F59E0B';

export function HamburgerIcon() {
  return (
    <View style={{ gap: 4, padding: 4 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ width: 18, height: 2, backgroundColor: '#94A3B8' }} />
      ))}
    </View>
  );
}

export default function HamburgerMenu({ visible, onClose, navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { t, lang, setLang } = useI18n();
  const slideAnim = useRef(new Animated.Value(340)).current;

  // Estado da atualização OTA:
  //   'checando'   → perguntando ao servidor se tem versão nova
  //   'atualizado' → rodando a versão mais recente (ou sem como checar: dev/offline)
  //   'disponivel' → tem OTA nova esperando pra baixar
  //   'baixando'   → baixando + vai recarregar
  //   'erro'       → falhou ao baixar/recarregar
  const [ota, setOta] = useState('checando');

  // Overlay "Atualizando…": some por cima do menu enquanto baixa/recarrega o
  // bundle novo, com um fade suave — em vez do "pisca" seco do reload. Fica
  // montado durante o fade-out (quando dá erro) e só desmonta ao fim.
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [overlayMontado, setOverlayMontado] = useState(false);

  useEffect(() => {
    if (ota === 'baixando') {
      setOverlayMontado(true);
      Animated.timing(overlayOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    } else {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setOverlayMontado(false);
      });
    }
  }, [ota, overlayOpacity]);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(340);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  // Ao abrir o menu: pergunta ao servidor de OTA se há versão mais nova que a que
  // está rodando. Em dev client / Expo Go / offline o módulo pode não existir ou
  // a chamada falhar — nesses casos cai em 'atualizado' pra não alarmar à toa.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setOta('checando');
    (async () => {
      if (!Updates || typeof Updates.checkForUpdateAsync !== 'function') {
        if (vivo) setOta('atualizado');
        return;
      }
      try {
        const r = await Updates.checkForUpdateAsync();
        if (vivo) setOta(r && r.isAvailable ? 'disponivel' : 'atualizado');
      } catch (e) {
        if (vivo) setOta('atualizado');
      }
    })();
    return () => { vivo = false; };
  }, [visible]);

  const atualizarAgora = async () => {
    if (!Updates || typeof Updates.fetchUpdateAsync !== 'function' || typeof Updates.reloadAsync !== 'function') {
      return;
    }
    setOta('baixando');
    try {
      await Updates.fetchUpdateAsync();
      // Segura um instante pra o overlay "Atualizando…" aparecer inteiro (fade)
      // antes do reload — assim a troca de bundle não fica um pisca seco.
      await new Promise((r) => setTimeout(r, 550));
      await Updates.reloadAsync(); // reinicia já com o bundle novo
    } catch (e) {
      setOta('erro');
    }
  };

  const close = () => {
    Animated.timing(slideAnim, { toValue: 340, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  // O pan é criado uma vez (useRef); usa a versão mais recente de close via ref.
  const closeRef = useRef(close);
  closeRef.current = close;

  // Arrastar o menu da esquerda pra direita fecha (empurra o drawer pra fora pela
  // borda direita). Como o próprio drawer captura o gesto, a tela de trás não é
  // tocada — junto com o Modal, garante que só o menu é interativo quando aberto.
  const dragPan = useRef(
    PanResponder.create({
      // Captura QUALQUER arrasto horizontal no drawer (as duas direções) — assim
      // o gesto nunca vaza pra tela de trás. Só o arrasto pra DIREITA move/fecha;
      // pra esquerda fica preso em 0 (não abre mais).
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
      onPanResponderMove: (_, g) => { slideAnim.setValue(Math.max(0, Math.min(g.dx, 340))); },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 90 || g.vx > 0.5) closeRef.current();
        else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  // Fundo escuro (fade): engole TODOS os gestos pra nada chegar na tela de trás
  // enquanto o menu está aberto. Toque simples (sem arrastar) fecha o menu;
  // arrasto é só absorvido. É o "clicar fora fecha" pedido.
  const backdropPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) closeRef.current();
      },
      onPanResponderTerminate: () => {},
    }),
  ).current;

  const goToAccount = () => {
    close();
    setTimeout(() => navigation.navigate('Account'), 240);
  };

  const goToNotifications = () => {
    close();
    setTimeout(() => navigation.navigate('NotificationSettings'), 240);
  };

  const drawerBg = isDark ? 'rgba(18,16,22,0.55)' : 'rgba(248,248,250,0.72)';
  const cardBg = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  // Palavra de estado do rodapé + cor. 'desatualizado'/'erro' saem em amarelo de
  // alerta; o resto segue o texto secundário do tema.
  const otaEstado =
    ota === 'checando' ? t('chat.menu.otaChecking')
    : ota === 'disponivel' ? t('chat.menu.otaOutdated')
    : ota === 'baixando' ? t('chat.menu.otaDownloading')
    : ota === 'erro' ? t('chat.menu.otaError')
    : rodandoDeUpdate() ? t('chat.menu.otaUpdated') : t('chat.menu.otaEmbedded');
  const otaEstadoCor = ota === 'disponivel' || ota === 'erro' ? OTA_ALERTA : theme.textSecondary;
  const otaAcaoVisivel = ota === 'disponivel' || ota === 'baixando';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={StyleSheet.absoluteFill} {...backdropPan.panHandlers} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]} {...dragPan.panHandlers}>
          {BlurView && <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: drawerBg }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textSecondary }]}>{t('chat.menu.title')}</Text>
            <PressableScale onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 20, fontWeight: '600' }}>✕</Text>
            </PressableScale>
          </View>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={toggleTheme}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('chat.menu.theme')}</Text>
            <View style={[styles.themeToggleTrack, { backgroundColor: isDark ? theme.surface2 : theme.border }]}>
              <Image
                source={require('../../assets/icon-tema-claro.png')}
                style={[styles.themeToggleIcon, { tintColor: isDark ? theme.textSecondary : theme.primary }]}
              />
              <Image
                source={require('../../assets/icon-tema-escuro.png')}
                style={[styles.themeToggleIcon, { tintColor: isDark ? theme.primary : theme.textSecondary }]}
              />
              <View style={[styles.themeToggleThumb, { left: isDark ? 29 : 3, backgroundColor: theme.primary }]} />
            </View>
          </PressableScale>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={goToNotifications}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('chat.menu.notifications')}</Text>
            <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
          </PressableScale>

          {/* Idioma: mesmo formato do toggle de tema — trilho com a pílula
              deslizando entre as duas opções. */}
          <PressableScale
            style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          >
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('common.language')}</Text>
            <View style={[styles.langTrack, { backgroundColor: isDark ? theme.surface2 : theme.border }]}>
              <View style={[styles.langThumb, { left: lang === 'pt' ? 3 : 39, backgroundColor: theme.primary }]} />
              <Text style={[styles.langText, { color: lang === 'pt' ? '#FFFFFF' : theme.textSecondary }]}>PT</Text>
              <Text style={[styles.langText, { color: lang === 'en' ? '#FFFFFF' : theme.textSecondary }]}>EN</Text>
            </View>
          </PressableScale>

          <PressableScale style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={goToAccount}>
            <Text style={[styles.cardText, { color: theme.textPrimary }]}>{t('common.account')}</Text>
            <ChevronIcon direction="right" color={theme.textSecondary} size={26} />
          </PressableScale>

          {/* Atualização OTA: só aparece quando há versão nova esperando (ou já
              baixando). Item destacado em amarelo de alerta; tocar baixa e reabre
              o app já atualizado. */}
          {otaAcaoVisivel && (
            <PressableScale
              style={[styles.card, styles.updateCard, { backgroundColor: cardBg }]}
              onPress={atualizarAgora}
              disabled={ota === 'baixando'}
            >
              <View style={styles.updateTextWrap}>
                <Text style={[styles.cardText, styles.updateTitle]}>{t('chat.menu.otaUpdateTitle')}</Text>
                <Text style={[styles.updateHint, { color: theme.textSecondary }]}>
                  {ota === 'baixando' ? t('chat.menu.otaDownloadingHint') : t('chat.menu.otaUpdateHint')}
                </Text>
              </View>
              {ota === 'baixando'
                ? <ActivityIndicator size="small" color={OTA_ALERTA} />
                : <ChevronIcon direction="right" color={OTA_ALERTA} size={26} />}
            </PressableScale>
          )}

          {/* Rodapé: versão OTA rodando de fato no device (o número sobe a cada
              `eas update`, confirmando que o bundle novo já baixou) + o estado da
              checagem. 'desatualizado' sai em amarelo quando há update esperando. */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              OTA #{OTA_VERSION}
              {'  ·  '}
              <Text style={{ color: otaEstadoCor }}>{otaEstado}</Text>
            </Text>
          </View>
        </Animated.View>

        {/* Modal é uma janela nativa separada: a cortina do ThemeProvider não
            alcança aqui dentro. Sem esta, o menu trocaria de tema fora da
            animação, depois do resto — que era o "pisca" que sobrava. */}
        <ThemeCover />

        {/* Overlay "Atualizando…": full-screen por cima de tudo enquanto baixa
            e recarrega o bundle novo. Fade suave (Animated) + fundo do app em
            alta opacidade, spinner e texto centralizados. */}
        {overlayMontado && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.updatingOverlay, { opacity: overlayOpacity }]}
            pointerEvents="auto"
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, opacity: 0.96 }]} />
            <LoadingDog size={64} color={theme.primary} />
            <Text style={[styles.updatingText, { color: theme.textPrimary }]}>
              {t('chat.menu.otaUpdatingOverlay')}
            </Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    flexDirection: 'row',
  },
  drawer: {
    width: '85%',
    maxWidth: 360,
    height: '100%',
    paddingTop: 60,
    paddingHorizontal: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  title: { fontSize: 13, fontWeight: '700', fontFamily: 'System', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 12,
  },
  cardText: { fontSize: 16, fontWeight: '500', fontFamily: 'System' },
  // Item de atualização: mesma forma dos cards, mas com borda amarela de alerta
  // pra puxar o olho quando há OTA nova esperando.
  updateCard: { borderColor: OTA_ALERTA, alignItems: 'center' },
  updateTextWrap: { flex: 1, paddingRight: 12, gap: 3 },
  updateTitle: { color: OTA_ALERTA, fontWeight: '700' },
  updateHint: { fontSize: 12, lineHeight: 16, fontFamily: 'System' },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'System',
    letterSpacing: 0.4,
  },
  themeToggleTrack: {
    width: 58,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    position: 'relative',
  },
  themeToggleIcon: { width: 15, height: 15, zIndex: 1 },
  themeToggleThumb: { position: 'absolute', top: 3, width: 26, height: 24, borderRadius: 12 },

  // Trilho do idioma: um pouco mais largo que o de tema porque carrega texto
  // ("PT"/"EN") em vez de ícone.
  langTrack: {
    width: 70,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    position: 'relative',
  },
  langThumb: { position: 'absolute', top: 3, width: 28, height: 24, borderRadius: 12 },
  langText: { fontSize: 11, fontWeight: '700', zIndex: 1, fontFamily: 'System' },

  // Overlay "Atualizando…": cobre a tela toda; spinner + texto centralizados.
  // O fundo do app vai numa View separada em alta opacidade; a opacidade da
  // Animated.View é o fade.
  updatingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  updatingText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
    letterSpacing: 0.3,
  },
});
