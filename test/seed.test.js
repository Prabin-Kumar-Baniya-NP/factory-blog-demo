import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { countPosts, listPosts } from '../src/posts.js';
import { SAMPLE_POSTS, seedPosts, openSeededDb } from '../src/seed.js';

test('there are two sample posts', () => {
  assert.equal(SAMPLE_POSTS.length, 2);
  for (const post of SAMPLE_POSTS) {
    assert.ok(post.title.length > 0);
    assert.match(post.body, /\n\n/, 'body should have several paragraphs');
  }
});

test('seedPosts inserts the sample posts and returns the count', () => {
  const { db } = openDb(':memory:');
  assert.equal(seedPosts(db), 2);
  assert.equal(countPosts(db), 2);
  assert.deepEqual(
    listPosts(db).map((p) => p.slug).sort(),
    ['welcome-to-the-blog', 'writing-your-first-post'],
  );
  db.close();
});

test('openDb alone does not seed', () => {
  const { db } = openDb(':memory:');
  assert.equal(countPosts(db), 0);
  db.close();
});

test('openSeededDb seeds only when the database file is first created', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-seed-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data', 'blog.db');

  const first = openSeededDb(file);
  assert.equal(first.isNew, true);
  assert.equal(countPosts(first.db), 2);
  first.db.close();

  const second = openSeededDb(file);
  assert.equal(second.isNew, false);
  assert.equal(countPosts(second.db), 2);
  second.db.close();
});
