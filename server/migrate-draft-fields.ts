import { db } from "./db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    ALTER TABLE claim_drafts
      ADD COLUMN IF NOT EXISTS extracted_adjuster text,
      ADD COLUMN IF NOT EXISTS extraction_confidence real,
      ADD COLUMN IF NOT EXISTS source_file_name text
  `);
  console.log("Migration complete: claim_drafts columns added");
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
