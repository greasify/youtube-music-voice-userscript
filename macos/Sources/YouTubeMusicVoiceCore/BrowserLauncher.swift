import AppKit

public enum BrowserLauncher {
  public static let youtubeMusic = URL(string: "https://music.youtube.com")!

  public static func openYouTubeMusic() {
    NSWorkspace.shared.open(youtubeMusic)
  }
}
