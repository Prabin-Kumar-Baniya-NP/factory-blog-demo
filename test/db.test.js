import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, MIGRATIONS } from '../src/db.js';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-db-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('openDb creates missing parent directories and reports isNew', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'nested', 'deeper', 'blog.db');

  const first = openDb(file);
  assert.equal(first.isNew, true);
  assert.ok(fs.existsSync(file));
  first.db.close();

  const second = openDb(file);
  assert.equal(second.isNew, false);
  second.db.close();
});

test('openDb(":memory:") is always new', () => {
  const { db, isNew } = openDb(':memory:');
  assert.equal(isNew, true);
  db.close();
});

test('openDb defaults to an in-memory database', () => {
  const { db, isNew } = openDb();
  assert.equal(isNew, true);
  assert.equal(db.memory, true);
  db.close();
});

test('migrations set user_version and are not re-run on reopen', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'blog.db');

  const first = openDb(file);
  assert.equal(MIGRATIONS.length, 1);
  assert.equal(first.db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  first.db
    .prepare(
      "INSERT INTO posts (slug, title, body, created_at, updated_at) VALUES ('keep', 'Keep', 'b', 'x', 'x')",
    )
    .run();
  first.db.close();

  // Re-running migration 1 would fail (table exists) or lose data.
  const second = openDb(file);
  assert.equal(second.db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(second.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1);
  second.db.close();
});

test('openDb enables WAL on file databases and foreign keys', (t) => {
  const dir = tempDir(t);
  const { db } = openDb(path.join(dir, 'blog.db'));
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
});

test('posts.slug is unique at the database level', () => {
  const { db } = openDb(':memory:');
  const insert = db.prepare(
    "INSERT INTO posts (slug, title, body, created_at, updated_at) VALUES ('same', 't', 'b', 'x', 'x')",
  );
  insert.run();
  assert.throws(() => insert.run(), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  db.close();
});
