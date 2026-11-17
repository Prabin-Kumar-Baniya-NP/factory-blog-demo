import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, isLoginEnabled, requireAdmin } from '../src/auth.js';

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

test('requireAdmin calls next only for an admin session', () => {
  let nextCalls = 0;
  const redirects = [];
  const res = { redirect: (...args) => redirects.push(args) };
  const next = () => nextCalls++;

  requireAdmin({ session: { isAdmin: true } }, res, next);
  assert.equal(nextCalls, 1);
  assert.deepEqual(redirects, []);

  for (const req of [{}, { session: null }, { session: {} }, { session: { isAdmin: 'true' } }]) {
    requireAdmin(req, res, next);
  }
  assert.equal(nextCalls, 1);
  assert.equal(redirects.length, 4);
  for (const args of redirects) assert.deepEqual(args, [302, '/admin/login']);
});
