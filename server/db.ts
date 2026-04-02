import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

// Remove invalid password from DATABASE_URL if present and not needed
let connectionString = process.env.DATABASE_URL;
try {
  const url = new URL(connectionString);
  // If password looks like a Neon API key (starts with npg_), try without it
  if (url.password && url.password.startsWith("npg_")) {
    url.password = "";
    connectionString = url.toString();
  }
} catch (e) {
  // If URL parsing fails, continue with original string
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
