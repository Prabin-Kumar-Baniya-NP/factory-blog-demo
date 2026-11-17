// The only module that reads environment variables and opens a port.
import { createApp } from './app.js';
import { openSeededDb } from './seed.js';

const port = Number(process.env.PORT) || 3000;
const databasePath = process.env.DATABASE_PATH || './data/blog.db';

const { db, isNew } = openSeededDb(databasePath);
if (isNew) console.log(`Created database at ${databasePath} with sample posts`);

const app = createApp({
  db,
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
});

app.listen(port, (err) => {
  if (err) throw err;
  console.log(`Blog listening on http://localhost:${port}`);
});
