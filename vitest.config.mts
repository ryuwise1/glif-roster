import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000, // beforeEach 가 마이그레이션 전체를 새 DB에 적용한다
  },
})
