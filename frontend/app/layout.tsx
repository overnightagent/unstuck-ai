import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Header from "@/components/header"
import Footer from "@/components/footer"
import NostrScript from "@/components/nostr-script"
import { NostrProvider } from "@/context/nostr-context" // Added import

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Unstuck - Earn Sats & Help Goose Soar!",
  description: "Complete tasks and earn Sats while helping Goose soar.",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NostrProvider> {/* Moved NostrProvider to wrap the main content div */}
          <div className="flex flex-col min-h-screen">
            <NostrScript /> {/* NostrScript is now a child of NostrProvider */}
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </NostrProvider>
      </body>
    </html>
  )
}
