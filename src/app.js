import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createPublicRouter } from './routes/public.js';
import { createAdminRouter } from './routes/admin.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the Express application. All configuration is passed in explicitly;
 * this module never reads environment variables (see src/server.js).
 *
 * @param {object} [options]
 * @param {import('better-sqlite3').Database} [options.db] Database handle (injected),
 *   used by the public pages to read posts.
 * @param {string} [options.adminPassword] Password for the /admin pages. When unset
 *   or empty, admin login is disabled and no password is accepted.
 * @param {string} [options.sessionSecret] Secret used to sign the admin session
 *   cookie. When unset, a random secret is generated per process, so admin
 *   sessions do not survive a restart.
 */
export function createApp({ db, adminPassword, sessionSecret } = {}) {
  const app = express();

  app.locals.db = db;
  app.locals.siteTitle = 'Blog';

  app.set('view engine', 'ejs');
  app.set('views', path.join(rootDir, 'views'));
  app.disable('x-powered-by');

  app.use(express.static(path.join(rootDir, 'public')));

  app.use(createPublicRouter({ db }));
  app.use('/admin', createAdminRouter({ db, adminPassword, sessionSecret }));

  app.use((req, res) => {
    res.status(404).render('404', { title: 'Page not found' });
  });

  // Error handler: render a friendly page and never expose the stack trace.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const code = err.status || err.statusCode;
    const status = code >= 400 && code < 600 ? code : 500;
    if (status >= 500) console.error(err);
    res.status(status).render('error', { title: 'Something went wrong' });
  });

  return app;
}
