"use client"

import { useEffect, useContext } from "react"
import { NostrContext } from "../context/nostr-context"

// Extend Window interface to include potential NostrTools properties
declare global {
  interface Window {
    NostrTools?: any; // Or a more specific type if known
    nostrTools?: any; // Or a more specific type if known
    Nostr?: any;
    nostr?: any;
    NostrBundle?: any;
  }
}

export default function NostrScript() {
  const context = useContext(NostrContext);

  if (!context) {
    // This should not happen if NostrScript is used within NostrProvider
    console.error("NostrContext not found. Make sure NostrScript is a child of NostrProvider.");
    return null;
  }

  const { setNostrTools, setIsLoading, setError } = context;

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Create and append the script element
    const script = document.createElement("script")
    script.src = "https://unstuck-goose.nyc3.cdn.digitaloceanspaces.com/nostr.bundle.js"
    script.async = true

    // Set up event handlers to track loading
    script.onload = () => {
      console.log("Nostr bundle script loaded successfully");
      // Check for NostrTools global (capital N and T or camelCase)
      const tools = window.NostrTools || window.nostrTools;
      if (tools) {
        console.log("NostrTools available:", Object.keys(tools));
        setNostrTools(tools);
        setError(null);
      } else {
        console.log("NostrTools not found in window object after loading");
        // Check for other possible global variables for debugging
        const possibleGlobals = ["Nostr", "nostr", "NostrBundle"];
        for (const name of possibleGlobals) {
          if (window[name]) {
            console.log(`Found global: window.${name}`, Object.keys(window[name]));
          }
        }
        setNostrTools(null);
        setError("NostrTools not found in window object after loading.");
      }
      setIsLoading(false);
    }

    script.onerror = () => {
      console.error("Failed to load Nostr bundle script");
      setNostrTools(null);
      setError("Failed to load Nostr bundle script.");
      setIsLoading(false);
    }

    document.body.appendChild(script)

    // Clean up on unmount
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    }
  }, [setNostrTools, setIsLoading, setError]) // Add dependencies to useEffect

  return null
}
