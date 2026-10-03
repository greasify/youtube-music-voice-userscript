// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "YouTubeMusicVoice",
  platforms: [.macOS(.v14)],
  products: [
    .library(name: "YouTubeMusicVoiceCore", targets: ["YouTubeMusicVoiceCore"]),
    .executable(name: "YouTubeMusicVoice", targets: ["YouTubeMusicVoice"]),
  ],
  targets: [
    .target(
      name: "YouTubeMusicVoiceCore",
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
    .executableTarget(
      name: "YouTubeMusicVoice",
      dependencies: ["YouTubeMusicVoiceCore"],
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
    .testTarget(
      name: "YouTubeMusicVoiceTests",
      dependencies: ["YouTubeMusicVoiceCore"],
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
  ]
)
