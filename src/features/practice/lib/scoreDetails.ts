/** Display only fields explicitly returned by an assessment provider. */
type Data = Record<string, unknown>;
export type ScoreDimension = {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
};
export type PhonemeDetail = {
  symbol: string;
  score: number | null;
  recognized: string | null;
  feedback: string[];
};
export type WordDetail = {
  word: string;
  score: number | null;
  phonemes: PhonemeDetail[];
  feedback: string[];
};
export type ScoreDetails = {
  dimensions: ScoreDimension[];
  words: WordDetail[];
  feedback: string[];
  tone: string | null;
};

function record(value: unknown): Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Data)
    : {};
}
function rows(value: unknown): Data[] {
  return Array.isArray(value)
    ? value
        .filter((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
        .map(record)
    : [];
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 1000)
    : null;
}
function score(value: unknown, maximum = 100): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}
function firstScore(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = score(value);
    if (parsed !== null) return parsed;
  }
  return null;
}
function symbols(value: unknown): string | null {
  if (Array.isArray(value))
    return (
      value
        .map((v) => text(v) ?? text(record(v).phoneme))
        .filter(Boolean)
        .join(' ') || null
    );
  return text(value);
}

// Numeric provider flags have provider-specific meanings; do not invent a diagnosis.
const issueLabels: Record<string, string> = {
  omission: '漏读',
  insertion: '多读',
  mispronunciation: '发音需要调整',
  substitution: '替换发音',
  repetition: '重复朗读',
};
function returnedFeedback(value: Data): string[] {
  const result: string[] = [];
  for (const key of ['feedback', 'message', 'issue', 'issues']) {
    const incoming = value[key];
    const items = Array.isArray(incoming) ? incoming : [incoming];
    for (const item of items) {
      const itemText =
        text(item) ??
        text(record(item).message) ??
        text(record(item).description);
      if (itemText) result.push(itemText);
    }
  }
  for (const key of ['error_type', 'errorType']) {
    const code = text(value[key]);
    if (code && !['none', 'noerror', 'correct'].includes(code.toLowerCase())) {
      result.push(
        Object.hasOwn(issueLabels, code.toLowerCase())
          ? issueLabels[code.toLowerCase()]
          : `评测标记：${code}`,
      );
    }
  }
  const readType = value.readType;
  if (
    (typeof readType === 'number' &&
      Number.isFinite(readType) &&
      readType !== 0) ||
    (typeof readType === 'string' && readType !== '0' && readType.trim())
  ) {
    result.push(`朗读标记：${String(readType)}（接口原值）`);
  }
  for (const [key, label] of [
    ['inserted_before', '前方插入音'],
    ['inserted_after', '后方插入音'],
  ] as const) {
    const sounds = symbols(value[key]);
    if (sounds) result.push(`${label}：${sounds}`);
  }
  return [...new Set(result)];
}

function phoneme(value: Data): PhonemeDetail | null {
  const symbol =
    symbols(value.phoneme) ?? text(value.phone) ?? text(value.sound);
  if (!symbol) return null;
  return {
    symbol,
    score: firstScore(
      value.pronunciation,
      value.quality_score,
      record(value.scores).pronunciation,
      value.overall,
      value.score,
    ),
    recognized:
      text(value.sound_like) ??
      text(value.sound_most_like) ??
      text(value.most_likely_sound),
    feedback: returnedFeedback(value),
  };
}

function word(value: Data): WordDetail | null {
  const label = text(value.word) ?? text(value.char) ?? text(value.text);
  if (!label) return null;
  const wordScores = record(value.scores);
  const phones = rows(
    value.phonemes ?? value.phone_score_list ?? value.phonics,
  );
  const feedback = returnedFeedback(value);
  for (const syllable of rows(wordScores.stress ?? value.syllable_score_list)) {
    const expected = syllable.ref_stress ?? syllable.expected_stress_level;
    const actual = syllable.stress ?? syllable.predicted_stress_level;
    const label =
      text(syllable.spell) ?? text(syllable.letters) ?? text(syllable.phonetic);
    if (
      label &&
      typeof expected === 'number' &&
      typeof actual === 'number' &&
      expected !== actual
    ) {
      feedback.push(`${label} 重音：参考 ${expected}，识别 ${actual}`);
    }
  }
  return {
    word: label,
    score: firstScore(
      wordScores.pronunciation,
      value.pronunciation,
      value.quality_score,
      value.score,
      wordScores.overall,
    ),
    phonemes: phones.map(phoneme).filter((p): p is PhonemeDetail => p !== null),
    feedback,
  };
}

export function getScoreDetails(
  kind: string,
  metrics: Data,
  rawResult: Data = metrics,
): ScoreDetails {
  const source = record(rawResult.text_score ?? rawResult.result ?? rawResult);
  const metricValue = (key: string): unknown =>
    metrics[key] === undefined ? source[key] : metrics[key];
  const dimensionKeys =
    kind === 'word'
      ? [
          ['pronunciation', '发音'],
          ['stress', '重音'],
          ['intelligibility', '可理解性'],
        ]
      : [
          ['pronunciation', '发音'],
          ['fluency', '流利度'],
          ['integrity', '完整度'],
          ['rhythm', '韵律'],
          ['speed', '速度'],
        ];
  const dimensions: ScoreDimension[] = dimensionKeys.map(([key, label]) => ({
    key,
    label,
    value: score(metricValue(key), key === 'speed' ? Number.MAX_VALUE : 100),
    ...(key === 'speed' ? { unit: '词/分钟' } : {}),
  }));
  // Some sentence providers also return intelligibility. Display it without
  // implying that it participates in the product's total-score rule.
  if (kind === 'sentence' && metricValue('intelligibility') !== undefined) {
    dimensions.push({
      key: 'intelligibility',
      label: '可理解性',
      value: score(metricValue('intelligibility')),
    });
  }
  const wordRows = rows(
    source.words ?? source.word_score_list ?? source.details,
  );
  const toneCode = text(source.rear_tone);
  const tones: Record<string, string> = {
    fall: '降调',
    rise: '升调',
    flat: '平调',
  };
  return {
    dimensions,
    words: wordRows.map(word).filter((w): w is WordDetail => w !== null),
    feedback: returnedFeedback(source),
    tone: toneCode
      ? Object.hasOwn(tones, toneCode)
        ? tones[toneCode]
        : `语调标记：${toneCode}`
      : null,
  };
}
