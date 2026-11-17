// Markdown rendering for post bodies. Everything marked produces is passed
// through sanitize-html, so raw HTML in a post can never inject scripts,
// event handlers or javascript: URLs.
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
  allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };

/**
 * Render Markdown to sanitized HTML that is safe to output unescaped.
 *
 * @param {string} markdown
 * @returns {string} Sanitized HTML.
 */
export function renderMarkdown(markdown) {
  return sanitizeHtml(marked.parse(String(markdown ?? ''), { async: false }), SANITIZE_OPTIONS);
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * A short plain-text summary of a Markdown document: all markup is removed,
 * whitespace collapsed, and text longer than `maxLength` is cut at a word
 * boundary and followed by an ellipsis.
 *
 * The result is plain text, NOT HTML: templates must escape it.
 *
 * @param {string} markdown
 * @param {number} [maxLength=200]
 * @returns {string}
 */
export function excerpt(markdown, maxLength = 200) {
  const html = marked.parse(String(markdown ?? ''), { async: false });
  const text = decodeEntities(sanitizeHtml(html, STRIP_ALL)).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;

  let cut = text.slice(0, maxLength);
  // Drop a trailing partial word, unless the cut already falls on a word
  // boundary. A single word longer than maxLength is cut hard.
  const endsOnBoundary = /\s/.test(text[maxLength]);
  if (!endsOnBoundary && /\s/.test(cut)) cut = cut.replace(/\s+\S*$/, '');
  return `${cut.trimEnd()}…`;
}
