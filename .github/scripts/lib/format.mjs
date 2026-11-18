// Turning one API row into the cells a reader sees.
//
// Everything here is pure and clock-free — `now` is an argument — so the same
// listings always render the same table, which is what makes an hourly commit
// a diff of what CHANGED rather than a diff of when it ran.
//
// The input is a scrape of other people's job postings. Every string in it was
// written by someone outside this project, so nothing below interpolates one
// into HTML without escaping it, and nothing turns one into a link without
// first checking the scheme. A `javascript:` "apply" URL in a README is a
// supply-chain bug with a hyperlink on it.


/** HTML-escapes text bound for a table cell. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The URL, if it is one a link may point at, else null.
 *
 * http(s) only, and parsed rather than pattern-matched: `javascript:` survives
 * a surprising number of hand-written checks (tabs, newlines and comments are
 * all legal inside a scheme) and none of them survive `new URL`.
 */
export function safeUrl(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;

/** Whole days between `iso` and `now`, or null when there is no usable date. */
export function ageInDays(iso, now) {
  if (typeof iso !== 'string' || iso === '') return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * The Age cell: `0d` … `29d`, then months.
 *
 * A listing with no date reads `—` rather than `0d`. "We don't know when this
 * was posted" and "this was posted today" are opposite facts about whether it
 * is worth opening, and the second one is the one that wastes an application.
 */
export function ageLabel(days) {
  if (days === null) return '—';
  if (days < 30) return `${days}d`;
  return `${Math.max(1, Math.floor(days / 30))}mo`;
}

/** Collapses whitespace and strips the site codes ATS exports leave behind. */
function tidyLocation(value) {
  return String(value ?? '')
    // "Mountain View (US-MTV-EMF680)" — an internal building code, never a place.
    .replace(/\s*\([A-Z0-9][A-Z0-9\s-]{3,}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    // `Cary,North Carolina,United States` is one real row: some exports leave no
    // space after the comma, and the cell reads as one long word on a phone.
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/** A key two spellings of one place share, so the cell lists it once. */
function locationKey(value) {
  return tidyLocation(value)
    .toLowerCase()
    .replace(/,?\s*(usa|u\.s\.a\.|united states|us)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * At most `limit` distinct locations, in the order the posting listed them.
 *
 * "Distinct" has to mean more than "a different string". One real row carries
 * the same office three times — `Mountain View, CA, USA`, `Mountain View
 * (US-MTV-EMF680)` and `Mountain View, CA, United States` — so an exact-match
 * set prints one place three times and calls it three locations. A key that is
 * a PREFIX of one already kept is the same place described more loosely, and
 * the more specific spelling is the one worth printing.
 */
function distinctLocations(values, limit) {
  const kept = [];
  for (const raw of values ?? []) {
    const tidy = tidyLocation(raw);
    if (!tidy) continue;
    const key = locationKey(tidy);
    if (!key) continue;
    const overlap = kept.findIndex((k) => k.key.startsWith(key) || key.startsWith(k.key));
    if (overlap !== -1) {
      // Same place, better words: "Mountain View, CA" beats "Mountain View".
      if (key.length > kept[overlap].key.length) kept[overlap] = { key, display: tidy };
      continue;
    }
    kept.push({ key, display: tidy });
    if (kept.length >= limit) break;
  }
  return kept.map((k) => k.display);
}

/** Countries worth printing: `Other` is the catalog's "somewhere we don't list". */
function namedCountries(job) {
  return (job.countries ?? []).filter((c) => c && c !== 'Other');
}


/** How many places a Location cell prints before it folds them away. */
export const LOCATIONS_INLINE = 3;

/** The most places one fold lists. A posting open in two hundred offices is
 *  rare, and it must not be the row that takes the page over its budget. */
const LOCATIONS_FOLDED_MAX = 25;

/**
 * The Location cell.
 *
 * Canonical cities and the posting's own strings together, each place once.
 * Up to three are printed one per line; four or more collapse into a
 * `<details>` with the count as its summary, so a role open in forty offices
 * costs the table one line until a reader asks for the rest — and the places
 * are still in the page for Ctrl+F.
 *
 * A remote role leads with `Remote` and the countries it is remote in, because
 * "Remote" alone answers the wrong question for anyone outside that country.
 */
export function locationLabel(job) {
  const countries = namedCountries(job).map(escapeHtml);
  if (job.remote === 'remote') {
    return countries.length ? `Remote — ${countries.slice(0, LOCATIONS_INLINE).join(', ')}` : 'Remote';
  }

  const places = distinctLocations([...(job.cities ?? []), ...(job.locations ?? [])], Infinity).map(escapeHtml);
  if (!places.length) return countries.length ? countries.slice(0, LOCATIONS_INLINE).join(', ') : '—';

  const hybrid = job.remote === 'hybrid' && !places.some((place) => /hybrid/i.test(place));
  if (places.length <= LOCATIONS_INLINE) return places.join('<br>') + (hybrid ? ' (hybrid)' : '');

  const listed = places.slice(0, LOCATIONS_FOLDED_MAX);
  const hidden = places.length - listed.length;
  return (
    `<details><summary><strong>${places.length} locations</strong>${hybrid ? ' (hybrid)' : ''}</summary>` +
    listed.join('<br>') +
    (hidden > 0 ? `<br>+${hidden} more` : '') +
    '</details>'
  );
}

/**
 * The flags a row can carry, in the order the legend prints them.
 *
 * Each one is something the row can actually evidence:
 *
 *   * `🔥` — the employer is in the hand-written registry as a technology
 *     company with 10,000+ people. The caller resolves that and passes it in as
 *     `job.bigTech`; a company the registry has never heard of is not flagged.
 *   * `🎓` — the TITLE asks for a Master's or a PhD. It is read from the title
 *     and nowhere else, and a title that also names a bachelor's is left alone:
 *     "BS/MS" is an invitation, not a requirement.
 *
 * What is deliberately absent: no-sponsorship, citizenship and closed flags.
 * The API's `sponsorship` field is null on every row it returns today, and it
 * only returns live postings — a flag the data cannot fill is a legend line
 * that would be wrong by omission on every row.
 */
export const FLAGS = [
  { id: 'bigTech', emoji: '🔥', legend: 'Big Tech — a technology company with 10,000+ employees' },
  { id: 'advancedDegree', emoji: '🎓', legend: "The title asks for an advanced degree (Master's or PhD)" },
];

const ADVANCED_DEGREE = /\b(?:ph\.?\s?d|doctoral|doctorate|post-?doc(?:toral)?|master['’]?s)\b/i;
const BACHELORS = /\b(?:bachelor['’]?s?|undergrad(?:uate)?s?|b\.?s\.?|b\.?a\.?)\b/i;

/** True when the title itself asks for a Master's or a PhD, and for nothing less. */
export function asksAdvancedDegree(title) {
  const text = String(title ?? '');
  return ADVANCED_DEGREE.test(text) && !BACHELORS.test(text);
}

/** The ids of the flags this row carries. */
export function flagsOf(job) {
  const ids = [];
  if (job.bigTech) ids.push('bigTech');
  if (asksAdvancedDegree(job.title)) ids.push('advancedDegree');
  return ids;
}

/** The flags as the Role cell prints them. */
export function markers(job) {
  const ids = flagsOf(job);
  return FLAGS.filter((flag) => ids.includes(flag.id))
    .map((flag) => flag.emoji)
    .join(' ');
}
