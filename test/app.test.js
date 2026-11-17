import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { makeApp } from './helpers.js';

test('GET / returns the home page as HTML linking the stylesheet', async () => {
  const res = await request(makeApp()).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(res.text, /<meta name="viewport"/);
});

test('GET /styles.css serves the stylesheet', async () => {
  const res = await request(makeApp()).get('/styles.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/css/);
});

test('unknown paths return the friendly 404 page', async () => {
  const res = await request(makeApp()).get('/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /Page not found/);
  assert.match(res.text, /href="\/styles\.css"/);
  assert.doesNotMatch(res.text, /Cannot GET/);
});

test('errors thrown in a route render the error page with 500 and no stack', async (t) => {
  t.mock.method(console, 'error', () => {});
  const app = makeApp();
  app.get('/boom', () => {
    throw new Error('kaboom-secret-detail');
  });
  // createApp registers the 404 and error handlers last; move the test route
  // in front of them so the request reaches it.
  const stack = app.router.stack;
  const boomLayer = stack.pop();
  stack.splice(stack.length - 2, 0, boomLayer);

  const res = await request(app).get('/boom');
  assert.equal(res.status, 500);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /Something went wrong/);
  assert.doesNotMatch(res.text, /kaboom-secret-detail/);
  assert.doesNotMatch(res.text, /at .*\.js:\d+/);
});

test('src/app.js never reads process.env', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.env/);
});
