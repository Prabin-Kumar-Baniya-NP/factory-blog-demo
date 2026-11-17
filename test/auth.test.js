import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_MAX_AGE_MS,
  checkPassword,
  createAdminSession,
  createAuthenticate,
  isLoginEnabled,
  isValidAdminSession,
  passwordFingerprint,
  requireAdmin,
} from '../src/auth.js';

test('isLoginEnabled is true only for a non-empty string', () => {
  assert.equal(isLoginEnabled('secret'), true);
  assert.equal(isLoginEnabled(''), false);
  assert.equal(isLoginEnabled(undefined), false);
  assert.equal(isLoginEnabled(null), false);
  assert.equal(isLoginEnabled(123), false);
});

test('checkPassword accepts the exact password', () => {
  assert.equal(checkPassword('secret', 'secret'), true);
  assert.equal(checkPassword('pässwörd', 'pässwörd'), true);
});

test('checkPassword rejects a different password', () => {
  assert.equal(checkPassword('Secret', 'secret'), false);
  assert.equal(checkPassword('secreT', 'secret'), false);
  assert.equal(checkPassword('', 'secret'), false);
});

test('checkPassword handles different lengths without throwing', () => {
  assert.doesNotThrow(() => checkPassword('a', 'aa'));
  assert.equal(checkPassword('a', 'aa'), false);
  assert.equal(checkPassword('secret-and-more', 'secret'), false);
});

test('checkPassword rejects non-string candidates', () => {
  assert.equal(checkPassword(undefined, 'secret'), false);
  assert.equal(checkPassword(null, 'secret'), false);
  assert.equal(checkPassword(['secret'], 'secret'), false);
  assert.equal(checkPassword(['secret', 'secret'], 'secret'), false);
  assert.equal(checkPassword({ toString: () => 'secret' }, 'secret'), false);
});

test('checkPassword rejects everything when no password is configured', () => {
  for (const adminPassword of [undefined, '', null]) {
    assert.equal(checkPassword('', adminPassword), false);
    assert.equal(checkPassword(undefined, adminPassword), false);
    assert.equal(checkPassword('undefined', adminPassword), false);
    assert.equal(checkPassword('anything', adminPassword), false);
  }
});

const SECRET = 'unit-test-secret';

test('passwordFingerprint depends on both password and secret', () => {
  const fp = passwordFingerprint('pw', SECRET);
  assert.equal(typeof fp, 'string');
  assert.equal(fp, passwordFingerprint('pw', SECRET));
  assert.notEqual(fp, passwordFingerprint('pw2', SECRET));
  assert.notEqual(fp, passwordFingerprint('pw', 'other-secret'));
  assert.doesNotMatch(fp, /pw/);
});

test('isValidAdminSession accepts a fresh session for the current password', () => {
  const session = createAdminSession({ adminPassword: 'pw', secret: SECRET });
  assert.equal(session.isAdmin, true);
  assert.equal(isValidAdminSession(session, { adminPassword: 'pw', secret: SECRET }), true);
});

test('isValidAdminSession rejects sessions once login is disabled', () => {
  const session = createAdminSession({ adminPassword: 'pw', secret: SECRET });
  for (const adminPassword of [undefined, '']) {
    assert.equal(isValidAdminSession(session, { adminPassword, secret: SECRET }), false);
  }
});

test('isValidAdminSession rejects sessions after the password or secret changes', () => {
  const session = createAdminSession({ adminPassword: 'pw', secret: SECRET });
  assert.equal(isValidAdminSession(session, { adminPassword: 'new-pw', secret: SECRET }), false);
  assert.equal(isValidAdminSession(session, { adminPassword: 'pw', secret: 'other' }), false);
});

test('isValidAdminSession rejects expired, future-dated and malformed sessions', () => {
  const now = Date.UTC(2024, 0, 1);
  const opts = { adminPassword: 'pw', secret: SECRET, now };
  const fresh = createAdminSession({ adminPassword: 'pw', secret: SECRET, now });
  assert.equal(isValidAdminSession(fresh, opts), true);
  assert.equal(
    isValidAdminSession({ ...fresh, loginAt: now - SESSION_MAX_AGE_MS }, opts),
    true,
  );
  assert.equal(
    isValidAdminSession({ ...fresh, loginAt: now - SESSION_MAX_AGE_MS - 1 }, opts),
    false,
  );
  assert.equal(isValidAdminSession({ ...fresh, loginAt: now + 60_000 }, opts), false);
  assert.equal(isValidAdminSession({ ...fresh, loginAt: 'yesterday' }, opts), false);
  assert.equal(isValidAdminSession({ ...fresh, fp: undefined }, opts), false);
  assert.equal(isValidAdminSession({ ...fresh, fp: 'wrong' }, opts), false);
  assert.equal(isValidAdminSession({ ...fresh, isAdmin: 'true' }, opts), false);
  assert.equal(isValidAdminSession({ isAdmin: true }, opts), false);
  assert.equal(isValidAdminSession(null, opts), false);
  assert.equal(isValidAdminSession(undefined, opts), false);
});

test('authenticate sets req.isAdmin and drops an invalid existing session', () => {
  const authenticate = createAuthenticate({ adminPassword: 'pw', secret: SECRET });
  const next = () => {};

  const good = { session: createAdminSession({ adminPassword: 'pw', secret: SECRET }) };
  authenticate(good, {}, next);
  assert.equal(good.isAdmin, true);
  assert.ok(good.session);

  const stale = {
    session: { ...createAdminSession({ adminPassword: 'old', secret: SECRET }), isNew: false },
  };
  authenticate(stale, {}, next);
  assert.equal(stale.isAdmin, false);
  assert.equal(stale.session, null);

  const none = {};
  authenticate(none, {}, next);
  assert.equal(none.isAdmin, false);
});

test('requireAdmin calls next only when req.isAdmin is true', () => {
  let nextCalls = 0;
  const redirects = [];
  const res = { redirect: (...args) => redirects.push(args) };
  const next = () => nextCalls++;

  requireAdmin({ isAdmin: true }, res, next);
  assert.equal(nextCalls, 1);
  assert.deepEqual(redirects, []);

  // A raw session flag alone is not enough: authenticate must have run.
  const reqs = [{}, { isAdmin: false }, { isAdmin: 'true' }, { session: { isAdmin: true } }];
  for (const req of reqs) requireAdmin(req, res, next);
  assert.equal(nextCalls, 1);
  assert.equal(redirects.length, reqs.length);
  for (const args of redirects) assert.deepEqual(args, [302, '/admin/login']);
});
