import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { makeApp, makeDb, TEST_ADMIN_PASSWORD, TEST_SESSION_SECRET } from './helpers.js';
import { createPost } from '../src/posts.js';
import { createAdminSession, SESSION_MAX_AGE_MS } from '../src/auth.js';

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

/** Encode a session the way cookie-session does. */
function encodeSession(session) {
  return Buffer.from(JSON.stringify(session)).toString('base64');
}

/** Sign a cookie value the way cookie-session (keygrip, sha1) does. */
function sign(value, key) {
  return createHmac('sha1', key)
    .update(`session=${value}`)
    .digest('base64')
    .replace(/\/|\+|=/g, (x) => ({ '/': '_', '+': '-', '=': '' })[x]);
}

/** A Cookie header carrying `session` signed with `key`. */
function signedSessionCookie(session, key = TEST_SESSION_SECRET) {
  const value = encodeSession(session);
  return `session=${value}; session.sig=${sign(value, key)}`;
}

/** Turn the Set-Cookie headers of a login response into a Cookie header. */
function cookieHeaderFrom(res) {
  return setCookies(res)
    .map((c) => c.split(';')[0])
    .join('; ');
}

test('a forged session cookie without a valid signature is rejected', async () => {
  const app = makeApp();
  const value = encodeSession(
    createAdminSession({ adminPassword: TEST_ADMIN_PASSWORD, secret: TEST_SESSION_SECRET }),
  );

  const noSig = await request(app).get('/admin').set('Cookie', `session=${value}`);
  assert.equal(noSig.status, 302);
  assert.equal(noSig.headers.location, '/admin/login');

  const badSig = await request(app)
    .get('/admin')
    .set('Cookie', `session=${value}; session.sig=${sign(value, 'not-the-secret')}`);
  assert.equal(badSig.status, 302);
  assert.equal(badSig.headers.location, '/admin/login');
});

test('a valid session signed with the configured secret is accepted', async () => {
  // Sanity check for the forged-cookie test above: the same cookie signed with
  // the right key does work, so the rejection really is about the signature.
  const session = createAdminSession({
    adminPassword: TEST_ADMIN_PASSWORD,
    secret: TEST_SESSION_SECRET,
  });
  const res = await request(makeApp()).get('/admin').set('Cookie', signedSessionCookie(session));
  assert.equal(res.status, 200);
});

test('a correctly signed session without the password fingerprint is rejected', async () => {
  const res = await request(makeApp())
    .get('/admin')
    .set('Cookie', signedSessionCookie({ isAdmin: true, loginAt: Date.now() }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/admin/login');
});

test('an expired session is rejected', async () => {
  const session = createAdminSession({
    adminPassword: TEST_ADMIN_PASSWORD,
    secret: TEST_SESSION_SECRET,
    now: Date.now() - SESSION_MAX_AGE_MS - 1000,
  });
  const res = await request(makeApp()).get('/admin').set('Cookie', signedSessionCookie(session));
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/admin/login');
});

test('the session cookie has a max age', async () => {
  const res = await login(request.agent(makeApp()));
  const session = setCookies(res).find((c) => /^session=[^;]+/.test(c));
  assert.match(session, /;\s*expires=/i);
});

for (const [label, adminPassword] of [
  ['login is disabled (undefined password)', undefined],
  ['login is disabled (empty password)', ''],
  ['the password has changed', 'a-new-password'],
]) {
  test(`an existing session stops working once ${label}`, async () => {
    // Log in on one app, then present that cookie to an app with the same
    // session secret but a different password configuration.
    const loginRes = await login(request.agent(makeApp()));
    assert.equal(loginRes.status, 302);
    const cookie = cookieHeaderFrom(loginRes);

    const stillValid = await request(makeApp()).get('/admin').set('Cookie', cookie);
    assert.equal(stillValid.status, 200, 'the cookie works with the original password');

    const app = makeApp({ adminPassword });
    const adminRes = await request(app).get('/admin').set('Cookie', cookie);
    assert.equal(adminRes.status, 302);
    assert.equal(adminRes.headers.location, '/admin/login');
    // The stale cookie is cleared rather than left in the browser.
    assert.ok(setCookies(adminRes).some((c) => /^session=;/.test(c)));

    // The login page must not bounce back to /admin (no redirect loop).
    const loginPage = await request(app).get('/admin/login').set('Cookie', cookie);
    assert.equal(loginPage.status, 200);
  });
}

test('public pages do not set cookies', async () => {
  const res = await request(makeApp()).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers['set-cookie'], undefined);
});
