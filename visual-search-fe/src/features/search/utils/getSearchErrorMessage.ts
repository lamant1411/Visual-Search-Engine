import axios from "axios";

import { SearchContractError } from "../services/search.mapper";

type SearchErrorMessage = {
  title: string;
  description: string;
  canRetry: boolean;
};

export function getSearchErrorMessage(error: unknown): SearchErrorMessage {
  if (error instanceof SearchContractError) {
    return {
      title: "Unexpected search data",
      description:
        "The server response does not match the agreed Search API contract.",
      canRetry: false,
    };
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 401) {
      return {
        title: "Session expired",
        description: "Sign in again to continue searching.",
        canRetry: false,
      };
    }

    if (status === 400 || status === 422) {
      return {
        title: "Invalid search request",
        description: "Check your query or reference image and try again.",
        canRetry: false,
      };
    }

    if (status === 501) {
      return {
        title: "Find similar is not available yet",
        description:
          "The Backend currently supports uploaded image files, but not search by an existing image ID.",
        canRetry: false,
      };
    }

    if (status === 429) {
      return {
        title: "Too many searches",
        description: "Wait a moment before trying again.",
        canRetry: true,
      };
    }

    if (status && status >= 500) {
      return {
        title: "Search service unavailable",
        description:
          "The server is temporarily unavailable. Try again shortly.",
        canRetry: true,
      };
    }

    if (!error.response) {
      return {
        title: "Unable to reach the server",
        description:
          "Check your connection or confirm that the Backend is running.",
        canRetry: true,
      };
    }
  }

  return {
    title: "Search failed",
    description: "Try again or start a new search.",
    canRetry: true,
  };
}
