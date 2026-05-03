import { NextResponse } from "next/server"
import { verifyClerkWebhook, handleClerkWebhook } from "@/lib/webhook-verify"

export async function POST(req: Request) {
  const rawBody = await req.text()
  let evt
  try {
    evt = verifyClerkWebhook(req.headers, rawBody)
  } catch (err) {
    console.error("clerk-webhook: signature verification failed", err)
    return NextResponse.json({ error: "invalid signature" }, { status: 400 })
  }

  try {
    await handleClerkWebhook(evt)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("clerk-webhook: handler failed", err)
    return NextResponse.json({ error: "handler failed" }, { status: 500 })
  }
}
