import { defineConfig } from '@playwright/test';
import objStaffConfig from './playwright.staff.config.js';

// Hosted-runner fonts/rendering have their own reviewed native references.
// Preserve developers' existing local references and the same strict assertions.
export default defineConfig({
  ...objStaffConfig,
  grep: /visual/,
  reporter: [['list']],
  outputDir: './test-results/staff-native-visual',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/ci/{arg}-{projectName}-{platform}{ext}',
  updateSnapshots: 'none',
  globalTimeout: 7 * 60 * 1000,
});
