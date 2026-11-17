// Admin pages: login, logout and the post list, all under /admin.
import { randomBytes } from 'node:crypto';
import express from 'express';
import cookieSession from 'cookie-session';
import { countPosts, listPosts } from '../posts.js';
import { checkPassword, isLoginEnabled, requireAdmin } from '../auth.js';

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   adminPassword?: string,
 *   sessionSecret?: string,
 * }} options
 * @returns {import('express').Router}
 */
export function createAdminRouter({ db, adminPassword, sessionSecret }) {
  const router = express.Router();
  const enabled = isLoginEnabled(adminPassword);

  // Without a configured secret, sign with a random per-process key: sessions
  // then last only until the server restarts.
  const secret = sessionSecret || randomBytes(32).toString('hex');

  // The session middleware lives inside the admin router, so public pages
  // never read or set the session cookie.
  router.use(
    cookieSession({
      name: 'session',
      keys: [secret],
      httpOnly: true,
      sameSite: 'lax',
    }),
  );
  router.use(express.urlencoded({ extended: false }));

  router.get('/login', (req, res) => {
    if (req.session?.isAdmin === true) return res.redirect(302, '/admin');
    res.render('admin/login', { title: 'Admin login', enabled, error: null });
  });

  router.post('/login', (req, res) => {
    if (checkPassword(req.body?.password, adminPassword)) {
      req.session = { isAdmin: true };
      return res.redirect(302, '/admin');
    }
    res.status(401).render('admin/login', {
      title: 'Admin login',
      enabled,
      error: enabled ? 'Incorrect password.' : 'Admin login is disabled.',
    });
  });

  router.post('/logout', (req, res) => {
    req.session = null;
    res.redirect(302, '/admin/login');
  });

  // Everything below this line requires a logged-in admin. Post create, edit
  // and delete routes go below it.
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const posts = listPosts(db, { limit: countPosts(db) }).map((post) => ({
      title: post.title,
      slug: post.slug,
      createdAt: post.createdAt,
      date: dateFormat.format(new Date(post.createdAt)),
    }));
    res.render('admin/index', { title: 'Admin', posts });
  });

  return router;
}
