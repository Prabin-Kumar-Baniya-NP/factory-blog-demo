/**
 * Turn a title into a URL-safe slug: lowercase ASCII letters, digits and
 * single hyphens. Accents are stripped; an empty result becomes 'post'.
 *
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'post';
}

/**
 * Return `base` if it is free, otherwise the first free `base-2`, `base-3`, ...
 *
 * @param {string} base
 * @param {(slug: string) => boolean} exists Returns true if the slug is taken.
 * @returns {string}
 */
export function uniqueSlug(base, exists) {
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}
