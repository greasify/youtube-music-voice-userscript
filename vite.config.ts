import { defineConfig } from 'vite'
import userscript from 'vite-userscript-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    userscript({
      entry: 'src/index.ts',
      autoMetaUrls: true,
      header: {
        name: pkg.name,
        version: pkg.version,
        description: 'Runs YouTube Music voice commands sent by the macOS menu bar app.',
        homepage: 'https://greasify.github.io/youtube-music-voice-userscript/',
        connect: '127.0.0.1',
        match: 'https://music.youtube.com/*',
        noframes: true,
      },
      server: {
        file: true,
      },
    }),
  ],
})
