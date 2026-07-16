import axios from 'axios'

import { SearchContractError } from '../services/search.mapper'

type SearchErrorMessage = {
  title: string
  description: string
}

export function getSearchErrorMessage(error: unknown): SearchErrorMessage {
  if (error instanceof SearchContractError) {
    return {
      title: 'Unexpected search data',
      description: 'The server response does not match the agreed Search API contract.',
    }
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status

    if (status === 401) {
      return {
        title: 'Session expired',
        description: 'Sign in again to continue searching.',
      }
    }

    if (status === 400 || status === 422) {
      return {
        title: 'Invalid search request',
        description: 'Check your query or reference image and try again.',
      }
    }

    if (status === 429) {
      return {
        title: 'Too many searches',
        description: 'Wait a moment before trying again.',
      }
    }

    if (status && status >= 500) {
      return {
        title: 'Search service unavailable',
        description: 'The server is temporarily unavailable. Try again shortly.',
      }
    }

    if (!error.response) {
      return {
        title: 'Unable to reach the server',
        description: 'Check your connection or confirm that the Backend is running.',
      }
    }
  }

  return {
    title: 'Search failed',
    description: 'Try again or start a new search.',
  }
}
