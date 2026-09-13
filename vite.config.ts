import { defineConfig } from 'vite'
import userscript from 'vite-userscript-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    userscript({
      entry: 'src/index.ts',
      header: {
        name: pkg.name,
        version: pkg.version,
        description: 'Voice control for YouTube Music: next, previous, pause, play, volume.',
        match: 'https://music.youtube.com/*',
        noframes: true,
      },
      server: {
        file: true,
      },
    }),
  ],
})
