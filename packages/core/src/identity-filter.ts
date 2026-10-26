const identityPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:https?:\/\/|www\.)\S+/i,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/,
  /(?:^|\s)@[a-z0-9_]{2,}/i,
  /\b(?:instagram|snapchat|telegram|whatsapp|tiktok|twitter|facebook)\s*[:@/]?\s*[a-z0-9_.-]{2,}/i
];

export function containsIdentityLeak(message: string): boolean {
  return identityPatterns.some((pattern) => pattern.test(message));
}

