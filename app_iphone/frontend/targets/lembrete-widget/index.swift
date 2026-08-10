import WidgetKit
import SwiftUI

// Bundle de widgets do Quase Nada Lembretes. Três widgets, um build só:
//
//   1. LembreteAtalho   — "Criar lembrete". Abre o Chat com o teclado aberto.
//                         Famílias: systemSmall + acessórios (circular, inline,
//                         retangular) pra tela de bloqueio.
//   2. ProximoLembrete  — o próximo lembrete na tela de bloqueio (retangular),
//                         com a logo à esquerda, título e horário. Toca → abre.
//   3. ProximosLembretes— a lista (médio/grande), pontuais primeiro e recorrentes
//                         abaixo, preenchendo o que couber. Azul e neutro.
//
// Os widgets de lista leem os dados que o app grava no App Group (ver JS:
// ExtensionStorage). Sem dado (app nunca aberto), mostram um placeholder.

private let deepNovo = URL(string: "quasenadalembretes://novo")!       // Chat + teclado
private let deepChat = URL(string: "quasenadalembretes://chat")!       // Chat, sem teclado
private let deepLista = URL(string: "quasenadalembretes://lembretes")! // aba Lembretes
private func deepEditar(_ id: String) -> URL {
  URL(string: "quasenadalembretes://lembrete/\(id)")!
}

private let accent = Color(red: 10 / 255, green: 132 / 255, blue: 255 / 255) // #0A84FF
private let appGroup = "group.com.quasenada.lembretes"
private let storeKey = "proximos_lembretes" // casa com o JS (ExtensionStorage.set)

// MARK: - Modelo compartilhado (o que o app grava no App Group)

struct LembreteItem: Codable, Identifiable {
  var id: String
  var titulo: String
  var quando: String   // já formatado pelo JS ("hoje 10:00", "sáb 20:00")
  var recorrente: Bool
  var timestamp: Double // epoch (ms) do disparo — pra descartar os que passaram
}

// Lê a lista do App Group. O app grava um JSON em `storeKey`.
private func lerLembretes() -> [LembreteItem] {
  guard
    let defaults = UserDefaults(suiteName: appGroup),
    let raw = defaults.string(forKey: storeKey),
    let data = raw.data(using: .utf8),
    let itens = try? JSONDecoder().decode([LembreteItem].self, from: data)
  else { return [] }

  // Descarta os que já passaram (o widget "anda sozinho" sem o app abrir).
  let agora = Date().timeIntervalSince1970 * 1000
  return itens.filter { $0.timestamp >= agora }
}

// Ordena: pontuais primeiro (por horário), recorrentes depois. Espelha a aba.
private func ordenados(_ itens: [LembreteItem]) -> [LembreteItem] {
  let pontuais = itens.filter { !$0.recorrente }.sorted { $0.timestamp < $1.timestamp }
  let recorrentes = itens.filter { $0.recorrente }.sorted { $0.timestamp < $1.timestamp }
  return pontuais + recorrentes
}

// MARK: - Timeline

struct Entrada: TimelineEntry {
  let date: Date
  let itens: [LembreteItem]
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entrada {
    Entrada(date: Date(), itens: [])
  }
  func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
    completion(Entrada(date: Date(), itens: ordenados(lerLembretes())))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
    let itens = ordenados(lerLembretes())
    // Reagenda um redesenho no horário de cada disparo futuro: assim o widget
    // "troca sozinho" pro próximo conforme o tempo passa, sem abrir o app.
    var datas = itens.map { Date(timeIntervalSince1970: $0.timestamp / 1000) }
    datas.append(Date().addingTimeInterval(3600)) // e no mínimo de hora em hora
    let entry = Entrada(date: Date(), itens: itens)
    completion(Timeline(entries: [entry], policy: .after(datas.min() ?? Date().addingTimeInterval(3600))))
  }
}

// MARK: - Logo (line art; .template deixa o iOS tingir na tela de bloqueio)

private func logo(_ size: CGFloat, tint: Color? = nil) -> some View {
  Image("logo")
    .renderingMode(.template)
    .resizable()
    .scaledToFit()
    .frame(width: size, height: size)
    .foregroundColor(tint)
}

// MARK: - 1. Atalho "Criar lembrete"

struct AtalhoView: View {
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack { AccessoryWidgetBackground(); logo(30) }
    case .accessoryInline:
      Label("Criar lembrete", image: "logo")
    case .accessoryRectangular:
      HStack(spacing: 8) {
        logo(24)
        Text("Criar lembrete").font(.headline).minimumScaleFactor(0.8).lineLimit(1)
      }
    default: // systemSmall
      ZStack {
        accent
        VStack(spacing: 10) {
          logo(56, tint: .white)
          Text("Criar lembrete")
            .font(.subheadline).fontWeight(.semibold).foregroundColor(.white)
        }.padding()
      }
    }
  }
}

