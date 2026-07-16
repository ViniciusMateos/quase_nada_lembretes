import UIKit
import UserNotifications
import UserNotificationsUI

// UI custom da notificação-resumo quando expandida. O corpo vem como texto:
//   "Você tem N lembretes para amanhã:\n• Reunião — 10:00\n• Almoço — 12:30"
// A extensão renderiza a 1ª linha como cabeçalho (azul) e as demais como itens.
class NotificationViewController: UIViewController, UNNotificationContentExtension {
  private let titleLabel = UILabel()
  private let logoView = UIImageView()
  private let header = UIStackView()
  private let stack = UIStackView()

  // Cores dinâmicas: o iOS resolve conforme o tema do aparelho, sem código nosso.
  // Chumbar #0B0B0D deixaria a notificação como uma mancha preta em tema claro.
  private let bg = UIColor { t in
    t.userInterfaceStyle == .dark
      ? UIColor(red: 0.043, green: 0.043, blue: 0.051, alpha: 1) // #0B0B0D
      : .white
  }
  private let accent = UIColor(red: 0.039, green: 0.518, blue: 1, alpha: 1) // #0A84FF
  private let textPrimary = UIColor { t in
    t.userInterfaceStyle == .dark ? .white : UIColor(white: 0.06, alpha: 1)
  }
  private let textItem = UIColor { t in
    t.userInterfaceStyle == .dark ? UIColor(white: 0.9, alpha: 1) : UIColor(white: 0.18, alpha: 1)
  }
  private let textFaint = UIColor { t in
    t.userInterfaceStyle == .dark ? UIColor(white: 0.55, alpha: 1) : UIColor(white: 0.45, alpha: 1)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = bg

    // Logo do app (vem do Assets.xcassets gerado pelo expo-target.config.js).
    // `.alwaysTemplate` descarta as cores do PNG e pinta o traço com o tintColor
    // — assim a line art vira azul da marca em cima do fundo escuro.
    logoView.image = UIImage(named: "logo")?.withRenderingMode(.alwaysTemplate)
    logoView.tintColor = accent
    logoView.contentMode = .scaleAspectFit
    logoView.translatesAutoresizingMaskIntoConstraints = false
    logoView.setContentHuggingPriority(.required, for: .horizontal)

    titleLabel.font = .systemFont(ofSize: 16, weight: .bold)
    titleLabel.textColor = textPrimary
    titleLabel.numberOfLines = 0

    header.axis = .horizontal
    header.spacing = 8
    header.alignment = .center
    header.translatesAutoresizingMaskIntoConstraints = false
    header.addArrangedSubview(logoView)
    header.addArrangedSubview(titleLabel)

    stack.axis = .vertical
    stack.spacing = 6
    stack.translatesAutoresizingMaskIntoConstraints = false

    view.addSubview(header)
    view.addSubview(stack)

    NSLayoutConstraint.activate([
      logoView.widthAnchor.constraint(equalToConstant: 24),
      logoView.heightAnchor.constraint(equalToConstant: 24),
      header.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      stack.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 12),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -16),
    ])
  }

  // O corpo vem do JS já estruturado:
  //
  //   Você tem 5 lembretes para amanhã:     ← chamada (azul)
  //   • Consulta dentista — 09:00           ← pontual
  //   • Sair com a Nicolly — 20:00
  //                                         ← linha vazia (respiro)
  //   Recorrentes:                          ← divisor de seção
  //   • Disparo whats — 10:00               ← recorrente
  //
  // Em vez de assumir "primeira linha = azul, resto = cinza", cada linha é
  // classificada pelo formato: item começa com "•", seção termina com ":".
  private enum Line {
    case lead(String)     // a chamada, no topo
    case section(String)  // "Recorrentes:"
    case item(String)     // "• Título — 10:00"
    case spacer
  }

  private func classify(_ raw: String, isFirst: Bool) -> Line {
    let t = raw.trimmingCharacters(in: .whitespaces)
    if t.isEmpty { return .spacer }
    if t.hasPrefix("•") { return .item(t) }
    if isFirst { return .lead(t) }
    if t.hasSuffix(":") { return .section(String(t.dropLast())) }
    return .item(t) // "…e mais 3"
  }

  func didReceive(_ notification: UNNotification) {
    let content = notification.request.content
    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }

    // A extensão atende DUAS categorias (ver expo-target.config.js):
    //  - "lembrete": a hora chegou. Título grande + dica de adiar apagadinha.
    //  - "resumo":   a lista do dia/semana, com pontuais e recorrentes.
    if content.categoryIdentifier == "lembrete" {
      montarLembrete(content)
      return
    }

    titleLabel.text = content.title
    let raw = content.body.components(separatedBy: "\n")
    for (i, line) in raw.enumerated() {
      switch classify(line, isFirst: i == 0) {
      case .spacer:
        let v = UIView()
        v.heightAnchor.constraint(equalToConstant: 6).isActive = true
        stack.addArrangedSubview(v)

      case .lead(let text):
        let l = UILabel()
        l.text = text
        l.numberOfLines = 0
        l.font = .systemFont(ofSize: 14, weight: .semibold)
        l.textColor = accent
        stack.addArrangedSubview(l)

      case .section(let text):
        let l = UILabel()
        // Fonte e cor vão nos atributos: definir `font`/`textColor` e depois
        // atribuir `attributedText` faria o label descartar os dois.
        l.attributedText = NSAttributedString(
          string: text.uppercased(),
          attributes: [
            .font: UIFont.systemFont(ofSize: 11, weight: .bold),
            .foregroundColor: textFaint,
            .kern: 0.8, // respira, pra ler como divisor e não como item
          ]
        )
        stack.addArrangedSubview(l)

      case .item(let text):
        let l = UILabel()
        l.text = text
        l.numberOfLines = 0
        l.font = .systemFont(ofSize: 14, weight: .regular)
        l.textColor = textItem
        stack.addArrangedSubview(l)
      }
    }
  }

  /// Layout do lembrete disparado. O JS manda:
  ///
  ///     title = "Lembrete: Sair com a Nicolly"   ← bold no banner fechado
  ///     body  = "segure para adiar"              ← regular no banner fechado
  ///
  /// Essa divisão existe porque no banner do iOS só o título é negrito, e não há
  /// como estilizar mais nada. Aqui, expandido, a gente reaproveita: o cabeçalho
  /// fica com a marca, o lembrete vira o texto grande e a dica fica discreta.
  private func montarLembrete(_ content: UNNotificationContent) {
    titleLabel.text = "Quase Nada"

    // Tira o "Lembrete: " — expandido, o prefixo é redundante: já tem a marca no
    // cabeçalho e o texto grande deixa óbvio o que é.
    let semPrefixo = content.title.replacingOccurrences(
      of: "^[^:]+:\\s*", with: "", options: .regularExpression
    )

    let lembrete = UILabel()
    lembrete.text = semPrefixo.isEmpty ? content.title : semPrefixo
    lembrete.numberOfLines = 0
    lembrete.font = .systemFont(ofSize: 20, weight: .semibold)
    lembrete.textColor = textPrimary
    stack.addArrangedSubview(lembrete)

    let dica = content.body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !dica.isEmpty else { return }

    let respiro = UIView()
    respiro.heightAnchor.constraint(equalToConstant: 4).isActive = true
    stack.addArrangedSubview(respiro)

    // A dica: pequena, translúcida, sem peso. Presente sem competir.
    let dicaLabel = UILabel()
    dicaLabel.text = dica
    dicaLabel.numberOfLines = 0
    dicaLabel.font = .systemFont(ofSize: 12, weight: .regular)
    dicaLabel.textColor = textFaint
    dicaLabel.alpha = 0.75
    stack.addArrangedSubview(dicaLabel)
  }
}
