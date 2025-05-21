import React, { createContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

// Define the shape of the context data
interface NostrContextType {
  nostrTools: any | null; // Replace 'any' with the actual type of NostrTools if available
  isLoading: boolean;
  error: string | null;
  setNostrTools: Dispatch<SetStateAction<any | null>>; // Exposed for NostrScript
  setIsLoading: Dispatch<SetStateAction<boolean>>;     // Exposed for NostrScript
  setError: Dispatch<SetStateAction<string | null>>;   // Exposed for NostrScript
}

// Create the context with initial default values
export const NostrContext = createContext<NostrContextType | undefined>(undefined);

// Define the props for the provider component
interface NostrProviderProps {
  children: ReactNode;
}

// Create the provider component
export const NostrProvider: React.FC<NostrProviderProps> = ({ children }) => {
  const [nostrTools, setNostrTools] = useState<any | null>(null); // Replace 'any' with NostrTools type
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <NostrContext.Provider value={{ nostrTools, isLoading, error, setNostrTools, setIsLoading, setError }}>
      {children}
    </NostrContext.Provider>
  );
};
