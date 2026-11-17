// Admin authentication: password check, session validation and the route guard.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** How long an admin session stays valid after login (12 hours). */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time string comparison that works for any lengths. */
function safeEqual(a, b) {
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Login is enabled only when a non-empty admin password is configured.
 *
 * @param {unknown} adminPassword
 * @returns {boolean}
 */
export function isLoginEnabled(adminPassword) {
  return typeof adminPassword === 'string' && adminPassword.length > 0;
}

/**
 * Compare a submitted password with the configured one in constant time.
 * Both values are hashed first so inputs of different lengths can be
 * compared with `timingSafeEqual` without throwing or leaking the length.
 * Always false when login is disabled or the candidate is not a string.
 *
 * @param {unknown} candidate
 * @param {unknown} adminPassword
 * @returns {boolean}
 */
export function checkPassword(candidate, adminPassword) {
  if (!isLoginEnabled(adminPassword) || typeof candidate !== 'string') return false;
  return safeEqual(candidate, adminPassword);
}

/**
 * A fingerprint of the admin password, keyed with the session secret. It is
 * stored in the session at login, so changing the password invalidates every
 * existing session. The password itself never goes into the cookie.
 *
 * @param {string} adminPassword
 * @param {string} secret
 * @returns {string}
 */
export function passwordFingerprint(adminPassword, secret) {
  return createHmac('sha256', secret).update(adminPassword, 'utf8').digest('base64url');
}

/**
 * The session contents to store after a successful login.
 *
 * @param {{ adminPassword: string, secret: string, now?: number }} options
 */
export function createAdminSession({ adminPassword, secret, now = Date.now() }) {
  return { isAdmin: true, fp: passwordFingerprint(adminPassword, secret), loginAt: now };
}

/**
 * True only if login is enabled, the session was created for the current
 * password, and it is younger than SESSION_MAX_AGE_MS.
 *
 * @param {unknown} session
 * @param {{ adminPassword?: string, secret: string, now?: number }} options
 * @returns {boolean}
 */
export function isValidAdminSession(session, { adminPassword, secret, now = Date.now() }) {
  if (!isLoginEnabled(adminPassword)) return false;
  if (!session || session.isAdmin !== true) return false;
  if (typeof session.fp !== 'string') return false;
  if (!Number.isFinite(session.loginAt)) return false;
  const age = now - session.loginAt;
  if (age < 0 || age > SESSION_MAX_AGE_MS) return false;
  return safeEqual(session.fp, passwordFingerprint(adminPassword, secret));
}

/**
 * Build the middleware that decides whether the request comes from a logged-in
 * admin. It sets `req.isAdmin` (used by `requireAdmin` and the login page) and
 * drops a session that is no longer valid, e.g. after the password changed or
 * login was disabled. Mount it after the session middleware.
 *
 * @param {{ adminPassword?: string, secret: string }} options
 */
export function createAuthenticate({ adminPassword, secret }) {
  return function authenticate(req, res, next) {
    req.isAdmin = isValidAdminSession(req.session, { adminPassword, secret });
    if (!req.isAdmin && req.session && !req.session.isNew) req.session = null;
    next();
  };
}

/**
 * Express middleware: let logged-in admins through, redirect everyone else
 * to the login page. Relies on `req.isAdmin` set by the middleware from
 * `createAuthenticate`, so it fails closed if that was not mounted.
 */
export function requireAdmin(req, res, next) {
  if (req.isAdmin === true) return next();
  res.redirect(302, '/admin/login');
}
