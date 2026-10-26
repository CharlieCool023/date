import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";

export async function GET() {
  const result = await db.select({
    id: schema.zones.id,
    city: schema.zones.city,
    name: schema.zones.name,
    country: schema.zones.country
  }).from(schema.zones).where(eq(schema.zones.active, true));
  return Response.json({ zones: result });
}
