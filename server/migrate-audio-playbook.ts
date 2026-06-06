import { db } from "./db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    ALTER TABLE audio_recordings
      ADD COLUMN IF NOT EXISTS evidence_file_id varchar,
      ADD COLUMN IF NOT EXISTS transcript_status text DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS transcript_error text
  `);
  await db.execute(sql`
    ALTER TABLE playbook_entries
      ADD COLUMN IF NOT EXISTS outcome_type text,
      ADD COLUMN IF NOT EXISTS adjuster_id varchar,
      ADD COLUMN IF NOT EXISTS vendor_id varchar,
      ADD COLUMN IF NOT EXISTS state text
  `);
  console.log("Migration complete: audio recordings + playbook entries columns added");
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
