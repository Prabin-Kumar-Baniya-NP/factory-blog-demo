import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug } from '../src/slug.js';

test('slugify lowercases and joins words with single hyphens', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  --Spaces--  '), 'spaces');
  assert.equal(slugify('A  b___c 123'), 'a-b-c-123');
});

test('slugify strips accents', () => {
  assert.equal(slugify('Café déjà vu'), 'cafe-deja-vu');
});

test('slugify falls back to "post" when nothing usable remains', () => {
  assert.equal(slugify('!!!'), 'post');
  assert.equal(slugify(''), 'post');
  assert.equal(slugify(undefined), 'post');
  assert.equal(slugify(null), 'post');
});

test('uniqueSlug returns the base when it is free', () => {
  assert.equal(uniqueSlug('a', () => false), 'a');
});

test('uniqueSlug appends the first free numeric suffix', () => {
  assert.equal(uniqueSlug('a', (s) => s === 'a'), 'a-2');
  assert.equal(uniqueSlug('a', (s) => ['a', 'a-2'].includes(s)), 'a-3');
});
