import AppKit
import SwiftUI
import YouTubeMusicVoiceCore

@main
struct YouTubeMusicVoiceApp: App {
  @StateObject private var model = AppModel()

  init() {
    NSApplication.shared.setActivationPolicy(.accessory)
  }

  var body: some Scene {
    MenuBarExtra {
      MenuContent(model: model)
    } label: {
      Image(systemName: model.listening ? "mic.fill" : "mic.slash")
    }
    .menuBarExtraStyle(.menu)
  }
}

private struct MenuContent: View {
  @ObservedObject var model: AppModel

  var body: some View {
    Toggle(listeningTitle, isOn: Binding(
      get: { model.listening },
      set: { model.setListening($0) }
    ))

    Picker(languageTitle, selection: Binding(
      get: { model.language },
      set: { model.setLanguage($0) }
    )) {
      Text("Русский").tag(VoiceLanguage.russian)
      Text("English").tag(VoiceLanguage.english)
    }

    if !model.lastDecision.isEmpty {
      Text(model.lastDecision)
    }

    if !model.note.isEmpty {
      Text(model.note)
    }

    Divider()

    Button(openTitle) {
      model.openMusic()
    }

    Toggle(loginTitle, isOn: Binding(
      get: { model.launchAtLogin },
      set: { model.setLaunchAtLogin($0) }
    ))

    Divider()

    Button(quitTitle) {
      model.quit()
      NSApplication.shared.terminate(nil)
    }
    .keyboardShortcut("q")
  }

  private var listeningTitle: String {
    model.language == .russian ? "Слушать" : "Listen"
  }

  private var languageTitle: String {
    model.language == .russian ? "Язык" : "Language"
  }

  private var openTitle: String {
    model.language == .russian ? "Открыть YouTube Music" : "Open YouTube Music"
  }

  private var loginTitle: String {
    model.language == .russian ? "Запускать при входе" : "Launch at login"
  }

  private var quitTitle: String {
    model.language == .russian ? "Выйти" : "Quit"
  }
}
