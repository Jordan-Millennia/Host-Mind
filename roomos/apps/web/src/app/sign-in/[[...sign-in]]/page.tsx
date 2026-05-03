import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-12 bg-[color:var(--color-cream)]">
      <SignIn appearance={{ variables: { colorPrimary: "#D4A843" } }} />
    </main>
  )
}
