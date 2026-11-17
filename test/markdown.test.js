import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, excerpt } from '../src/markdown.js';

test('renderMarkdown renders headings', () => {
  assert.match(renderMarkdown('# Hi'), /<h1>Hi<\/h1>/);
});

test('renderMarkdown strips script tags and their contents', () => {
  const html = renderMarkdown('<script>alert(1)</script>hello');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /alert\(1\)/);
  assert.match(html, /hello/);
});

test('renderMarkdown strips event handler attributes', () => {
  const html = renderMarkdown('<img src="x" onerror="alert(1)">');
  assert.doesNotMatch(html, /onerror/i);
});

for (const scheme of ['javascript', 'JaVaScRiPt']) {
  test(`renderMarkdown strips ${scheme}: links but keeps the text`, () => {
    const html = renderMarkdown(`[x](${scheme}:alert(1))`);
    assert.doesNotMatch(html, /javascript:/i);
    assert.match(html, />x</);
  });
}

test('renderMarkdown keeps https links', () => {
  const html = renderMarkdown('[site](https://example.com/page)');
  assert.match(html, /<a href="https:\/\/example\.com\/page">site<\/a>/);
});

test('renderMarkdown keeps Markdown images', () => {
  const html = renderMarkdown('![alt text](https://example.com/pic.png)');
  assert.match(html, /<img[^>]*src="https:\/\/example\.com\/pic\.png"/);
  assert.match(html, /alt="alt text"/);
});

test('renderMarkdown handles empty input', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(undefined), '');
});

test('excerpt returns plain text with entities decoded', () => {
  assert.equal(excerpt("# Hi\n\nIt's **bold** & <b>x</b>"), "Hi It's bold & x");
});

test('excerpt drops script contents', () => {
  assert.equal(excerpt('<script>alert(1)</script>text'), 'text');
});

test('excerpt shortens long text at a word boundary and adds an ellipsis', () => {
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`);
  const input = words.join(' ');
  const result = excerpt(input);
  assert.ok(result.endsWith('…'));
  assert.ok(result.length <= 201, `length ${result.length}`);
  const body = result.slice(0, -1);
  assert.ok(input.startsWith(`${body} `), 'cut must fall on a whole word');
  assert.ok(words.includes(body.split(' ').at(-1)), 'last word must be complete');
});

test('excerpt keeps a word that ends exactly at the limit', () => {
  assert.equal(excerpt('aaa bbb ccc', 7), 'aaa bbb…');
  assert.equal(excerpt('aaa bbbb ccc', 7), 'aaa…');
});

test('excerpt hard-cuts a single word longer than the limit', () => {
  assert.equal(excerpt('a'.repeat(300)), `${'a'.repeat(200)}…`);
});

test('excerpt leaves short text unchanged', () => {
  assert.equal(excerpt('Short and sweet.'), 'Short and sweet.');
});

test('excerpt of empty input is empty', () => {
  assert.equal(excerpt(''), '');
  assert.equal(excerpt(undefined), '');
});
