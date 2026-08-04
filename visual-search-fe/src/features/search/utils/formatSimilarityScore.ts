export function formatSimilarityScore(score: number) {
  // Search APIs already return similarityScore as a percentage in the 0-100 range.
  // Do not infer 0-1 values here: a valid 1% score would otherwise become 100%.
  return Math.round(Math.min(100, Math.max(0, score)))
}
