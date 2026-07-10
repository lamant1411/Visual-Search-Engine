export function formatSimilarityScore(score: number) {
  const percentage = score <= 1 ? score * 100 : score
  return Math.round(Math.min(100, Math.max(0, percentage)))
}
