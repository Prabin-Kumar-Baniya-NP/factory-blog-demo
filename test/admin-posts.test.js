import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, makeDb, TEST_ADMIN_PASSWORD } from './helpers.js';
import { countPosts, createPost, getPostById, getPostBySlug, listPosts } from '../src/posts.js';

async function login(agent) {
  const res = await agent.post('/admin/login').type('form').send({ password: TEST_ADMIN_PASSWORD });
  assert.equal(res.status, 302, 'login succeeds');
  return agent;
}

/** A logged-in agent on a fresh app, plus its database. */
async function loggedIn(db = makeDb()) {
  const agent = request.agent(makeApp({ db }));
  await login(agent);
  return { agent, db };
}

/** All posts as plain rows, for "DB unchanged" comparisons. */
function snapshot(db) {
  return listPosts(db, { limit: countPosts(db) + 1 });
}

test('GET /admin/posts/new shows an empty form posting to /admin/posts', async () => {
  const { agent } = await loggedIn();
  const res = await agent.get('/admin/posts/new');
  assert.equal(res.status, 200);
  assert.match(res.text, /<form method="post" action="\/admin\/posts"/);
  assert.match(res.text, /<input type="text" id="title" name="title" value=""/);
  assert.match(res.text, /<textarea id="body" name="body"[^>]*><\/textarea>/);
  assert.match(res.text, /Create post/);
});

test('creating a post redirects to it and lists it on the home page', async () => {
  const { agent, db } = await loggedIn();
  const res = await agent
    .post('/admin/posts')
    .type('form')
    .send({ title: '  Hello World  ', body: 'Some **bold** text.' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/posts/hello-world');
  assert.equal(countPosts(db), 1);

  const stored = getPostBySlug(db, 'hello-world');
  assert.equal(stored.title, 'Hello World');
  assert.equal(stored.body, 'Some **bold** text.');

  const home = await request(makeApp({ db })).get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /Hello World/);

  const page = await request(makeApp({ db })).get('/posts/hello-world');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Hello World<\/h1>/);
  assert.match(page.text, /<strong>bold<\/strong>/);
});

