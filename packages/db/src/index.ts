import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return drizzle(postgres(connectionString, { max: 10, prepare: false }), { schema });
}

type Database = ReturnType<typeof connect>;
let instance: Database | undefined;

// Connect on first use, not at import, so `next build` can load route modules
// without database credentials.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    instance ??= connect();
    const value = Reflect.get(instance, property, instance);
    // $client is the postgres-js sql function; binding would hide its methods such as end().
    return typeof value === "function" && property !== "$client" ? value.bind(instance) : value;
  }
});
export { schema };
