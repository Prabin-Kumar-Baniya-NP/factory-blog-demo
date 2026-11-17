import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './helpers.js';
import {
  listPosts,
  countPosts,
  getPostBySlug,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from '../src/posts.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function setCreatedAt(db, id, createdAt) {
  db.prepare('UPDATE posts SET created_at = ? WHERE id = ?').run(createdAt, id);
}

test('createPost stores the post and returns it with camelCase timestamps', () => {
  const db = makeDb();
  const post = createPost(db, { title: 'Hello, World!', body: 'Hi there' });
  assert.equal(typeof post.id, 'number');
  assert.equal(post.slug, 'hello-world');
  assert.equal(post.title, 'Hello, World!');
  assert.equal(post.body, 'Hi there');
  assert.match(post.createdAt, ISO);
  assert.equal(post.updatedAt, post.createdAt);
  assert.deepEqual(getPostById(db, post.id), post);
  assert.deepEqual(getPostBySlug(db, 'hello-world'), post);
});

test('posts with the same title get unique slugs', () => {
  const db = makeDb();
  const a = createPost(db, { title: 'Hello, World!', body: 'a' });
  const b = createPost(db, { title: 'Hello, World!', body: 'b' });
  const c = createPost(db, { title: 'hello world', body: 'c' });
  assert.equal(a.slug, 'hello-world');
  assert.equal(b.slug, 'hello-world-2');
  assert.equal(c.slug, 'hello-world-3');
});

test('a title with no usable characters gets the slug "post"', () => {
  const db = makeDb();
  assert.equal(createPost(db, { title: '!!!', body: 'x' }).slug, 'post');
  assert.equal(createPost(db, { title: '???', body: 'x' }).slug, 'post-2');
});

test('lookups for missing posts return null', () => {
  const db = makeDb();
  assert.equal(getPostById(db, 999), null);
  assert.equal(getPostBySlug(db, 'nope'), null);
});

test('listPosts returns newest first', () => {
  const db = makeDb();
  const old = createPost(db, { title: 'Old', body: 'x' });
  const mid = createPost(db, { title: 'Mid', body: 'x' });
  const fresh = createPost(db, { title: 'New', body: 'x' });
  // Deliberately out of id order to prove sorting is by created_at.
  setCreatedAt(db, old.id, '2024-01-01T00:00:00.000Z');
  setCreatedAt(db, mid.id, '2024-06-01T00:00:00.000Z');
  setCreatedAt(db, fresh.id, '2024-03-01T00:00:00.000Z');

  assert.deepEqual(
    listPosts(db).map((p) => p.title),
    ['Mid', 'New', 'Old'],
  );
});

test('listPosts breaks created_at ties by id, newest first', () => {
  const db = makeDb();
  const ids = ['A', 'B', 'C'].map((title) => createPost(db, { title, body: 'x' }).id);
  for (const id of ids) setCreatedAt(db, id, '2024-01-01T00:00:00.000Z');

  assert.deepEqual(
    listPosts(db).map((p) => p.id),
    [...ids].reverse(),
  );
});

test('listPosts honours limit and offset; countPosts counts all', () => {
  const db = makeDb();
  for (let i = 1; i <= 25; i++) {
    const { id } = createPost(db, { title: `Post ${i}`, body: 'x' });
    setCreatedAt(db, id, `2024-01-${String(i).padStart(2, '0')}T00:00:00.000Z`);
  }

  assert.equal(countPosts(db), 25);
  assert.equal(listPosts(db).length, 10);

  const firstPage = listPosts(db, { limit: 10, offset: 0 });
  assert.equal(firstPage[0].title, 'Post 25');
  assert.equal(firstPage[9].title, 'Post 16');

  const lastPage = listPosts(db, { limit: 10, offset: 20 });
  assert.equal(lastPage.length, 5);
  assert.deepEqual(
    lastPage.map((p) => p.title),
    ['Post 5', 'Post 4', 'Post 3', 'Post 2', 'Post 1'],
  );

  assert.deepEqual(listPosts(db, { limit: 10, offset: 30 }), []);
});

test('countPosts is 0 for an empty database', () => {
  assert.equal(countPosts(makeDb()), 0);
});

test('updatePost changes title, body and updatedAt but never the slug', () => {
  const db = makeDb();
  const post = createPost(db, { title: 'Original title', body: 'old body' });
  db.prepare('UPDATE posts SET created_at = ?, updated_at = ? WHERE id = ?').run(
    '2024-01-01T00:00:00.000Z',
    '2024-01-01T00:00:00.000Z',
    post.id,
  );

  const updated = updatePost(db, post.id, { title: 'Brand new title', body: 'new body' });
  assert.equal(updated.id, post.id);
  assert.equal(updated.slug, 'original-title');
  assert.equal(updated.title, 'Brand new title');
  assert.equal(updated.body, 'new body');
  assert.equal(updated.createdAt, '2024-01-01T00:00:00.000Z');
  assert.match(updated.updatedAt, ISO);
  assert.notEqual(updated.updatedAt, '2024-01-01T00:00:00.000Z');

  assert.deepEqual(getPostBySlug(db, 'original-title'), updated);
  assert.equal(getPostBySlug(db, 'brand-new-title'), null);
});

test('updatePost on a missing id returns null', () => {
  const db = makeDb();
  assert.equal(updatePost(db, 999, { title: 't', body: 'b' }), null);
});

test('deletePost removes the post once', () => {
  const db = makeDb();
  const post = createPost(db, { title: 'Doomed', body: 'x' });
  assert.equal(deletePost(db, post.id), true);
  assert.equal(deletePost(db, post.id), false);
  assert.equal(getPostById(db, post.id), null);
  assert.equal(getPostBySlug(db, 'doomed'), null);
  assert.equal(countPosts(db), 0);
});
