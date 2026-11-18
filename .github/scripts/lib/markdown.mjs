// Rows in, Markdown out.
//
// The README IS the list: every role inside the window on one page a reader
// can Ctrl+F, in five category sections, newest first. There are no filter
// pages and no folds — the one thing that bounds the page is GitHub's own
// rendering limit, and the page meets it by narrowing its AGE WINDOW (see
// `fitWindow`), never by sampling.
//
// Pure: nothing here reads a file, a clock or the network. `now` travels in.

import { ageInDays, ageLabel, escapeHtml, FLAGS, flagsOf, locationLabel, markers, safeUrl } from './format.mjs';
import { anchorOf, groupByCategory, sortForDisplay, withinDays } from './select.mjs';

export const BLOCK_START = '<!-- LISTINGS:START — everything between these markers is generated hourly. Edit the scripts, not the table. -->';
export const BLOCK_END = '<!-- LISTINGS:END -->';

/** GitHub renders at most this many bytes of a Markdown file. */
export const GITHUB_RENDER_LIMIT = 512_000;

/**
 * Where a README has to stay. Under the limit by a margin rather than at it:
 * the Age cells grow a byte as roles pass ten days, and a file that fits by a
 * hundred bytes at noon is truncated by dinner.
 */
export const README_MAX_BYTES = 490_000;

/** The Application button and the TrueInterview icon, relative to the READMEs. */
export const APPLY_BUTTON = 'assets/apply.svg';
export const SITE_ICON = 'assets/ti.svg';

/** The Age cell — the last cell of a row — which is a function of the clock
 *  rather than of the listing. */
const AGE_CELL = /<td>(?:\d+d|\d+mo|—)<\/td><\/tr>/g;

const count = (n) => n.toLocaleString('en-US');

/**
 * The Application cell: a button straight to the employer's posting, and a
 * small icon to the same role on TrueInterview.
 *
 * Two links with two different jobs. The button is the one a reader came for
 * and it never goes anywhere but the employer; the icon is where the role can
 * be scored against a CV and tracked. A URL that is not http(s) renders as
 * nothing at all rather than as a dead or dangerous link.
 */
function applicationCell(job) {
  const apply = safeUrl(job.applyUrl);
  const page = safeUrl(job.url);
  const parts = [];
  if (apply) {
    parts.push(`<a href="${escapeHtml(apply)}"><img src="${APPLY_BUTTON}" alt="Apply" width="70"></a>`);
  }
  if (page) {
    parts.push(`<a href="${escapeHtml(page)}"><img src="${SITE_ICON}" alt="TrueInterview" width="22"></a>`);
  }
  return parts.length ? parts.join(' ') : '—';
}

/** One row, on one line. `↳` repeats the company above it. */
function row(job, now, previousCompany) {
  const name = job.companyLabel || job.company || '';
  const company = name && name === previousCompany ? '↳' : `<strong>${escapeHtml(name || '—')}</strong>`;
  const mark = markers(job);
  const role = `${escapeHtml(job.title || 'Untitled role')}${mark ? ` ${mark}` : ''}`;
  return (
    `<tr><td>${company}</td><td>${role}</td><td>${locationLabel(job)}</td>` +
    `<td>${applicationCell(job)}</td><td>${ageLabel(ageInDays(job.updatedAt, now))}</td></tr>`
  );
}

/** One table, in the order given. Empty in means empty out — never a table
 *  with only a header. */
export function renderTable(jobs, now) {
  if (!jobs.length) return '';
  const rows = [];
  let previousCompany = null;
  for (const job of jobs) {
    rows.push(row(job, now, previousCompany));
    previousCompany = job.companyLabel || job.company || '';
  }
  return [
    '<table>',
    '<thead>',
    '<tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr>',
    '</thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
  ].join('\n');
}

/** The legend, holding only the flags at least one printed row carries. */
function renderLegend(jobs) {
  const used = new Set(jobs.flatMap(flagsOf));
  const lines = FLAGS.filter((flag) => used.has(flag.id)).map((flag) => `- ${flag.emoji} ${flag.legend}`);
  return lines.length ? ['## Legend', '', ...lines, ''] : [];
}

/**
 * Everything between the markers of one README.
 *
 * `jobs` is the file's whole population, already filtered to the rows this
 * list prints; this function applies the age window and nothing else, so the
 * headline, the index and the sections all count the same rows.
 *
 *   * `days`       — the age window, stated on the page in one line.
 *   * `noun`       — "internships", "new-grad roles".
 *   * `backToTop`  — the anchor of the file's own H1.
 *   * `product`    — the one product line, as Markdown.
 *   * `pointers`   — the "looking for something else" lines, as Markdown.
 *   * `scopeNote`  — which regions this file covers, as a sentence.
 */
