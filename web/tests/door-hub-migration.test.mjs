import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("Door Hub migration creates indexed demo records", async () => {
  const migrationRoot = new URL("../drizzle/", import.meta.url);
  const files = (await readdir(migrationRoot)).filter((name) => name.endsWith(".sql")).sort();
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const file of files) database.exec(await readFile(new URL(file, migrationRoot), "utf8"));

  const table = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'door_hub_events'").get();
  assert.equal(table.name, "door_hub_events");
  const count = database.prepare("SELECT COUNT(*) AS count FROM door_hub_events").get();
  assert.equal(count.count, 3);
  const latest = database.prepare("SELECT external_event_id, schema_version, output_target FROM door_hub_events ORDER BY generated_at DESC LIMIT 1").get();
  assert.equal(latest.external_event_id, 1042);
  assert.equal(latest.schema_version, "door-hub-event/1");
  assert.equal(latest.output_target, "led");

  const plan = database.prepare("EXPLAIN QUERY PLAN SELECT * FROM door_hub_events WHERE household_id = ? ORDER BY generated_at DESC LIMIT 10").all("demo-household-01");
  assert.match(plan.map((row) => row.detail).join(" "), /door_hub_events_household_generated_idx/);
  database.exec("PRAGMA optimize");
});
