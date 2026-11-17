// Post repository: plain functions over prepared statements. Every function
// takes the database handle first. Lookups that find nothing return null.
import { slugify, uniqueSlug } from './slug.js';

const COLUMNS = 'id, slug, title, body, created_at AS createdAt, updated_at AS updatedAt';

/**
 * Posts, newest first (ties broken by id, newest first).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ limit?: number, offset?: number }} [options]
 */
export function listPosts(db, { limit = 10, offset = 0 } = {}) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM posts ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(limit, offset);
}

/** @returns {number} Total number of posts. */
export function countPosts(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
}

export function getPostBySlug(db, slug) {
  return db.prepare(`SELECT ${COLUMNS} FROM posts WHERE slug = ?`).get(slug) ?? null;
}

export function getPostById(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM posts WHERE id = ?`).get(id) ?? null;
}

/**
 * Create a post. The slug is derived from the title once, made unique, and
 * never changes afterwards.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ title: string, body: string }} post
 */
export function createPost(db, { title, body }) {
  return db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM posts WHERE slug = ?');
    const slug = uniqueSlug(slugify(title), (s) => !!exists.get(s));
    const now = new Date().toISOString();
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO posts (slug, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(slug, title, body, now, now);
    return getPostById(db, lastInsertRowid);
  })();
}

/**
 * Update a post's title and body. The slug is deliberately left unchanged so
 * existing links keep working.
 *
 * @returns {object|null} The updated post, or null if no post has this id.
 */
export function updatePost(db, id, { title, body }) {
  const { changes } = db
    .prepare('UPDATE posts SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(title, body, new Date().toISOString(), id);
  return changes === 0 ? null : getPostById(db, id);
}

/** @returns {boolean} True if a post was deleted. */
export function deletePost(db, id) {
  return db.prepare('DELETE FROM posts WHERE id = ?').run(id).changes > 0;
}
