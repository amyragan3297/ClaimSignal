import { db } from "./db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE biz_company_type AS ENUM (
        'insurance_carrier', 'adjusting_firm', 'restoration_contractor', 'roofing_contractor',
        'public_adjuster', 'engineering_firm', 'law_firm', 'vendor', 'tpa', 'other'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE biz_relationship_status AS ENUM (
        'prospect', 'active', 'partner', 'inactive'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE biz_outreach_purpose AS ENUM (
        'sales', 'partnership', 'founder_recruitment', 'investor_outreach', 'enterprise_prospect'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS biz_companies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      company_type biz_company_type NOT NULL DEFAULT 'other',
      website text,
      main_phone text,
      general_email text,
      contact_person_name text,
      contact_title text,
      direct_phone text,
      direct_email text,
      state text,
      service_area text,
      relationship_status biz_relationship_status NOT NULL DEFAULT 'prospect',
      outreach_purposes text[],
      notes text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);

  console.log("Migration complete: biz_companies table created");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
