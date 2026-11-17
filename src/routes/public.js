// Public pages: the paginated list of posts and a single post page.
import express from 'express';
import { countPosts, listPosts, getPostBySlug } from '../posts.js';
import { renderMarkdown, excerpt } from '../markdown.js';

const PAGE_SIZE = 10;

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * Parse the `page` query parameter. Anything other than a plain positive
 * integer (missing, "abc", "0", "-1", "1.5", repeated parameters) means page 1.
 */
function parsePage(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** Format an ISO timestamp as e.g. "January 25, 2024" (UTC). */
function formatDate(iso) {
  return dateFormat.format(new Date(iso));
}

/**
 * @param {{ db: import('better-sqlite3').Database }} options
 * @returns {import('express').Router}
 */
export function createPublicRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    const page = parsePage(req.query.page);
    const total = countPosts(db);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > totalPages) return next();

    const posts = listPosts(db, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).map(
      (post) => ({
        title: post.title,
        slug: post.slug,
        createdAt: post.createdAt,
        date: formatDate(post.createdAt),
        excerpt: excerpt(post.body),
      }),
    );

    let prevHref = null;
    if (page === 2) prevHref = '/';
    else if (page > 2) prevHref = `/?page=${page - 1}`;
    const nextHref = page < totalPages ? `/?page=${page + 1}` : null;

    res.render('index', { title: 'Home', posts, prevHref, nextHref });
  });

  router.get('/posts/:slug', (req, res, next) => {
    const post = getPostBySlug(db, req.params.slug);
    if (!post) return next();
    res.render('post', {
      title: post.title,
      post,
      date: formatDate(post.createdAt),
      bodyHtml: renderMarkdown(post.body),
    });
  });

  return router;
}
