// Taken from https://github.com/ducktrshessami/discord-buttsbot/blob/main/src/discord/buttify.ts

import { syllablize } from "./fast-syllablize.js";

const ExpectedProbability = 0.95;
const NonWordPattern =
  /(https?:\/\/(?:www\.)?[-A-Z0-9@:%._\+~#=]{1,256}(?:\.[A-Z0-9()]{1,6})?\b(?:[-A-Z0-9()@:%_\+.~#?&\/=]*)|<?(?:a?:?\w{2,32}:|#|@[!&]?)\d{17,19}>?|[^A-Z]+)/gi;
const WordPattern = /^[A-Z]+$/i;
const CapsPattern = /^[A-Z]$/;
const AllCapsPattern = /^[A-Z]{2,}$/;
const PluralPattern = /[SZ]$/i;

class ContentItem {
  constructor(content, chars) {
    this.content = content;
    this.chars = chars;
    this.word = WordPattern.test(chars);
    this.allCaps = this.word ? AllCapsPattern.test(chars) : false;
    this.pluralChar =
      this.word &&
      !this.content.pluralWord &&
      PluralPattern.test(chars[chars.length - 1])
        ? chars[chars.length - 1]
        : null;
    this._syllables = this.word ? syllablize(chars) : null;
    this._current = this.word ? chars : null;
    this._buttified = false;
    this.buttify();
  }

  get syllables() {
    return this._syllables?.length ?? 0;
  }

  get buttified() {
    return this._buttified;
  }

  get length() {
    return this._current?.length ?? this.chars.length;
  }

  isWord() {
    return this.word;
  }

  buttify() {
    if (!this.isWord()) {
      return this.chars;
    }
    this._buttified = false;
    this._current = this._syllables.reduce(
      (buttified, syllable, i, syllables) => {
        if (chance(this.content.rate)) {
          let word = this.content.word;
          this._buttified = true;
          if (this.pluralChar && i === syllables.length - 1) {
            word += this.pluralChar;
          }
          if (this.allCaps) {
            buttified += word.toUpperCase();
          } else
            for (let j = 0; j < word.length; j++) {
              buttified += CapsPattern.test(syllable[j])
                ? word[j].toUpperCase()
                : word[j];
            }
        } else {
          buttified += syllable;
        }
        return buttified;
      },
      "",
    );
    return this._current;
  }

  toString() {
    return this._current ?? this.chars;
  }
}

class ButtifiedContent {
  constructor(original, word, rate) {
    this.original = original;
    this.word = word;
    this.rate = rate;
    this.pluralWord = PluralPattern.test(word[word.length - 1]);
    this.items = original.split(NonWordPattern).reduce((items, item) => {
      if (item) {
        items.push(new ContentItem(this, item));
      }
      return items;
    }, new Array());
  }

  get syllables() {
    return this.items.reduce(
      (syllables, item) => syllables + item.syllables,
      0,
    );
  }

  get buttified() {
    return this.items.some((item) => item.buttified);
  }

  get length() {
    return this.items.reduce((length, item) => length + item.length, 0);
  }

  get valid() {
    return this.buttified && this.length <= 2000;
  }

  buttify() {
    return this.items.reduce(
      (buttified, item) => buttified + item.buttify(),
      "",
    );
  }

  toString() {
    return this.items.join("");
  }
}

function chance(n) {
  return Math.random() < 1 / n;
}

function attempts(rate, syllables) {
  return Math.min(
    1000 /*attempts*/,
    Math.ceil(
      Math.log(1 - ExpectedProbability) /
        (syllables * Math.log((rate - 1) / rate)),
    ),
  );
}

export function buttify(content, word, rate) {
  const buttifiedContent = new ButtifiedContent(content, word, rate);
  if (buttifiedContent.syllables < 2) {
    return null;
  }
  const maxAttempts = rate > 1 ? attempts(rate, buttifiedContent.syllables) : 1;
  for (let i = 1; i < maxAttempts && !buttifiedContent.valid; i++) {
    buttifiedContent.buttify();
  }
  return buttifiedContent.valid ? buttifiedContent.toString() : null;
}

export function buttifiable(message, frequency) {
  return !!message && chance(frequency);
}
