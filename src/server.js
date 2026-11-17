// The only module that reads environment variables and opens a port.
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

const app = createApp({
  db: null,
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
});

app.listen(port, (err) => {
  if (err) throw err;
  console.log(`Blog listening on http://localhost:${port}`);
});
