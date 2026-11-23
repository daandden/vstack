export function decisionBrief(subject: string, { recommended = false, again }: { recommended?: boolean; again?: string } = {}) {
  return {
    unblocks: `Proceed with the chosen approach for ${subject}.`,
    undo: `Restore the prior approach for ${subject}.`,
    ...(!recommended ? { no_recommendation: `The tradeoff for ${subject} is up to the reader.` } : {}),
    ...(again ? { asked_again_because: again } : {}),
  };
}
