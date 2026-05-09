import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"

const databasePath = resolve(process.env.DATABASE_PATH ?? ".tmp/e2e/arr-hub.db")
const port = process.env.PORT ?? "3100"
const env = {
  ...process.env,
  ARR_HUB_E2E_FIXTURES: "1",
  DATABASE_PATH: databasePath,
  PORT: port,
  TMDB_API_KEY: process.env.TMDB_API_KEY ?? "e2e-fixture",
}

mkdirSync(dirname(databasePath), { recursive: true })
for (const suffix of ["", "-shm", "-wal", "-journal"]) {
  rmSync(`${databasePath}${suffix}`, { force: true })
}

const push = spawnSync("bunx", ["drizzle-kit", "push"], {
  env,
  stdio: "inherit",
})

if (push.status !== 0) {
  process.exit(push.status ?? 1)
}

const server = spawn("bunx", ["vite", "dev", "--host", "127.0.0.1", "--port", port], {
  env,
  stdio: "inherit",
})

const stop = (signal) => {
  server.kill(signal)
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
