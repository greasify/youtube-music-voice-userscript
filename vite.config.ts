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
        description: 'Voice control for YouTube Music: next, previous, pause, play, volume.',
        homepage: 'https://greasify.github.io/youtube-music-voice-userscript/',
        match: 'https://music.youtube.com/*',
        noframes: true,
      },
      server: {
        file: true,
      },
    }),
  ],
})
