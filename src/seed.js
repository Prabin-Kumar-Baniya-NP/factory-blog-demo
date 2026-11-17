import { openDb } from './db.js';
import { createPost } from './posts.js';

export const SAMPLE_POSTS = [
  {
    title: 'Welcome to the blog',
    body: [
      'Welcome! This is the first post on a brand new blog.',
      'Posts are written in **Markdown**, so you can use *emphasis*, lists, links and code.',
      'Have a look around, then sign in as the admin to write something of your own.',
    ].join('\n\n'),
  },
  {
    title: 'Writing your first post',
    body: [
      'Writing a post takes three steps:',
      '1. Sign in to the admin area.\n2. Click **New post** and give it a title.\n3. Write the body in Markdown and save.',
      'The address of a post is based on its title when it is created. Editing the title later keeps the same address, so links never break.',
    ].join('\n\n'),
  },
];

/**
 * Insert the sample posts in a single transaction.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number} Number of posts inserted.
 */
export function seedPosts(db) {
  return db.transaction(() => {
    for (const post of SAMPLE_POSTS) createPost(db, post);
    return SAMPLE_POSTS.length;
  })();
}

/**
 * Open the database and seed it with sample posts only if it was just created.
 *
 * @param {string} filename
 * @returns {{ db: import('better-sqlite3').Database, isNew: boolean }}
 */
export function openSeededDb(filename) {
  const { db, isNew } = openDb(filename);
  if (isNew) seedPosts(db);
  return { db, isNew };
}
