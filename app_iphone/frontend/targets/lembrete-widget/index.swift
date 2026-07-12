import WidgetKit
import SwiftUI

// Widget "clique para ser lembrado": tela de bloqueio (accessory) e tela inicial
// (systemSmall). Ao tocar, abre o app pelo deep link → o app foca o input do Chat
// pra escrever o lembrete (ver App.js / composeIntent.js no lado JS).

private let deepLink = URL(string: "quasenadalembretes://novo")!
private let accent = Color(red: 10 / 255, green: 132 / 255, blue: 255 / 255) // #0A84FF

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> SimpleEntry { SimpleEntry(date: Date()) }
  func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
    completion(SimpleEntry(date: Date()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
    // Estático: um único item, sem refresh agendado (o widget é só um atalho).
    completion(Timeline(entries: [SimpleEntry(date: Date())], policy: .never))
  }
}

struct SimpleEntry: TimelineEntry { let date: Date }

struct LembreteWidgetEntryView: View {
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "bell.badge.fill")
      }
    case .accessoryInline:
      Label("Clique para ser lembrado", systemImage: "bell.fill")
    case .accessoryRectangular:
      HStack(spacing: 8) {
        Image(systemName: "bell.badge.fill").font(.title3)
        VStack(alignment: .leading, spacing: 1) {
          Text("Quase Nada").font(.headline)
          Text("clique para ser lembrado").font(.caption2)
        }
      }
    default: // systemSmall (tela inicial)
      ZStack {
        accent
        VStack(spacing: 8) {
          Image(systemName: "bell.badge.fill").font(.system(size: 34)).foregroundColor(.white)
          Text("clique para ser lembrado")
            .font(.footnote).fontWeight(.semibold)
            .multilineTextAlignment(.center).foregroundColor(.white)
        }.padding()
      }
    }
  }
}

@main
struct LembreteWidget: Widget {
  let kind = "LembreteWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      LembreteWidgetEntryView(entry: entry)
        .widgetURL(deepLink) // toque → abre o app no deep link
        .containerBackground(for: .widget) { accent }
    }
    .configurationDisplayName("Novo lembrete")
    .description("Atalho pra escrever um lembrete na hora.")
    .supportedFamilies([
      .accessoryCircular, .accessoryInline, .accessoryRectangular, .systemSmall,
    ])
  }
}