test('editing a post changes title and body but keeps the slug', async () => {
  const db = makeDb();
  const post = createPost(db, { title: 'Original title', body: 'Original body' });
  const { agent } = await loggedIn(db);

  const form = await agent.get(`/admin/posts/${post.id}/edit`);
  assert.equal(form.status, 200);
  assert.match(form.text, new RegExp(`<form method="post" action="/admin/posts/${post.id}"`));
  assert.match(form.text, /name="title" value="Original title"/);
  assert.match(form.text, /<textarea[^>]*>Original body<\/textarea>/);
  assert.match(form.text, /href="\/posts\/original-title"/);

  const res = await agent
    .post(`/admin/posts/${post.id}`)
    .type('form')
    .send({ title: 'Brand new title', body: 'Brand new _body_' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/posts/original-title');

  const stored = getPostById(db, post.id);
  assert.equal(stored.slug, 'original-title');
  assert.equal(stored.title, 'Brand new title');
  assert.equal(stored.body, 'Brand new _body_');

  const app = makeApp({ db });
  const page = await request(app).get('/posts/original-title');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Brand new title<\/h1>/);
  assert.match(page.text, /<em>body<\/em>/);
  assert.doesNotMatch(page.text, /Original body/);

  const newSlug = await request(app).get('/posts/brand-new-title');
  assert.equal(newSlug.status, 404);
});

test('deleting a post redirects to /admin and removes it', async () => {
  const db = makeDb();
  const keep = createPost(db, { title: 'Keep me', body: 'Stay' });
  const post = createPost(db, { title: 'Delete me', body: 'Bye' });
  const { agent } = await loggedIn(db);

  const res = await agent.post(`/admin/posts/${post.id}/delete`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/admin');
  assert.equal(countPosts(db), 1);
  assert.equal(getPostById(db, post.id), null);
  assert.ok(getPostById(db, keep.id));

  const page = await request(makeApp({ db })).get('/posts/delete-me');
  assert.equal(page.status, 404);

  const again = await agent.post(`/admin/posts/${post.id}/delete`);
  assert.equal(again.status, 404);
  assert.equal(countPosts(db), 1);
});

const invalidCases = [
  {
    label: 'empty title',
    form: 'title=&body=Kept+body',
    error: /Title is required\./,
    kept: /<textarea[^>]*>Kept body<\/textarea>/,
  },
  {
    label: 'whitespace-only title',
    form: 'title=+++&body=Kept+body',
    error: /Title is required\./,
    kept: /<textarea[^>]*>Kept body<\/textarea>/,
  },
  {
    label: 'empty body',
    form: 'title=Kept+title&body=',
    error: /Body is required\./,
    kept: /name="title" value="Kept title"/,
  },
  {
    label: 'whitespace-only body',
    form: 'title=Kept+title&body=%20%0A%20',
    error: /Body is required\./,
    kept: /name="title" value="Kept title"/,
  },
  {
    label: 'missing fields',
    form: '',
    error: /Title is required\.[\s\S]*Body is required\./,
    kept: /name="title" value=""/,
  },
  {
    label: 'repeated title field',
    form: 'title=a&title=b&body=Kept+body',
    error: /Title is required\./,
    kept: /<textarea[^>]*>Kept body<\/textarea>/,
  },
];

const formRoutes = [
  { label: 'create', path: () => '/admin/posts', action: /action="\/admin\/posts"/ },
  {
    label: 'update',
    path: (post) => `/admin/posts/${post.id}`,
    action: /action="\/admin\/posts\/\d+"/,
  },
];

for (const route of formRoutes) {
  for (const c of invalidCases) {
    test(`${route.label} with ${c.label} returns 400 and keeps the input`, async () => {
      const db = makeDb();
      const post = createPost(db, { title: 'Existing', body: 'Existing body' });
      const before = snapshot(db);
      const { agent } = await loggedIn(db);

      const res = await agent.post(route.path(post)).type('form').send(c.form);
      assert.equal(res.status, 400);
      assert.match(res.text, c.error);
      assert.match(res.text, c.kept);
      assert.match(res.text, route.action);
      assert.deepEqual(snapshot(db), before);
    });
  }

  test(`${route.label} re-displays submitted values HTML-escaped`, async () => {
    const db = makeDb();
    const post = createPost(db, { title: 'Existing', body: 'Existing body' });
    const before = snapshot(db);
    const { agent } = await loggedIn(db);

    const res = await agent
      .post(route.path(post))
      .type('form')
      .send({ title: '"><script>x</script>', body: '' });
    assert.equal(res.status, 400);
    assert.doesNotMatch(res.text, /<script>x<\/script>/);
    assert.match(res.text, /value="&#34;&gt;&lt;script&gt;x&lt;\/script&gt;"/);

    const res2 = await agent
      .post(route.path(post))
      .type('form')
      .send({ title: '', body: '</textarea><script>y</script>' });
    assert.equal(res2.status, 400);
    assert.doesNotMatch(res2.text, /<script>y<\/script>/);
    assert.match(res2.text, /&lt;\/textarea&gt;&lt;script&gt;y&lt;\/script&gt;<\/textarea>/);
    assert.deepEqual(snapshot(db), before);
  });
}

for (const badId of ['999', 'abc', '0', '1.5', '-1', '01']) {
  test(`id "${badId}" returns 404 on edit, update and delete`, async () => {
    const db = makeDb();
    createPost(db, { title: 'Existing', body: 'Existing body' });
    const before = snapshot(db);
    const { agent } = await loggedIn(db);

    const edit = await agent.get(`/admin/posts/${badId}/edit`);
    assert.equal(edit.status, 404);

    const update = await agent
      .post(`/admin/posts/${badId}`)
      .type('form')
      .send({ title: 'New', body: 'New body' });
    assert.equal(update.status, 404);

    const del = await agent.post(`/admin/posts/${badId}/delete`);
    assert.equal(del.status, 404);

    assert.deepEqual(snapshot(db), before);
  });
}

test('when logged out, every post route redirects to login and changes nothing', async () => {
  const db = makeDb();
  const post = createPost(db, { title: 'Existing', body: 'Existing body' });
  const before = snapshot(db);
  const app = makeApp({ db });
  const form = { title: 'Hacked', body: 'Hacked body' };

  const responses = [
    await request(app).get('/admin/posts/new'),
    await request(app).post('/admin/posts').type('form').send(form),
    await request(app).get(`/admin/posts/${post.id}/edit`),
    await request(app).post(`/admin/posts/${post.id}`).type('form').send(form),
    await request(app).post(`/admin/posts/${post.id}/delete`),
  ];
  for (const res of responses) {
    assert.equal(res.status, 302, `${res.req.method} ${res.req.path}`);
    assert.equal(res.headers.location, '/admin/login');
  }

  assert.deepEqual(snapshot(db), before);
  assert.equal(countPosts(db), 1);
  assert.equal(getPostById(db, post.id).title, 'Existing');
  assert.equal(getPostById(db, post.id).body, 'Existing body');
});

test('/admin links to new, edit and delete for each post', async () => {
  const db = makeDb();
  const a = createPost(db, { title: 'Post A', body: 'A' });
  const b = createPost(db, { title: 'Post B', body: 'B' });
  const { agent } = await loggedIn(db);

  const res = await agent.get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /<a href="\/admin\/posts\/new">New post<\/a>/);
  for (const post of [a, b]) {
    assert.match(res.text, new RegExp(`<a href="/admin/posts/${post.id}/edit">Edit</a>`));
    assert.match(
      res.text,
      new RegExp(`<form method="post" action="/admin/posts/${post.id}/delete"[^>]*>`),
    );
  }
});

test('/admin shows the new post link when there are no posts', async () => {
  const { agent } = await loggedIn();
  const res = await agent.get('/admin');
  assert.equal(res.status, 200);
  assert.match(res.text, /No posts yet\./);
  assert.match(res.text, /<a href="\/admin\/posts\/new">New post<\/a>/);
});
