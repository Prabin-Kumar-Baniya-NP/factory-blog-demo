import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { makeApp, makeDb } from './helpers.js';
import { createPost } from '../src/posts.js';

function setCreatedAt(db, id, createdAt) {
  db.prepare('UPDATE posts SET created_at = ? WHERE id = ?').run(createdAt, id);
}

/** An app whose database holds "Post 1".."Post n", dated 2024-01-01..2024-01-n. */
function appWithPosts(n) {
  const db = makeDb();
  for (let i = 1; i <= n; i++) {
    const { id } = createPost(db, { title: `Post ${i}`, body: `Body of post ${i}` });
    setCreatedAt(db, id, `2024-01-${String(i).padStart(2, '0')}T00:00:00.000Z`);
  }
  return { app: makeApp({ db }), db };
}

function countArticles(html) {
  return (html.match(/class="post-summary"/g) ?? []).length;
}

test('home page shows the 10 newest posts with a link to older posts', async () => {
  const { app } = appWithPosts(25);
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(countArticles(res.text), 10);
  assert.match(res.text, />Post 25</);
  assert.match(res.text, />Post 16</);
  assert.doesNotMatch(res.text, />Post 15</);
  assert.match(res.text, /href="\/posts\/post-25"/);
  assert.match(res.text, /Body of post 25/);
  assert.match(res.text, /<a rel="next" href="\/\?page=2">/);
  assert.doesNotMatch(res.text, /rel="prev"/);
});

test('page 2 links back to the home page', async () => {
  const { app } = appWithPosts(25);
  const res = await request(app).get('/?page=2');
  assert.equal(res.status, 200);
  assert.equal(countArticles(res.text), 10);
  assert.match(res.text, />Post 15</);
  assert.match(res.text, /<a rel="prev" href="\/">/);
  assert.match(res.text, /<a rel="next" href="\/\?page=3">/);
});

test('the last page shows the remaining posts and no next link', async () => {
  const { app } = appWithPosts(25);
  const res = await request(app).get('/?page=3');
  assert.equal(res.status, 200);
  assert.equal(countArticles(res.text), 5);
  assert.match(res.text, />Post 5</);
  assert.match(res.text, />Post 1</);
  assert.match(res.text, /<a rel="prev" href="\/\?page=2">/);
  assert.doesNotMatch(res.text, /rel="next"/);
});

test('a page past the end is a friendly 404', async () => {
  const { app } = appWithPosts(25);
  const res = await request(app).get('/?page=4');
  assert.equal(res.status, 404);
  assert.match(res.text, /Page not found/);
});

for (const page of ['abc', '0', '-1', '1.5']) {
  test(`?page=${page} is treated as page 1`, async () => {
    const { app } = appWithPosts(25);
    const first = await request(app).get('/');
    const res = await request(app).get(`/?page=${encodeURIComponent(page)}`);
    assert.equal(res.status, 200);
    assert.equal(res.text, first.text);
  });
}

test('a repeated page parameter is treated as page 1', async () => {
  const { app } = appWithPosts(25);
  const first = await request(app).get('/');
  const res = await request(app).get('/?page=2&page=3');
  assert.equal(res.status, 200);
  assert.equal(res.text, first.text);
});

test('empty database: home page says there are no posts, page 2 is 404', async () => {
  const app = makeApp();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /No posts yet/);
  assert.equal(countArticles(res.text), 0);
  assert.doesNotMatch(res.text, /class="pagination"/);

  const page2 = await request(app).get('/?page=2');
  assert.equal(page2.status, 404);
});

test('a single page of posts has no pagination nav', async () => {
  const { app } = appWithPosts(10);
  const res = await request(app).get('/');
  assert.equal(countArticles(res.text), 10);
  assert.doesNotMatch(res.text, /class="pagination"/);
  assert.equal((await request(app).get('/?page=2')).status, 404);
});

test('post page shows the title and date', async () => {
  const { app } = appWithPosts(25);
  const res = await request(app).get('/posts/post-25');
  assert.equal(res.status, 200);
  assert.match(res.text, /<h1>Post 25<\/h1>/);
  assert.match(res.text, /<title>Post 25 \| /);
  assert.match(res.text, /datetime="2024-01-25T00:00:00\.000Z"/);
  assert.match(res.text, /January 25, 2024/);
  assert.match(res.text, /<a href="\/">Back to all posts<\/a>/);
});

test('post body is rendered as sanitized Markdown; the index shows plain text', async () => {
  const db = makeDb();
  createPost(db, { title: 'Markdown', body: '# Hi\n\n<script>alert(1)</script>' });
  const app = makeApp({ db });

  // The layout has no script tags of its own, so any <script is an injection.
  const post = await request(app).get('/posts/markdown');
  assert.equal(post.status, 200);
  assert.match(post.text, /<h1>Hi<\/h1>/);
  assert.doesNotMatch(post.text, /<script/i);
  assert.doesNotMatch(post.text, /alert\(1\)/);

  const index = await request(app).get('/');
  assert.doesNotMatch(index.text, /<h1>Hi<\/h1>/);
  assert.doesNotMatch(index.text, /<script/i);
});

test('unknown slug is a friendly 404', async () => {
  const res = await request(makeApp()).get('/posts/nope');
  assert.equal(res.status, 404);
  assert.match(res.text, /Page not found/);
});

test('titles are escaped on the index and post pages', async () => {
  const db = makeDb();
  const { slug } = createPost(db, { title: '<b>x</b>', body: 'text' });
  const app = makeApp({ db });

  for (const url of ['/', `/posts/${slug}`]) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.match(res.text, /&lt;b&gt;x&lt;\/b&gt;/, url);
    assert.doesNotMatch(res.text, /<b>x<\/b>/, url);
  }
});

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return files.flat();
}

test('the only unescaped output in the views is the sanitized post body', async () => {
  const viewsDir = fileURLToPath(new URL('../views', import.meta.url));
  const found = [];
  for (const file of await listFiles(viewsDir)) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    for (const line of lines) {
      if (line.includes('include(')) continue;
      for (const match of line.matchAll(/<%-.*?(?:%>|$)/g)) {
        found.push(`${path.relative(viewsDir, file)}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(found, ['post.ejs: <%- bodyHtml %>']);
});
