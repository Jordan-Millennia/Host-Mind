import { NextResponse } from "next/server"
import { writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { requireWorkerAuth } from "@/lib/worker-auth"

export const runtime = "nodejs"

const UPLOAD_DIR = process.env.SCREENSHOT_UPLOAD_DIR ?? "/tmp/roomos-screenshots"
const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

export async function POST(req: Request) {
  try {
    requireWorkerAuth(req)
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 })
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported content type" }, { status: 415 })
  }
  const name = (form.get("name") as string | null) ?? "screenshot.png"

  await mkdir(UPLOAD_DIR, { recursive: true })
  const sanitized = name.replace(/[^a-z0-9_.-]/gi, "_")
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const path = resolve(UPLOAD_DIR, `${ts}_${sanitized}`)
  await writeFile(path, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ ok: true, path })
}
