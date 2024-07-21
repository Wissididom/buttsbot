// Taken from https://github.com/ducktrshessami/fast-syllablize/blob/main/src/index.ts

function formatWord(word) {
  return word.replace(/[^a-z]/gi, "");
}

export function syllablize(word) {
  const formatted = formatWord(word);
  return formatted[formatted.length - 1] === "e" || !/[aeiouy]/i.test(formatted)
    ? A(formatted)
    : B(formatted);
}

function matchSyllables(word, pattern) {
  return word.match(pattern) || (word ? [word] : []);
}

// Based on https://stackoverflow.com/a/51175267
function A(word) {
  return matchSyllables(
    word,
    /(?:[^aeiouy]+|y^)?[aeiouy]{1,2}(?:(?:(?:[^aeiouy]*(?:[^laeiouy]e?|ed))|[^aeiouy]+)$)?/gi,
  );
}

export function methodA(word) {
  return A(formatWord(word));
}

function B(word) {
  return matchSyllables(
    word,
    /(?:(?<![aeiouy])[bcdfghjklmnpqrstvwxyz]{2,}|[bcdfghjklmnpqrstvwxyz])?(?:[aeiouy]{2,}(?![bcdfghjklmnpqrstvwxyz][aeiouy])|a[iu]|e[aeiu]|ie|o[aou]|[aeiouy])?(?:[bcdfghjklmnpqrstvwxyz](?![aeiouy]))*/gi,
  ).filter((syllable) => syllable);
}

export function methodB(word) {
  return B(formatWord(word));
}

// Based on https://stackoverflow.com/a/49407494
function C(word) {
  return matchSyllables(
    word,
    /[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi,
  );
}

export function methodC(word) {
  return C(formatWord(word));
}
