import type { Metadata } from "next"
import { Source_Serif_4 } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "RoomOS — CoHost Management",
  description: "Coliving room command center for CoHost Management.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={serif.variable}>
        <head>
          <link
            rel="stylesheet"
            href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600,700&display=swap"
          />
        </head>
        <body className="bg-paper text-ink">{children}</body>
      </html>
    </ClerkProvider>
  )
}
