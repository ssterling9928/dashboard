import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Fixed timezone so timestamp formatting is deterministic
    env: { TZ: 'America/Chicago' },
  },
})
