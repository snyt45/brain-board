import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    alias: {
      'obsidian': path.resolve(__dirname, '__mocks__/obsidian.ts'),
    },
  },
})
