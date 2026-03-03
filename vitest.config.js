/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
    // Mock environment variables so tests don't need real API keys
    env: {
      VITE_ANTHROPIC_API_KEY: 'test-key',
      VITE_GEMINI_API_KEY: 'test-key',
      VITE_OPENAI_API_KEY: 'test-key',
      VITE_PERPLEXITY_API_KEY: 'test-key',
    },
  },
});
