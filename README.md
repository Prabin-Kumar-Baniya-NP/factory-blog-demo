# factory-blog-demo
Demo target for claude-software-factory: a basic blog app built autonomously from GitHub issues.

## Running

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Configuration is read from environment variables:

| Variable        | Default           | Purpose                              |
| --------------- | ----------------- | ------------------------------------ |
| `PORT`          | `3000`            | Port the server listens on.          |
| `DATABASE_PATH` | `./data/blog.db`  | SQLite database file.                |

On first run the database file (and its parent directory) is created, the schema
is set up, and two sample posts are added. Later runs reuse the existing database
and never re-seed, even if you delete the sample posts.

Run the tests with `npm test`; they use in-memory databases and leave no files behind.
