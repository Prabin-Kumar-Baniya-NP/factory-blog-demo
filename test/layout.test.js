import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { makeApp, makeDb, TEST_ADMIN_PASSWORD } from './helpers.js';
import { createPost } from '../src/posts.js';

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const STYLESHEET = '<link rel="stylesheet" href="/styles.css">';

function assertLayout(res, label) {
  assert.match(res.headers['content-type'], /text\/html/, `${label}: HTML`);
  assert.ok(res.text.includes(VIEWPORT), `${label}: has the viewport meta tag`);
  assert.ok(res.text.includes(STYLESHEET), `${label}: links /styles.css`);
}

test('every page has the viewport meta tag and the stylesheet', async () => {
  const db = makeDb();
  let post;
  for (let i = 1; i <= 11; i++) post = createPost(db, { title: `Post ${i}`, body: `Body ${i}` });

  const app = makeApp({ db });
  const agent = request.agent(app);

  const pages = [
    ['home page', () => request(app).get('/'), 200],
    ['home page 2', () => request(app).get('/?page=2'), 200],
    ['post page', () => request(app).get(`/posts/${post.slug}`), 200],
    ['404 page', () => request(app).get('/does-not-exist'), 404],
    [
      'error page',
      () => request(app).post('/admin/login').type('form').send({ password: 'x'.repeat(200_000) }),
      413,
    ],
    ['admin login', () => request(app).get('/admin/login'), 200],
    [
      'admin login (wrong password)',
      () => request(app).post('/admin/login').type('form').send({ password: 'wrong' }),
      401,
    ],
    ['admin login (disabled)', () => request(makeApp({ adminPassword: '' })).get('/admin/login'), 200],
  ];
  for (const [label, send, status] of pages) {
    const res = await send();
    assert.equal(res.status, status, `${label}: status`);
    assertLayout(res, label);
  }

  const login = await agent.post('/admin/login').type('form').send({ password: TEST_ADMIN_PASSWORD });
  assert.equal(login.status, 302, 'login succeeds');

  const adminPages = [
    ['admin index', () => agent.get('/admin'), 200],
    ['new post form', () => agent.get('/admin/posts/new'), 200],
    ['edit post form', () => agent.get(`/admin/posts/${post.id}/edit`), 200],
    [
      'post form with errors',
      () => agent.post('/admin/posts').type('form').send({ title: '', body: '' }),
      400,
    ],
  ];
  for (const [label, send, status] of adminPages) {
    const res = await send();
    assert.equal(res.status, status, `${label}: status`);
    assertLayout(res, label);
  }
});

test('the stylesheet is plain CSS with a mobile breakpoint', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media[^{]*max-width/);
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /@tailwind|bootstrap/i);
});