export function renderListings({ jobs, now, days, noun, backToTop, product, pointers = [], scopeNote = '' }) {
  const shown = jobs.filter((job) => withinDays(job, days, now));
  const buckets = groupByCategory(shown).map((bucket) => ({ ...bucket, jobs: sortForDisplay(bucket.jobs) }));
  const total = buckets.reduce((sum, bucket) => sum + bucket.jobs.length, 0);
  const windowLine =
    `_${scopeNote ? `${scopeNote} ` : ''}Posted in the last ${days} ${days === 1 ? 'day' : 'days'}, ` +
    'each with a direct link to the employer’s own application page. Refreshed hourly._';

  const body = [BLOCK_START, ''];

  if (!total) {
    // Reachable only when the catalog returned rows and none of them is inside
    // the window — fetch.mjs refuses an empty read long before this.
    body.push(`_No ${noun} with a direct application link were posted in the last ${days} days._`, '');
    if (pointers.length) body.push('> **Looking for something else?**', '>', ...pointers.map((line) => `> ${line}  `), '');
    body.push(BLOCK_END);
    return body.join('\n');
  }

  body.push(`### Browse ${count(total)} ${noun} by category`, '');
  for (const bucket of buckets) {
    const heading = `${bucket.emoji} ${bucket.title}`;
    body.push(`${bucket.emoji} **[${bucket.title}](#${anchorOf(heading)})** (${count(bucket.jobs.length)})`, '');
  }
  body.push('---', '');

  if (product) body.push(product, '');
  body.push(...renderLegend(buckets.flatMap((bucket) => bucket.jobs)));
  if (pointers.length) body.push('> **Looking for something else?**', '>', ...pointers.map((line) => `> ${line}  `), ''
);
  body.push(windowLine, '');

  for (const bucket of buckets) {
    body.push(
      `## ${bucket.emoji} ${bucket.title}`,
      '',
      `[Back to top](#${backToTop})`,
      '',
      renderTable(bucket.jobs, now),
      '',
    );
  }

  body.push(BLOCK_END);
  return body.join('\n');
}

/**
 * The widest age window, in whole days, whose rendering fits the budget.
 *
 * The page promises every role inside its window, so the only honest way to
 * make it smaller is to make the window shorter — the OLDEST rows go, in
 * order, and the page says which window it ended up with. `render(days)`
 * returns the whole file as it would be written; its size only ever grows with
 * `days`, so a binary search finds the cut.
 *
 * Throws when even one day does not fit. That is a run to fail rather than a
 * file to publish: a truncated list looks broken to everyone who arrives, and
 * an hour-old one does not.
 */
export function fitWindow({ maxDays, maxBytes = README_MAX_BYTES, render }) {
  const sizeAt = (days) => Buffer.byteLength(render(days), 'utf8');
  if (sizeAt(maxDays) <= maxBytes) return maxDays;
  if (sizeAt(1) > maxBytes) {
    throw new Error(
      `one day of roles is ${count(sizeAt(1))} bytes, over the ${count(maxBytes)}-byte budget ` +
        `(GitHub stops rendering a Markdown file at ${count(GITHUB_RENDER_LIMIT)}).`,
    );
  }
  let fits = 1;
  let over = maxDays;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (sizeAt(middle) <= maxBytes) fits = middle;
    else over = middle;
  }
  return fits;
}

/** Replaces the generated block in `existing`, keeping every hand-written line. */
export function replaceBlock(existing, block) {
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      'The listings markers are missing from the file. Restore BLOCK_START / BLOCK_END or delete the file and let the next run recreate it.',
    );
  }
  return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
}

/**
 * Whether two renderings differ in anything about the LISTINGS.
 *
 * The Age cells are excluded: they are a function of the clock, not of the
 * catalog. Without that this returns true on almost every hourly run of a
 * large list even when no row has moved — each posting's age ticks over at its
 * own time of day — and a history where most commits are "the clock advanced"
 * cannot be read for what it is for: when this employer posted, when that one
 * pulled the role.
 *
 * What is NOT excluded is anything that changes what the page says: a role
 * arriving, leaving, or ageing out of the window, and the window itself.
 */
export function changedBeyondClock(before, after) {
  const strip = (text) => String(text ?? '').replace(AGE_CELL, '<td>·</td></tr>');
  return strip(before) !== strip(after);
}
