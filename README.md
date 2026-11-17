# factory-blog-demo
Demo target for claude-software-factory: a basic blog app built autonomously from GitHub issues.

A small blog built with Express 5, EJS and SQLite. Posts are written in Markdown,
listed newest first on a paginated home page, and managed from a password-protected
admin area.

## Requirements

- Node.js 20 or newer (`engines.node` is `>=20` in `package.json`).
- npm (comes with Node.js).

## Install

```sh
npm install
```

## Commands

| Command       | What it does                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `npm start`   | Starts the server (`node src/server.js`) on `http://localhost:3000` by default. |
| `npm test`    | Runs the test suite (`node --test test/*.test.js`).                          |

The tests use in-memory databases and leave no files behind.

Example, with admin login enabled and sessions that survive restarts:

```sh
ADMIN_PASSWORD='choose-a-password' SESSION_SECRET="$(openssl rand -hex 32)" npm start
```

## Configuration

Configuration is read from environment variables (only in `src/server.js`):

| Variable         | Default          | Purpose                                                                                                                                                                         |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`           | `3000`           | Port the server listens on.                                                                                                                                                     |
| `DATABASE_PATH`  | `./data/blog.db` | SQLite database file, relative to the directory you start the server from. Its parent directory is created if needed.                                                         |
| `ADMIN_PASSWORD` | unset            | Password for the admin area. When unset or empty, admin login is **disabled**: no password is accepted and the login page says so. A warning is logged at startup.            |
| `SESSION_SECRET` | unset            | Secret used to sign the admin session cookie. When unset, a random secret is generated each time the server starts, so **every admin session ends when the server restarts**. A warning is logged at startup. |

Set `SESSION_SECRET` to a long random value (for example `openssl rand -hex 32`) and
keep it the same across restarts if admins should stay logged in.

On first run the database file (and its parent directory) is created, the schema
is set up, and two sample posts are added. Later runs reuse the existing database
and never re-seed, even if you delete the sample posts.

## Admin usage

1. Start the server with `ADMIN_PASSWORD` set.
2. Open `http://localhost:3000/admin/login` and enter the password. You are taken to
   `/admin`, which lists every post.
3. **Create** a post: click **New post** (`/admin/posts/new`), enter a title and a
   Markdown body, and click **Create post**. You are taken to the new post, whose URL
   (`/posts/<slug>`) is generated from the title.
4. **Edit** a post: click **Edit** next to it in the list, change the title or body,
   and click **Save changes**. You are taken to the updated post. Its URL does not
   change when you edit the title.
5. **Delete** a post: click **Delete** next to it in the list. It is removed
   immediately, with no confirmation step.
6. **Log out** with the **Log out** button at the bottom of `/admin`.

Sessions are kept in a signed cookie and last up to 12 hours after login. A session
also ends when the server restarts without `SESSION_SECRET` set, or when
`ADMIN_PASSWORD` changes or is removed.

Markdown in post bodies is rendered to HTML and sanitized, so raw HTML in a post
cannot run scripts.
