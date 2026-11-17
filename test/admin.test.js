import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { makeApp, makeDb, TEST_ADMIN_PASSWORD, TEST_SESSION_SECRET } from './helpers.js';
import { createPost } from '../src/posts.js';

/** Set-Cookie headers as an array (empty when none were sent). */
function setCookies(res) {
  return res.headers['set-cookie'] ?? [];
}

/** True if the response sets the `session` cookie to a non-empty value. */
function setsSessionValue(res) {
  return setCookies(res).some((c) => /^session=[^;]+/.test(c));
}

async function login(agent, password = TEST_ADMIN_PASSWORD) {
  return agent.post('/admin/login').type('form').send({ password });
}

test('GET /admin redirects to the login page when logged out', async () => {
  const res = await request(makeApp()).get('/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/admin/login');
});

test('GET /admin/login shows a password form posting to /admin/login', async () => {
  const res = await request(makeApp()).get('/admin/login');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /<form method="post" action="\/admin\/login">/);
  assert.match(res.text, /<input type="password"[^>]*name="password"/);
  assert.doesNotMatch(res.text, /Admin login is disabled/);
});

test('a wrong password returns 401 with an error and no session cookie', async () => {
  const res = await request(makeApp()).post('/admin/login').type('form').send({ password: 'nope' });
  assert.equal(res.status, 401);
  assert.match(res.text, /Incorrect password\./);
  assert.equal(setsSessionValue(res), false);
});

test('a repeated password field is rejected', async () => {
  const res = await request(makeApp())
    .post('/admin/login')
    .type('form')
    .send(`password=${TEST_ADMIN_PASSWORD}&password=${TEST_ADMIN_PASSWORD}`);
  assert.equal(res.status, 401);
  assert.equal(setsSessionValue(res), false);
});

test('the correct password logs in, lists posts, and logout ends the session', async () => {
  const db = makeDb();
  createPost(db, { title: 'First <post>', body: 'One' });
  createPost(db, { title: 'Second post', body: 'Two' });
  const agent = request.agent(makeApp({ db }));

  const loginRes = await login(agent);
  assert.equal(loginRes.status, 302);
  assert.equal(loginRes.headers.location, '/admin');
  const cookies = setCookies(loginRes);
  const session = cookies.find((c) => /^session=[^;]+/.test(c));
  assert.ok(session, 'sets the session cookie');
  assert.match(session, /;\s*httponly/i);
  assert.match(session, /;\s*samesite=lax/i);
  assert.ok(
    cookies.some((c) => /^session\.sig=[^;]+/.test(c)),
    'sets the session.sig cookie',
  );

  const adminRes = await agent.get('/admin');
  assert.equal(adminRes.status, 200);
  assert.match(adminRes.text, /<h1>Admin<\/h1>/);
  assert.match(adminRes.text, /First &lt;post&gt;/);
  assert.doesNotMatch(adminRes.text, /First <post>/);
  assert.match(adminRes.text, /<a href="\/posts\/second-post">Second post<\/a>/);
  assert.match(adminRes.text, /<form method="post" action="\/admin\/logout">/);

  const loginPage = await agent.get('/admin/login');
  assert.equal(loginPage.status, 302);
  assert.equal(loginPage.headers.location, '/admin');

  const logoutRes = await agent.post('/admin/logout');
  assert.equal(logoutRes.status, 302);
  assert.equal(logoutRes.headers.location, '/admin/login');

  const afterLogout = await agent.get('/admin');
  assert.equal(afterLogout.status, 302);
  assert.equal(afterLogout.headers.location, '/admin/login');
});

test('GET /admin shows a message when there are no posts', async () => {
  const agent = request.agent(makeApp());
  await login(agent);
  const res = await agent.get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /No posts yet\./);
});

for (const adminPassword of [undefined, '']) {
  const label = adminPassword === undefined ? 'undefined' : 'empty';

  test(`with an ${label} admin password, no password is accepted`, async () => {
    const app = makeApp({ adminPassword });
    const attempts = [
      request(app).post('/admin/login').type('form').send({ password: '' }),
      request(app).post('/admin/login').type('form').send({}),
      request(app).post('/admin/login').type('form').send('password=undefined'),
      request(app).post('/admin/login'),
    ];
    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 401);
      assert.match(res.text, /Admin login is disabled\./);
      assert.equal(setsSessionValue(res), false);
    }

    const adminRes = await request(app).get('/admin');
    assert.equal(adminRes.status, 302);
    assert.equal(adminRes.headers.location, '/admin/login');
  });

  test(`with an ${label} admin password, the login page shows a notice and no form`, async () => {
    const res = await request(makeApp({ adminPassword })).get('/admin/login');
    assert.equal(res.status, 200);
    assert.match(res.text, /ADMIN_PASSWORD/);
    assert.doesNotMatch(res.text, /<form/);
    assert.doesNotMatch(res.text, /type="password"/);
  });
}

test('a forged session cookie without a valid signature is rejected', async () => {
  const app = makeApp();
  const value = Buffer.from(JSON.stringify({ isAdmin: true })).toString('base64');

  const noSig = await request(app).get('/admin').set('Cookie', `session=${value}`);
  assert.equal(noSig.status, 302);
  assert.equal(noSig.headers.location, '/admin/login');

  const wrongSig = createHmac('sha1', 'not-the-secret')
    .update(`session=${value}`)
    .digest('base64')
    .replace(/\/|\+|=/g, (x) => ({ '/': '_', '+': '-', '=': '' })[x]);
  const badSig = await request(app)
    .get('/admin')
    .set('Cookie', `session=${value}; session.sig=${wrongSig}`);
  assert.equal(badSig.status, 302);
  assert.equal(badSig.headers.location, '/admin/login');
});

test('a session signed with the configured secret is accepted', async () => {
  // Sanity check for the forged-cookie test above: the same cookie signed with
  // the right key does work, so the rejection really is about the signature.
  const value = Buffer.from(JSON.stringify({ isAdmin: true })).toString('base64');
  const sig = createHmac('sha1', TEST_SESSION_SECRET)
    .update(`session=${value}`)
    .digest('base64')
    .replace(/\/|\+|=/g, (x) => ({ '/': '_', '+': '-', '=': '' })[x]);
  const res = await request(makeApp())
    .get('/admin')
    .set('Cookie', `session=${value}; session.sig=${sig}`);
  assert.equal(res.status, 200);
});

test('public pages do not set cookies', async () => {
  const res = await request(makeApp()).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers['set-cookie'], undefined);
});
