// Admin authentication: password check and the route guard.
import { createHash, timingSafeEqual } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
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
  return timingSafeEqual(sha256(candidate), sha256(adminPassword));
}

/**
 * Express middleware: let logged-in admins through, redirect everyone else
 * to the login page.
 */
export function requireAdmin(req, res, next) {
  if (req.session?.isAdmin === true) return next();
  res.redirect(302, '/admin/login');
}
