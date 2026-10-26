import "dotenv/config";
import { createInvites } from "@velum/core";
import { parseAesKey } from "@velum/crypto";
import { db } from "@velum/db";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const command = process.argv[2];
  if (command !== "invite:mint") {
    console.error("Usage: pnpm cli invite:mint --email=you@example.com [--email=friend@example.com] [--zone=<uuid>]");
    process.exitCode = 2;
    return;
  }
  const emails = process.argv.filter((arg) => arg.startsWith("--email="))
    .map((arg) => arg.slice("--email=".length));
  if (emails.length === 0 || emails.some((email) => email.trim().length === 0)) {
    throw new Error("At least one --email=address is required");
  }
  const blindIndexKey = process.env.BLIND_INDEX_KEY;
  const masterKey = process.env.LOCAL_DEV_MASTER_KEY;
  if (!blindIndexKey || blindIndexKey.length < 32 || !masterKey) {
    throw new Error("BLIND_INDEX_KEY and LOCAL_DEV_MASTER_KEY must be configured");
  }
  const ids = await createInvites({
    emails,
    ...(option("zone") ? { zoneId: option("zone") } : {})
  }, {
    inviterId: null,
    blindIndexKey,
    encryptionKey: parseAesKey(masterKey)
  });
  console.info(`Queued ${ids.length} founding invitation(s). No invitation tokens were printed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Invitation minting failed.");
  process.exitCode = 1;
}).finally(() => db.$client.end());
