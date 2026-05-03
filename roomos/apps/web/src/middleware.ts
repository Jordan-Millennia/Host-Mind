import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/clerk-webhook", // signature-verified separately in Task 6
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
  const res = NextResponse.next()
  res.headers.set("x-pathname", req.nextUrl.pathname)
  return res
})

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"],
}
