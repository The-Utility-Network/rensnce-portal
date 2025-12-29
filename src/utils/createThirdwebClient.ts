// src/utils/createThirdwebClient.ts (this is a server-side utility)

import { createThirdwebClient } from "thirdweb";

// This utility will only be executed server-side
export const getThirdwebClient = () => {
  const client = createThirdwebClient({
    clientId: process.env.THIRDWEB_CLIENT as string, // Secure server-side access
  });
  return client;
};