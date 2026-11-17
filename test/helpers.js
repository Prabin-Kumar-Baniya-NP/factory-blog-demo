import { createApp } from '../src/app.js';

export const TEST_ADMIN_PASSWORD = 'test-admin-password';
export const TEST_SESSION_SECRET = 'test-session-secret';

/**
 * Build an app with test defaults. Pass overrides to replace any option.
 */
export function makeApp(overrides = {}) {
  return createApp({
    db: null,
    adminPassword: TEST_ADMIN_PASSWORD,
    sessionSecret: TEST_SESSION_SECRET,
    ...overrides,
  });
}
