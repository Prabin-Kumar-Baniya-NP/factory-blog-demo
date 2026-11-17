import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Schema migrations, applied in order. Migration `i` brings the database to
 * `PRAGMA user_version = i + 1`. Never edit an existing entry; append a new one.
 */
export const MIGRATIONS = [
  `CREATE TABLE posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     slug TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX posts_created_at ON posts (created_at DESC, id DESC);`,
];

/**
 * Open (or create) a SQLite database and bring its schema up to date.
 *
 * @param {string} [filename] Path to the database file, or ':memory:'.
 * @returns {{ db: import('better-sqlite3').Database, isNew: boolean }}
 *   `isNew` is true when the database had no schema before this call.
 */
export function openDb(filename = ':memory:') {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const version = db.pragma('user_version', { simple: true });
  const isNew = version === 0;

  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }

  return { db, isNew };
}
