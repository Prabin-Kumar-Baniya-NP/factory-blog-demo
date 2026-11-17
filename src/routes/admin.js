// Admin pages: login, logout, the post list and post create, edit and delete,
// all under /admin.
import { randomBytes } from 'node:crypto';
import express from 'express';
import cookieSession from 'cookie-session';
import {
  countPosts,
  createPost,
  deletePost,
  getPostById,
  listPosts,
  updatePost,
} from '../posts.js';
import {
  SESSION_MAX_AGE_MS,
  checkPassword,
  createAdminSession,
  createAuthenticate,
  isLoginEnabled,
  requireAdmin,
} from '../auth.js';

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * Parse a post id route parameter. Only a plain positive integer ("1", "42")
 * is an id; anything else ("abc", "0", "1.5", "01") gives null.
 *
 * @returns {number|null}
 */
function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Validate a submitted post form. Non-string fields (missing, or arrays from
 * repeated fields) count as empty. The title is trimmed; the body is kept
 * exactly as typed.
 *
 * @param {Record<string, unknown>} body The parsed form body.
 * @returns {{ values: { title: string, body: string }, errors: string[] }}
 */
function validatePost(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const errors = [];
  if (title === '') errors.push('Title is required.');
  if (text.trim() === '') errors.push('Body is required.');
  return { values: { title, body: text }, errors };
}

/** Render the shared create/edit form. */
function renderForm(res, status, { pageTitle, action, submitLabel, values, errors, post }) {
  res.status(status).render('admin/form', {
    title: pageTitle,
    action,
    submitLabel,
    values,
    errors,
    post,
  });
}

const NEW_FORM = {
  pageTitle: 'New post',
  action: '/admin/posts',
  submitLabel: 'Create post',
  post: undefined,
};

function editForm(post) {
  return {
    pageTitle: `Edit: ${post.title}`,
    action: `/admin/posts/${post.id}`,
    submitLabel: 'Save changes',
    post,
  };
}

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
  //
  // Sessions are stateless: everything lives in the signed cookie and nothing
  // is stored on the server. Logout therefore only clears the browser's copy;
  // a copied cookie stays usable until it expires (SESSION_MAX_AGE_MS, also
  // checked server-side via loginAt), the password changes, or login is
  // disabled.
  router.use(
    cookieSession({
      name: 'session',
      keys: [secret],
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    }),
  );
  router.use(createAuthenticate({ adminPassword, secret }));
  router.use(express.urlencoded({ extended: false }));

  router.get('/login', (req, res) => {
    if (req.isAdmin) return res.redirect(302, '/admin');
    res.render('admin/login', { title: 'Admin login', enabled, error: null });
  });

  router.post('/login', (req, res) => {
    if (checkPassword(req.body?.password, adminPassword)) {
      req.session = createAdminSession({ adminPassword, secret });
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

  // Everything below this line requires a logged-in admin.
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const posts = listPosts(db, { limit: countPosts(db) }).map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      createdAt: post.createdAt,
      date: dateFormat.format(new Date(post.createdAt)),
    }));
    res.render('admin/index', { title: 'Admin', posts });
  });

  router.get('/posts/new', (req, res) => {
    renderForm(res, 200, { ...NEW_FORM, values: { title: '', body: '' }, errors: [] });
  });

  router.post('/posts', (req, res) => {
    const { values, errors } = validatePost(req.body ?? {});
    if (errors.length > 0) return renderForm(res, 400, { ...NEW_FORM, values, errors });
    const post = createPost(db, values);
    res.redirect(302, `/posts/${post.slug}`);
  });

  router.get('/posts/:id/edit', (req, res, next) => {
    const id = parseId(req.params.id);
    const post = id === null ? null : getPostById(db, id);
    if (!post) return next();
    renderForm(res, 200, {
      ...editForm(post),
      values: { title: post.title, body: post.body },
      errors: [],
    });
  });

  router.post('/posts/:id', (req, res, next) => {
    const id = parseId(req.params.id);
    const existing = id === null ? null : getPostById(db, id);
    if (!existing) return next();
    const { values, errors } = validatePost(req.body ?? {});
    if (errors.length > 0) return renderForm(res, 400, { ...editForm(existing), values, errors });
    const post = updatePost(db, id, values);
    if (!post) return next();
    res.redirect(302, `/posts/${post.slug}`);
  });

  router.post('/posts/:id/delete', (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null || !deletePost(db, id)) return next();
    res.redirect(302, '/admin');
  });

  return router;
}
