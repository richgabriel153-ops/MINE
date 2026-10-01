import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** Minimal stand-ins for the parts of Supabase the migrations use (auth + storage + roles). */
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
`;

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Supabase gives the service role full table access by default.
  await db.exec(`grant all on all tables in schema public to service_role;
                 grant all on all sequences in schema public to service_role, authenticated;
                 grant execute on all functions in schema public to service_role;`);
  return db;
}

export interface TestUser {
  id: string;
  email: string;
}

let n = 0;
export async function makeUser(db: PGlite, email: string): Promise<TestUser> {
  n += 1;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.query("reset role");
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

/** Run the next queries as this signed-in user (like a request with their login token). */
export async function as(db: PGlite, user: TestUser | null) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user?.id ?? ""]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [user ? JSON.stringify({ sub: user.id, email: user.email }) : ""]);
  await db.query(user ? "set role authenticated" : "set role anon");
}

export async function asService(db: PGlite) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("set role service_role");
}

export async function one<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params);
  return res.rows[0];
}
