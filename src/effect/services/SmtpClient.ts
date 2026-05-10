import * as net from "node:net"
import { createInterface } from "node:readline"
import * as tls from "node:tls"

export type SmtpSecurity = "none" | "starttls" | "tls"

export interface SmtpEmailInput {
  readonly host: string
  readonly port: number
  readonly security: SmtpSecurity
  readonly username?: string
  readonly password?: string
  readonly from: string
  readonly to: ReadonlyArray<string>
  readonly subject: string
  readonly text: string
}

interface SmtpResponse {
  readonly code: number
  readonly lines: ReadonlyArray<string>
}

interface SmtpSession {
  readonly socket: net.Socket | tls.TLSSocket
  readonly readResponse: () => Promise<SmtpResponse>
  readonly sendLine: (line: string) => Promise<void>
  readonly close: () => void
}

const SMTP_TIMEOUT_MS = 30_000

function waitForSocket(socket: net.Socket | tls.TLSSocket, event: "connect" | "secureConnect") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off(event, onReady)
      socket.off("error", onError)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    socket.once(event, onReady)
    socket.once("error", onError)
  })
}

function makeSession(socket: net.Socket | tls.TLSSocket): SmtpSession {
  const lines = createInterface({ input: socket, crlfDelay: Infinity })
  const iterator = lines[Symbol.asyncIterator]()

  return {
    socket,
    readResponse: async () => {
      const responseLines: Array<string> = []
      const readNextLine = async (): Promise<SmtpResponse> => {
        const next = await iterator.next()
        if (next.done || typeof next.value !== "string") {
          throw new Error("SMTP server closed the connection")
        }

        responseLines.push(next.value)
        if (/^\d{3} /.test(next.value)) {
          const code = Number(next.value.slice(0, 3))
          return { code, lines: responseLines }
        }

        return readNextLine()
      }

      return readNextLine()
    },
    sendLine: (line) =>
      new Promise<void>((resolve, reject) => {
        socket.write(`${line}\r\n`, (error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
    close: () => lines.close(),
  }
}

async function connectSmtp(input: SmtpEmailInput): Promise<SmtpSession> {
  const socket =
    input.security === "tls"
      ? tls.connect({ host: input.host, port: input.port, servername: input.host })
      : net.connect({ host: input.host, port: input.port })

  socket.setTimeout(SMTP_TIMEOUT_MS, () => socket.destroy(new Error("SMTP connection timed out")))
  await waitForSocket(socket, input.security === "tls" ? "secureConnect" : "connect")
  return makeSession(socket)
}

async function expectResponse(
  session: SmtpSession,
  expectedCodes: ReadonlyArray<number>,
): Promise<SmtpResponse> {
  const response = await session.readResponse()
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP server returned ${response.code}`)
  }
  return response
}

async function command(
  session: SmtpSession,
  line: string,
  expectedCodes: ReadonlyArray<number>,
): Promise<SmtpResponse> {
  await session.sendLine(line)
  return expectResponse(session, expectedCodes)
}

function sanitizeHeader(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim()
}

function dotStuff(value: string): string {
  return value
    .replaceAll(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n")
}

function addressList(addresses: ReadonlyArray<string>): string {
  return addresses.map((address) => `<${sanitizeHeader(address)}>`).join(", ")
}

function buildMessage(input: SmtpEmailInput): string {
  return [
    `From: <${sanitizeHeader(input.from)}>`,
    `To: ${addressList(input.to)}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(input.text),
  ].join("\r\n")
}

async function sayHello(session: SmtpSession): Promise<void> {
  try {
    await command(session, "EHLO arr-hub.local", [250])
  } catch {
    await command(session, "HELO arr-hub.local", [250])
  }
}

async function upgradeStartTls(session: SmtpSession, host: string): Promise<SmtpSession> {
  await command(session, "STARTTLS", [220])
  session.close()

  const upgraded = tls.connect({ socket: session.socket, servername: host })
  upgraded.setTimeout(SMTP_TIMEOUT_MS, () =>
    upgraded.destroy(new Error("SMTP connection timed out")),
  )
  await waitForSocket(upgraded, "secureConnect")
  return makeSession(upgraded)
}

export async function sendSmtpEmail(input: SmtpEmailInput): Promise<void> {
  let session = await connectSmtp(input)

  try {
    await expectResponse(session, [220])
    await sayHello(session)

    if (input.security === "starttls") {
      session = await upgradeStartTls(session, input.host)
      await sayHello(session)
    }

    if (input.username && input.password) {
      const auth = Buffer.from(`\0${input.username}\0${input.password}`).toString("base64")
      await command(session, `AUTH PLAIN ${auth}`, [235])
    }

    await command(session, `MAIL FROM:<${sanitizeHeader(input.from)}>`, [250])
    await input.to.reduce<Promise<void>>(
      (pending, recipient) =>
        pending.then(() =>
          command(session, `RCPT TO:<${sanitizeHeader(recipient)}>`, [250, 251]).then(
            () => undefined,
          ),
        ),
      Promise.resolve(),
    )
    await command(session, "DATA", [354])
    await session.sendLine(`${buildMessage(input)}\r\n.`)
    await expectResponse(session, [250])
    await command(session, "QUIT", [221])
  } finally {
    session.close()
    session.socket.end()
  }
}
