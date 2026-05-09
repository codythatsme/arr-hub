import { execFileSync, spawnSync } from "node:child_process"

const ROOT = new URL("..", import.meta.url).pathname

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: Object.assign({}, process.env, options.env),
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n")
    throw new Error(`${command} ${args.join(" ")} failed${output ? `\n${output}` : ""}`)
  }
  return result.stdout?.trim() ?? ""
}

function docker(args, options) {
  return run("docker", args, options)
}

function dockerOutput(args) {
  return docker(args, { capture: true })
}

function stopContainer(name) {
  spawnSync("docker", ["stop", name], { cwd: ROOT, stdio: "ignore" })
}

function removeVolume(name) {
  spawnSync("docker", ["volume", "rm", name], { cwd: ROOT, stdio: "ignore" })
}

function tempVolume(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function waitForLogs(name, pattern, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const logs = dockerOutput(["logs", name])
    const match = pattern.exec(logs)
    if (match) return { logs, match }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  throw new Error(`timed out waiting for ${name} logs to match ${pattern}`)
}

function runLiveTest(env) {
  run("bun", ["run", "test:live-adapters"], { env })
}

function pull(image) {
  docker(["pull", image])
}

function runSabnzbd() {
  const name = "arr-hub-live-sabnzbd"
  const volume = tempVolume("arr-hub-live-sabnzbd-config")
  const image = "lscr.io/linuxserver/sabnzbd:latest"
  stopContainer(name)
  pull(image)
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-p",
    "38080:8080",
    "-e",
    "PUID=1000",
    "-e",
    "PGID=1000",
    "-e",
    "TZ=UTC",
    "-v",
    `${volume}:/config`,
    image,
  ])

  try {
    waitForLogs(name, /ENGINE Bus STARTED/i)
    docker([
      "exec",
      name,
      "sed",
      "-i",
      "-e",
      "s/^host_whitelist =.*/host_whitelist = localhost,127.0.0.1/",
      "-e",
      "s/^inet_exposure =.*/inet_exposure = 3/",
      "/config/sabnzbd.ini",
    ])
    docker(["restart", name])
    waitForLogs(name, /ENGINE Bus STARTED/i)
    const config = dockerOutput(["exec", name, "grep", "^api_key", "/config/sabnzbd.ini"])
    const apiKey = config.split("=").at(1)?.trim()
    if (!apiKey) throw new Error("failed to read SABnzbd API key")
    runLiveTest({
      ARR_HUB_LIVE_SAB_HOST: "localhost",
      ARR_HUB_LIVE_SAB_PORT: "38080",
      ARR_HUB_LIVE_SAB_API_KEY: apiKey,
    })
  } finally {
    stopContainer(name)
    removeVolume(volume)
  }
}

function runQbittorrent() {
  const name = "arr-hub-live-qbit"
  const volume = tempVolume("arr-hub-live-qbit-config")
  const image = "lscr.io/linuxserver/qbittorrent:latest"
  stopContainer(name)
  pull(image)
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-p",
    "8080:8080",
    "-p",
    "36881:6881",
    "-p",
    "36881:6881/udp",
    "-e",
    "PUID=1000",
    "-e",
    "PGID=1000",
    "-e",
    "TZ=UTC",
    "-e",
    "WEBUI_PORT=8080",
    "-v",
    `${volume}:/config`,
    image,
  ])

  try {
    const { match } = waitForLogs(
      name,
      /temporary password is provided for this session: ([^\s]+)/i,
    )
    const password = match[1]
    runLiveTest({
      ARR_HUB_LIVE_QBIT_HOST: "localhost",
      ARR_HUB_LIVE_QBIT_PORT: "8080",
      ARR_HUB_LIVE_QBIT_USERNAME: "admin",
      ARR_HUB_LIVE_QBIT_PASSWORD: password,
    })
  } finally {
    stopContainer(name)
    removeVolume(volume)
  }
}

function runProwlarr() {
  const name = "arr-hub-live-prowlarr"
  const volume = tempVolume("arr-hub-live-prowlarr-config")
  const image = "lscr.io/linuxserver/prowlarr:latest"
  stopContainer(name)
  pull(image)
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-p",
    "39696:9696",
    "-e",
    "PUID=1000",
    "-e",
    "PGID=1000",
    "-e",
    "TZ=UTC",
    "-v",
    `${volume}:/config`,
    image,
  ])

  try {
    waitForLogs(name, /Application started/i)
    const config = dockerOutput(["exec", name, "sed", "-n", "1,120p", "/config/config.xml"])
    const apiKey = /<ApiKey>([^<]+)<\/ApiKey>/.exec(config)?.[1]
    if (!apiKey) throw new Error("failed to read Prowlarr API key")
    runLiveTest({
      ARR_HUB_LIVE_TORZNAB_URL: "http://127.0.0.1:39696/0",
      ARR_HUB_LIVE_TORZNAB_API_KEY: apiKey,
    })
  } finally {
    stopContainer(name)
    removeVolume(volume)
  }
}

function runOptionalPlex() {
  const hasPlex = process.env.ARR_HUB_LIVE_PLEX_HOST && process.env.ARR_HUB_LIVE_PLEX_TOKEN
  if (!hasPlex) {
    console.log("Skipping Plex live adapter check: ARR_HUB_LIVE_PLEX_HOST/TOKEN not set.")
    return
  }
  runLiveTest({
    ARR_HUB_LIVE_PLEX_HOST: process.env.ARR_HUB_LIVE_PLEX_HOST,
    ARR_HUB_LIVE_PLEX_TOKEN: process.env.ARR_HUB_LIVE_PLEX_TOKEN,
    ARR_HUB_LIVE_PLEX_PORT: process.env.ARR_HUB_LIVE_PLEX_PORT ?? "32400",
    ARR_HUB_LIVE_PLEX_SSL: process.env.ARR_HUB_LIVE_PLEX_SSL ?? "",
  })
}

try {
  execFileSync("docker", ["version"], { stdio: "ignore" })
  runSabnzbd()
  runQbittorrent()
  runProwlarr()
  runOptionalPlex()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
