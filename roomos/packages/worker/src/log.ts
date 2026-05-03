import pino from "pino"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { env } from "./env"

const LOG_DIR = resolve(homedir(), "Library", "Logs", "RoomOS")
mkdirSync(LOG_DIR, { recursive: true })

const LOG_FILE = resolve(LOG_DIR, "worker.log")

export const log = pino({
  level: env.LOG_LEVEL,
  base: { worker_id: env.WORKER_ID },
  transport: {
    targets: [
      { target: "pino/file", options: { destination: LOG_FILE, mkdir: true } },
      { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
    ],
  },
})

export type Logger = typeof log
