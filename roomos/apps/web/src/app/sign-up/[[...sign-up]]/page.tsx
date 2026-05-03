import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-12 bg-[color:var(--color-cream)]">
      <SignUp appearance={{ variables: { colorPrimary: "#D4A843" } }} />
    </main>
  )
}