struct LembreteAtalho: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LembreteAtalho", provider: Provider()) { _ in
      AtalhoView()
        .widgetURL(deepNovo)
        .containerBackground(for: .widget) { accent }
    }
    .configurationDisplayName("Criar lembrete")
    .description("Atalho pra escrever um lembrete na hora.")
    .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular, .systemSmall])
  }
}

// MARK: - 2. Próximo lembrete (tela de bloqueio)

struct ProximoView: View {
  let entry: Entrada
  var body: some View {
    if let p = entry.itens.first {
      HStack(spacing: 8) {
        logo(22)
        VStack(alignment: .leading, spacing: 1) {
          Text(p.titulo).font(.headline).lineLimit(1)
          Text(p.quando).font(.caption2).opacity(0.85)
        }
        Spacer(minLength: 0)
      }
    } else {
      HStack(spacing: 8) {
        logo(22)
        Text("Sem lembretes").font(.subheadline).opacity(0.8)
      }
    }
  }
}

struct ProximoLembrete: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ProximoLembrete", provider: Provider()) { entry in
      ProximoView(entry: entry)
        .widgetURL(entry.itens.first.map { deepEditar($0.id) } ?? deepChat)
        .containerBackground(for: .widget) { Color.clear }
    }
    .configurationDisplayName("Próximo lembrete")
    .description("O próximo lembrete, sempre atualizado.")
    .supportedFamilies([.accessoryRectangular, .accessoryInline])
  }
}

// MARK: - 3. Próximos lembretes (lista) — azul e neutro

struct LinhaLista: View {
  let item: LembreteItem
  let neutro: Bool
  var body: some View {
    HStack {
      Text(item.titulo)
        .font(.system(size: 13.5, weight: .semibold))
        .foregroundColor(neutro ? .primary : .white)
        .lineLimit(1)
      Spacer(minLength: 8)
      Text(item.quando)
        .font(.system(size: 11.5))
        .foregroundColor(neutro ? .secondary : Color.white.opacity(0.82))
        .monospacedDigit()
    }
  }
}

struct ListaView: View {
  let entry: Entrada
  let neutro: Bool
  @Environment(\.widgetFamily) var family

  // Ajustado ao espaço real: o grande cabe bem mais que 8, o médio mais que 3.
  private var maxLinhas: Int { family == .systemLarge ? 13 : 5 }

  var body: some View {
    let itens = Array(entry.itens.prefix(maxLinhas))
    let pontuais = itens.filter { !$0.recorrente }
    let recorrentes = itens.filter { $0.recorrente }

    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 7) {
        logo(17, tint: neutro ? accent : .white)
        Text(family == .systemLarge ? "PRÓXIMOS LEMBRETES" : "PRÓXIMOS")
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(neutro ? .secondary : Color.white.opacity(0.95))
      }

      if itens.isEmpty {
        Spacer()
        Text("Nada por aqui").font(.subheadline)
          .foregroundColor(neutro ? .secondary : Color.white.opacity(0.8))
        Spacer()
      } else {
        ForEach(pontuais) { LinhaLista(item: $0, neutro: neutro) }
        if !recorrentes.isEmpty {
          Text("RECORRENTES")
            .font(.system(size: 9, weight: .bold))
            .kerning(0.6)
            .foregroundColor(neutro ? Color.secondary.opacity(0.7) : Color.white.opacity(0.6))
            .padding(.top, 1)
          ForEach(recorrentes) { LinhaLista(item: $0, neutro: neutro) }
        }
        Spacer(minLength: 0)
      }
    }
  }
}

struct ProximosLembretes: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ProximosLembretes", provider: Provider()) { entry in
      ListaView(entry: entry, neutro: false)
        .widgetURL(deepLista)
        .containerBackground(for: .widget) { accent }
    }
    .configurationDisplayName("Próximos lembretes")
    .description("Sua lista de lembretes, sempre à mão.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct ProximosLembretesNeutro: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ProximosLembretesNeutro", provider: Provider()) { entry in
      ListaView(entry: entry, neutro: true)
        .widgetURL(deepLista)
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }
    .configurationDisplayName("Próximos lembretes (neutro)")
    .description("A lista, com fundo que acompanha o tema.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

// MARK: - Bundle

@main
struct QuaseNadaWidgets: WidgetBundle {
  var body: some Widget {
    LembreteAtalho()
    ProximoLembrete()
    ProximosLembretes()
    ProximosLembretesNeutro()
  }
}
