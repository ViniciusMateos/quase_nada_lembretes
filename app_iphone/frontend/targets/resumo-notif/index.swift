import UIKit
import UserNotifications
import UserNotificationsUI

// UI custom da notificação-resumo quando expandida. O corpo vem como texto:
//   "Você tem N lembretes para amanhã:\n• Reunião — 10:00\n• Almoço — 12:30"
// A extensão renderiza a 1ª linha como cabeçalho (azul) e as demais como itens.
class NotificationViewController: UIViewController, UNNotificationContentExtension {
  private let titleLabel = UILabel()
  private let stack = UIStackView()

  private let bg = UIColor(red: 0.043, green: 0.043, blue: 0.051, alpha: 1) // #0B0B0D
  private let accent = UIColor(red: 0.039, green: 0.518, blue: 1, alpha: 1)  // #0A84FF

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = bg

    titleLabel.font = .systemFont(ofSize: 16, weight: .bold)
    titleLabel.textColor = .white
    titleLabel.numberOfLines = 0
    titleLabel.translatesAutoresizingMaskIntoConstraints = false

    stack.axis = .vertical
    stack.spacing = 6
    stack.translatesAutoresizingMaskIntoConstraints = false

    view.addSubview(titleLabel)
    view.addSubview(stack)

    NSLayoutConstraint.activate([
      titleLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
      titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      stack.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -16),
    ])
  }

  func didReceive(_ notification: UNNotification) {
    let content = notification.request.content
    titleLabel.text = content.title

    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    let lines = content.body.split(separator: "\n").map(String.init)
    for (i, line) in lines.enumerated() {
      let l = UILabel()
      l.text = line
      l.numberOfLines = 0
      l.font = .systemFont(ofSize: 14, weight: i == 0 ? .semibold : .regular)
      l.textColor = i == 0 ? accent : UIColor(white: 0.9, alpha: 1)
      stack.addArrangedSubview(l)
    }
  }
}
