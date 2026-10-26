import pino from "pino";

export const logger = pino({
  redact: {
    paths: ["email", "token", "body", "response", "req.headers.cookie", "req.headers.authorization"],
    remove: true
  }
});
