#!/bin/sh
set -eu

node --input-type=module <<'JS'
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const db = drizzle(process.env.DATABASE_URL || "database.sqlite");
try {
  migrate(db, { migrationsFolder: "drizzle" });
  db.$client.exec("VACUUM");
} finally {
  db.$client.close();
}
JS

exec "$@"
