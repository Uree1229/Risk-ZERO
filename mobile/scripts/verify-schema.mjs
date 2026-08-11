import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const source = fs.readFileSync(
  new URL("../src/storage/schema.ts", import.meta.url),
  "utf8",
);
const sql = source
  .split("MOBILE_SCHEMA_SQL = `", 2)[1]
  ?.split("`;", 1)[0];

if (!sql) throw new Error("MOBILE_SCHEMA_SQL was not found.");

const database = new DatabaseSync(":memory:");
database.exec(sql);
const tables = database
  .prepare(
    "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all()
  .map(({ name }) => name);

console.log(`${tables.length} tables: ${tables.join(", ")}`);
if (tables.length !== 18) {
  throw new Error(`Expected 18 mobile tables, found ${tables.length}.`);
}
