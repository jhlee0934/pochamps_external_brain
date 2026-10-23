// Korean particles that depend on whether the word ends in a final consonant (받침).

function finalConsonant(word: string): number {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 ? code % 28 : 0;
}

/** 으로/로: 으로 after a final consonant other than ㄹ. */
export function withRo(word: string): string {
  const jong = finalConsonant(word);
  return word + (jong && jong !== 8 ? '으로' : '로');
}

/** 을/를 */
export function withEul(word: string): string {
  return word + (finalConsonant(word) ? '을' : '를');
}

