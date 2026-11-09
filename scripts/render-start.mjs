// Runs the realtime server and the job worker in one process tree, so both fit on a
// single free Render Web Service. If either exits, stop the other and exit non-zero so
// Render restarts the whole service.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const apps = ["realtime", "worker"];

const children = apps.map((name) => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: `${root}apps/${name}`,
    stdio: "inherit",
    env: process.env
  });
  child.on("exit", (code, signal) => {
    console.error(`[render-start] ${name} exited (${signal ?? code}); stopping the service`);
    shutdown(code === 0 ? 1 : code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 10_000).unref();
  Promise.all(children.map((child) => child.exitCode !== null ? null : new Promise((resolve) => child.once("exit", resolve))))
    .then(() => process.exit(code));
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown(0));
