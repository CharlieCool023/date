import { createClient, type RedisClientType } from "redis";
import { anonymousRateLimitKey } from "./security";

type RedisGlobal = typeof globalThis & { velumRateRedis?: RedisClientType };
const globalRedis = globalThis as RedisGlobal;

async function client(): Promise<RedisClientType> {
  if (globalRedis.velumRateRedis?.isOpen) return globalRedis.velumRateRedis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for rate limiting");
  const redis = globalRedis.velumRateRedis ?? createClient({ url });
  redis.on("error", () => {
    console.error("Rate-limit Redis connection failed");
  });
  globalRedis.velumRateRedis = redis;
  if (!redis.isOpen) await redis.connect();
  return redis;
}

export async function allowRequest(request: Request, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redis = await client();
  const key = anonymousRateLimitKey(request, bucket);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}
