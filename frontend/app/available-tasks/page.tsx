import AvailableTasksComponent from "@/components/available-tasks"
import { NostrProvider } from "@/context/nostr-context"
import NostrScript from "@/components/nostr-script"
// Button and Image imports are not used in this page component directly anymore,
// but might be used by AvailableTasksComponent. Keep them if needed by build process or remove if not.
// import { Button } from "@/components/ui/button"
// import Image from "next/image"

export default function AvailableTasksPage() {
  return (
    <NostrProvider>
      <NostrScript />
      <div className="container py-12">
        <h1 className="text-3xl font-bold text-[#1e1e1e] mb-8">Available Tasks</h1>
        <AvailableTasksComponent />
      </div>
    </NostrProvider>
  )
}

// The local AvailableTasks component definition below was redundant and potentially problematic.
// It has been removed as AvailableTasksComponent is imported from "@/components/available-tasks".
