function normalizedText(value) {
  return String(value || "")
    .toLocaleLowerCase("sl")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizedText(value).split(/\s+/).filter((token) => token.length > 1));
}

function overlap(left, right) {
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  const union = left.size + right.size - shared;
  return { shared, jaccard: union ? shared / union : 0 };
}

export function repeatedQuestionGroups(questions) {
  const parent = questions.map((_, index) => index);
  const find = (index) => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  const promptGroups = new Map();
  const answerGroups = new Map();
  const promptTokens = questions.map((question) => tokenSet(question.prompt));
  const answerSets = questions.map((question) => new Set(Object.values(question.answers).map(normalizedText)));

  questions.forEach((question, index) => {
    const promptKey = normalizedText(question.prompt);
    if (!promptGroups.has(promptKey)) promptGroups.set(promptKey, []);
    promptGroups.get(promptKey).push(index);

    const answerKey = normalizedText(question.answers[question.correctAnswer]);
    if (!answerGroups.has(answerKey)) answerGroups.set(answerKey, []);
    answerGroups.get(answerKey).push(index);
  });

  for (const indexes of promptGroups.values()) {
    for (let index = 1; index < indexes.length; index += 1) unite(indexes[0], indexes[index]);
  }

  // Near matches must retain the same correct-answer text, share at least two
  // answer options, and have very high prompt-token overlap. This deliberately
  // favors precision over collecting every possible paraphrase.
  for (const indexes of answerGroups.values()) {
    for (let left = 0; left < indexes.length; left += 1) {
      for (let right = left + 1; right < indexes.length; right += 1) {
        const leftIndex = indexes[left];
        const rightIndex = indexes[right];
        if (normalizedText(questions[leftIndex].prompt) === normalizedText(questions[rightIndex].prompt)) continue;
        const promptOverlap = overlap(promptTokens[leftIndex], promptTokens[rightIndex]);
        const answerOverlap = overlap(answerSets[leftIndex], answerSets[rightIndex]);
        if (promptOverlap.shared >= 4 && promptOverlap.jaccard >= 0.78 && answerOverlap.shared >= 2) {
          unite(leftIndex, rightIndex);
        }
      }
    }
  }

  const grouped = new Map();
  questions.forEach((question, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(question);
  });

  return [...grouped.values()]
    .filter((items) => items.length > 1)
    .map((items) => {
      const sorted = [...items].sort((a, b) => a.sourceIndex - b.sourceIndex);
      const wordingCount = new Set(sorted.map((question) => normalizedText(question.prompt))).size;
      return {
        kind: wordingCount === 1 ? "exact" : "near",
        questions: sorted,
        occurrences: sorted.length,
        wordingCount,
        firstDate: sorted[0].airingDate,
        lastDate: sorted.at(-1).airingDate,
      };
    })
    .sort((a, b) =>
      b.occurrences - a.occurrences
      || b.lastDate.localeCompare(a.lastDate)
      || a.questions[0].prompt.localeCompare(b.questions[0].prompt, "sl")
    );
}
