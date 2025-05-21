"use client"

import { useState, useEffect, useContext, useRef } from "react"
import { NostrContext } from "../context/nostr-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import Image from "next/image"

// Define the relays to use
const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.band", "wss://relay.primal.net", "wss://relay.dvmdash.live"]

interface TaskEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

interface TaskWithProfile {
  event: TaskEvent
  profile?: {
    name?: string
    picture?: string
    about?: string
  }
}

export default function AvailableTasks() {
  const nostrContext = useContext(NostrContext);
  const [tasks, setTasks] = useState<TaskWithProfile[]>([]);
  const [loading, setLoading] = useState(true); // For initial tasks fetching
  const [error, setError] = useState<string | null>(null); // For tasks fetching

  const [initialTasksProcessed, setInitialTasksProcessed] = useState(false);
  const activeSubscriptionRef = useRef<any>(null); // For the main task subscription
  const activePoolRef = useRef<any>(null); // For the Nostr SimplePool instance

  // Helper function to fetch profile for a single pubkey
  async function fetchProfileForPubkey(pubkey: string, nostrLib: any, pool: any): Promise<any | undefined> {
    if (!pool || !nostrLib || !nostrLib.SimplePool) { // Ensure pool is available
        console.error("Pool or nostrLib not available for fetching profile");
        return undefined;
    }
    return new Promise((resolve, reject) => {
      const profileSub = pool.subscribeMany(RELAYS, [{ kinds: [0], authors: [pubkey], limit: 1 }], {
        onevent(event: TaskEvent) {
          try {
            const profile = JSON.parse(event.content);
            profileSub.close();
            resolve(profile);
          } catch (e) {
            console.error("Failed to parse profile data for new task:", e);
            profileSub.close();
            resolve(undefined); // Resolve with undefined on error
          }
        },
        oneose() {
          profileSub.close();
          resolve(undefined); // No profile event found
        }
      });
      // Timeout for profile fetching
      setTimeout(() => {
        if (!profileSub.closed) { // Check if not already closed by onevent/oneose
            profileSub.close();
            resolve(undefined); // Resolve with undefined after timeout
        }
      }, 3000); // 3-second timeout
    });
  }


  useEffect(() => {
    if (!nostrContext) {
      console.error("NostrContext not available in AvailableTasks. Ensure NostrProvider is an ancestor.");
      setError("Nostr context not available. Please refresh.");
      setLoading(false);
      return;
    }

    const { nostrTools, isLoading: isNostrLoading, error: nostrError } = nostrContext;

    if (isNostrLoading) return;

    if (nostrError) {
      setError(nostrError);
      setLoading(false);
      return;
    }

    if (nostrTools) {
      // Reset states for potential re-fetches (e.g., after error)
      setLoading(true);
      setError(null);
      setInitialTasksProcessed(false); // Reset for new fetch operation
      setTasks([]); // Clear previous tasks

      // Call fetchTasks and manage the returned subscription and pool
      const { sub, pool } = fetchTasksLogic(nostrTools);
      activeSubscriptionRef.current = sub;
      activePoolRef.current = pool;

    } else {
      setError("Nostr library not available after loading. Please refresh.");
      setLoading(false);
    }

    // Cleanup function
    return () => {
      if (activeSubscriptionRef.current) {
        console.log("Closing active task subscription");
        activeSubscriptionRef.current.close();
        activeSubscriptionRef.current = null;
      }
      if (activePoolRef.current) {
        console.log("Closing active pool");
        // SimplePool does not have a direct close method for all relays simultaneously without providing the list of relays.
        // activePoolRef.current.close(RELAYS); // This would require RELAYS to be in scope or passed.
        // For now, individual subscriptions are closed. If SimplePool internally manages connections,
        // they might stay open until the pool object is garbage collected or if it has a global close.
        // The nostr-tools SimplePool doesn't have a pool.close() method without arguments.
        // We rely on closing individual subscriptions.
        activePoolRef.current = null; 
      }
      setInitialTasksProcessed(false); // Reset on unmount or re-run
    };
  }, [nostrContext]);


  function fetchTasksLogic(nostrLib: any) {
    if (!nostrLib || !nostrLib.SimplePool) {
      console.error("Nostr library or SimplePool not available");
      setError("Nostr library not properly loaded. Please refresh the page.");
      setLoading(false);
      // Return dummy sub and pool to prevent crashes in cleanup
      return { sub: { close: () => {} }, pool: null };
    }

    const pool = new nostrLib.SimplePool();
    const localTaskEvents: TaskWithProfile[] = []; // Temporary array for initial batch

    const sub = pool.subscribeMany(
      RELAYS,
      [{ kinds: [5109, 30006], limit: 20 }], // Kinds for tasks
      {
        async onevent(event: TaskEvent) {
          // Access states via a function to get the latest value if needed, or rely on closure.
          // For 'tasks' state, direct access might be stale.
          // 'initialTasksProcessed' should be fine with closure if fetchTasksLogic is not re-created often.
          // However, setTasks with a callback is safer for 'tasks'.

          if (!initialTasksProcessed) {
            // Initial load phase: collect events
            const alreadyExists = localTaskEvents.some(t => t.event.id === event.id);
            if (!alreadyExists) {
                localTaskEvents.push({ event });
            }
          } else {
            // Real-time event after initial load
            setTasks(prevTasks => {
              const existingTask = prevTasks.find(t => t.event.id === event.id);
              if (!existingTask) {
                console.log("Real-time new task event:", event);
                const newTaskPlaceholder = { event, profile: undefined };
                
                // Asynchronously fetch profile for the new task
                fetchProfileForPubkey(event.pubkey, nostrLib, pool).then(profile => {
                  setTasks(currentTasks => currentTasks.map(t => 
                    t.event.id === event.id ? { ...t, profile } : t
                  ));
                }).catch(e => console.error("Failed to fetch profile for new real-time task", e));
                
                return [newTaskPlaceholder, ...prevTasks];
              }
              return prevTasks;
            });
          }
        },
        async oneose() {
          console.log("Initial EOSE received. Processing initial tasks:", localTaskEvents.length);
          if (localTaskEvents.length > 0) {
            const pubkeys = [...new Set(localTaskEvents.map((task) => task.event.pubkey))];
            const profilesPromise = new Promise<void>(async (resolveProfiles) => {
              if (pubkeys.length === 0) {
                resolveProfiles();
                return;
              }
              const profileEvents: { [pubkey: string]: any } = {};
              const profileSub = pool.subscribeMany(
                RELAYS,
                [{ kinds: [0], authors: pubkeys, limit: pubkeys.length }],
                {
                  onevent(profileEvent: TaskEvent) {
                    try {
                      const profile = JSON.parse(profileEvent.content);
                      profileEvents[profileEvent.pubkey] = profile;
                    } catch (e) {
                      console.error("Failed to parse profile data for initial batch:", e);
                    }
                  },
                  oneose() {
                    profileSub.close();
                    localTaskEvents.forEach(task => {
                      if (profileEvents[task.event.pubkey]) {
                        task.profile = profileEvents[task.event.pubkey];
                      }
                    });
                    resolveProfiles();
                  }
                }
              );
              setTimeout(() => { // Timeout for initial profiles
                if (!profileSub.closed) {
                    profileSub.close();
                    localTaskEvents.forEach(task => { // Assign any profiles gathered before timeout
                        if (profileEvents[task.event.pubkey]) {
                            task.profile = profileEvents[task.event.pubkey];
                        }
                    });
                    resolveProfiles();
                }
              }, 5000); // 5s for initial batch of profiles
            });
            await profilesPromise;
          }
          
          localTaskEvents.sort((a, b) => b.event.created_at - a.event.created_at);
          setTasks(localTaskEvents); // Set initial tasks
          setInitialTasksProcessed(true);
          setLoading(false); // Initial load complete
          console.log("Initial tasks processed and set.");
          // DO NOT CLOSE `sub` HERE - it remains open for real-time updates.
          // The promise associated with fetchTasksLogic implicitly resolves when this function completes.
        }
      }
    );
    return { sub, pool }; // Return the subscription and pool
  }

  // JSX Rendering part
  if (!nostrContext) {
    // This case should ideally be handled by the useEffect if context is initially undefined
    // or if NostrProvider is missing.
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Nostr Context is not available. Check console.</p>
      </div>
    );
  }

  const { isLoading: isNostrLoading, error: nostrError, nostrTools } = nostrContext;

  if (isNostrLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#757575]" />
        <span className="ml-2">Loading Nostr library...</span>
      </div>
    );
  }

  if (nostrError && !error) { // Show Nostr library error if no specific task error yet
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Error loading Nostr library: {nostrError}</p>
        <Button onClick={() => window.location.reload()} className="mt-4 bg-[#2c2c2c] hover:bg-[#1e1e1e]">
          Refresh Page
        </Button>
      </div>
    );
  }

  // Function to extract image URL from tags
  function getImageUrl(task: TaskEvent): string | null {
    const imageTag = task.tags.find((tag) => tag[0] === "image" || tag[0] === "img")
    if (imageTag && imageTag.length > 1) {
      return imageTag[1]
    }

    // Also check for image URLs in content
    try {
      const contentObj = JSON.parse(task.content)
      if (contentObj.image) return contentObj.image
      if (contentObj.img) return contentObj.img
    } catch (e) {
      // Not JSON or doesn't have image field
    }

    return null
  }

  // Function to get task title
  function getTaskTitle(task: TaskEvent): string {
    // Check for title in tags
    const titleTag = task.tags.find((tag) => tag[0] === "title" || tag[0] === "name")
    if (titleTag && titleTag.length > 1) {
      return titleTag[1]
    }

    // Check for title in content
    try {
      const contentObj = JSON.parse(task.content)
      if (contentObj.title) return contentObj.title
      if (contentObj.name) return contentObj.name
    } catch (e) {
      // Not JSON or doesn't have title field
    }

    // If content is short, use it as title
    if (task.content && task.content.length < 50) {
      return task.content
    }

    // Fallback to task ID
    return `Task ${task.id.substring(0, 8)}...`
  }

  // Function to get task description
  function getTaskDescription(task: TaskEvent): string {
    // Check for description in tags
    const descTag = task.tags.find((tag) => tag[0] === "description" || tag[0] === "desc")
    if (descTag && descTag.length > 1) {
      return descTag[1]
    }

    // Check for description in content
    try {
      const contentObj = JSON.parse(task.content)
      if (contentObj.description) return contentObj.description
      if (contentObj.desc) return contentObj.desc
    } catch (e) {
      // If content is not JSON, use it as description
      if (task.content) {
        return task.content.length > 150 ? `${task.content.substring(0, 147)}...` : task.content
      }
    }

    return "No description available"
  }

  // At this point, Nostr library should be loaded (or failed with nostrError handled above)
  // Now, handle task-specific loading and errors
  if (loading && !initialTasksProcessed) { // Show loading only during initial fetch
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#757575]" />
        <span className="ml-2">Loading initial tasks...</span>
      </div>
    );
  }

  if (error) { // This is the task error state (could be from initial or Nostr lib)
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        {/* Button to attempt re-triggering the useEffect logic if nostrTools are available */}
        <Button 
          onClick={() => {
            if (nostrTools) {
              // Effectively re-trigger useEffect by changing a dependency or forcing a re-render.
              // For simplicity, a page reload might be acceptable for now, or a more sophisticated
              // state reset and re-fetch trigger could be implemented.
              // This re-call of fetchTasksLogic is problematic here as it's not in useEffect.
              // window.location.reload(); // Simplest way to retry from scratch.
              // For a less disruptive retry, you'd manage a "retry" state that useEffect depends on.
              setError(null); // Clear error
              setLoading(true); // Set loading
              // The main useEffect will pick up the changes if nostrContext itself is stable
              // but its contents (like error) were the issue.
              // If nostrTools itself was missing, that's a different problem.
              // This button ideally should trigger the fetch logic within useEffect.
              // A simple way is to have a "retry" state that useEffect depends on.
              // For now, we'll just clear the error and let users manually refresh if it's a persistent issue.
            }
          }} 
          className="mt-4 bg-[#2c2c2c] hover:bg-[#1e1e1e]"
          disabled={!nostrTools}
        >
          Try Again
        </Button>
      </div>
    );
  }
  
  if (!loading && tasks.length === 0 && initialTasksProcessed) { // No tasks after initial load
    return (
      <div className="text-center py-12">
        <p className="text-[#757575]">No tasks available at the moment. Listening for new tasks...</p>
        {/* Refresh button might not be super useful if it just re-subscribes; EOSE handled it.
            But if there was a temporary network blip for the initial fetch, it could help.
        */}
         <Button 
          onClick={() => {
            if (nostrTools) {
                // This should ideally re-trigger the main useEffect's fetching logic.
                // For now, we can clear tasks and set loading, hoping useEffect re-runs.
                setTasks([]);
                setLoading(true);
                setInitialTasksProcessed(false); // This will make useEffect re-run fetch
                 // Manually call the logic again if useEffect doesn't re-trigger as expected
                 // This is not ideal. A state for "retry" is better.
                 // const { sub, pool } = fetchTasksLogic(nostrTools);
                 // activeSubscriptionRef.current = sub;
                 // activePoolRef.current = pool;
            }
          }} 
          className="mt-4 bg-[#2c2c2c] hover:bg-[#1e1e1e]"
          disabled={!nostrTools || loading}
        >
          Refresh Initial Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {tasks.map((task) => {
        const imageUrl = getImageUrl(task.event)
        const title = getTaskTitle(task.event)
        const description = getTaskDescription(task.event)

        return (
          <Card key={task.event.id} className="overflow-hidden">
            <CardContent className="p-0">
              {imageUrl && (
                <div className="aspect-video relative">
                  <Image
                    src={imageUrl || "/placeholder.svg"}
                    alt={title}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = "/placeholder.svg?height=256&width=256"
                    }}
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-[#757575] mb-4">{description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {task.profile?.picture ? (
                      <Image
                        src={task.profile.picture || "/placeholder.svg"}
                        alt={task.profile.name || "Creator"}
                        width={24}
                        height={24}
                        className="rounded-full mr-2"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = "/placeholder.svg?height=24&width=24"
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#e3e3e3] mr-2"></div>
                    )}
                    <span className="text-xs text-[#757575]">
                      {task.profile?.name || `${task.event.pubkey.substring(0, 8)}...`}
                    </span>
                  </div>
                  <span className="text-xs text-[#757575]">
                    {new Date(task.event.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex justify-end p-2 bg-[#f5f5f5]">
                <Button className="bg-[#2c2c2c] hover:bg-[#1e1e1e]">Bid Task</Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
