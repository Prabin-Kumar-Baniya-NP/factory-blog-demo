import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

export const TEST_ADMIN_PASSWORD = 'test-admin-password';
export const TEST_SESSION_SECRET = 'test-session-secret';

/**
 * A fresh, migrated, empty in-memory database.
 */
export function makeDb() {
  return openDb(':memory:').db;
}

/**
 * Build an app with test defaults. Pass overrides to replace any option.
 */
export function makeApp(overrides = {}) {
  return createApp({
    db: makeDb(),
    adminPassword: TEST_ADMIN_PASSWORD,
    sessionSecret: TEST_SESSION_SECRET,
    ...overrides,
  });
}
