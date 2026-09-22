import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  reporter: 'html',
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});