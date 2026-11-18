// Which rows go in which file, in which order, under which heading.
//
// Pure and clock-free like format.mjs: `now` travels in, nothing here reads a
// clock or the network. All of it is exercised by render.test.mjs.

import { ageInDays, safeUrl } from './format.mjs';

/**
 * The sections a list is cut into, in reading order.
 *
 * Five of the catalog's own technical fields — the API returns `family` from
 * them, so a section can never hold a row the board would file elsewhere. The
 * sixth, `IT & Support` (help desks, desktop support, systems administration),
 * is deliberately not a section: it is a different job search from the one
 * this list is for, and {@link groupByCategory} leaves those rows out rather
 * than filing them under a heading that would bury the rest.
 */
export const CATEGORIES = [
  { family: 'Software', emoji: '💻', title: 'Software Engineering' },
  { family: 'Data & AI', emoji: '🤖', title: 'Data Science, AI & Machine Learning' },
  { family: 'Quantitative Finance', emoji: '📈', title: 'Quantitative Finance' },
  { family: 'Hardware & Engineering', emoji: '🔧', title: 'Hardware & Engineering' },
  { family: 'Product & Design', emoji: '📱', title: 'Product & Design' },
];

const SECTION_FAMILIES = new Set(CATEGORIES.map((category) => category.family));

/** True when the row's field is one this list prints a section for. */
export function inListedField(job) {
  return SECTION_FAMILIES.has(job.family);
}

/**
 * Hosts that are a job board or an aggregator rather than an employer.
 *
 * A row is listed only when its Application button can go straight to the
 * employer's own posting — a company careers site or the applicant-tracking
 * system it hires through (Greenhouse, Workday, Lever, Ashby…). A link that
 * lands on another board's copy of the posting is one more click, one more
 * sign-in, and often a posting the employer has already closed.
 *
 * Matched on the registrable end of the host, so `www.linkedin.com`,
 * `sg.linkedin.com` and `linkedin.com` are one entry. Add a host here when a
 * board turns up in the Application column; never remove an employer by adding
 * its careers site.
 */
export const AGGREGATOR_HOSTS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'simplyhired.com',
  'monster.com',
  'dice.com',
  'careerbuilder.com',
  'talent.com',
  'jooble.org',
  'adzuna.com',
  'careerjet.com',
  'jobrapido.com',
  'wellfound.com',
  'builtin.com',
  'joinhandshake.com',
  'wayup.com',
  'ripplematch.com',
  'simplify.jobs',
  'jobright.ai',
  'otta.com',
  'welcometothejungle.com',
  'levels.fyi',
  'ycombinator.com',
  'workatastartup.com',
  '1point3acres.com',
  'internsg.com',
  'free-work.com',
  'ctgoodjobs.hk',
  'careercross.com',
  'arbetsformedlingen.se',
  'localjobnetwork.com',
  'talentnet.community',
  'apptrkr.com',
  'click2apply.net',
  'universityaffairs.ca',
  'handicap-job.com',
  'vitijob.com',
  'trueinterview.io',
];

/** `efinancialcareers.hk`, `.fr`, `.sg`… — one board under many endings. */
const AGGREGATOR_NAMES = ['efinancialcareers', 'indeed', 'linkedin', 'glassdoor'];

/** The lowercased host of a URL, without `www.`, or '' when it is not one. */
export function hostOf(value) {
  const url = safeUrl(value);
  if (!url) return '';
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * True when the row's apply link goes to the employer rather than to a board.
 *
 * A row with no usable apply URL is NOT direct: the Application cell would be
 * empty, and a row a reader cannot act on is not worth one of the lines this
 * page has.
 */
export function hasDirectApplyLink(job) {
  const host = hostOf(job.applyUrl);
  if (!host) return false;
  if (AGGREGATOR_HOSTS.some((board) => host === board || host.endsWith(`.${board}`))) return false;
  const labels = host.split('.');
  return !AGGREGATOR_NAMES.some((name) => labels.includes(name));
}

/** True when the row was posted (or re-posted) inside `days` days. An undated
 *  posting is in no window — the same rule the API's own window holds. */
export function withinDays(job, days, now) {
  const age = ageInDays(job.updatedAt, now);
  return age !== null && age <= days;
}

/**
 * The GitHub anchor for a heading, so the index links at its own sections.
 *
 * GitHub's rule, transcribed: lowercase, drop everything that is not a letter,
 * digit, COMBINING MARK, space, hyphen or underscore, then turn the spaces into
 * hyphens. It does NOT trim, which is why a heading that opens with an emoji
 * anchors at a LEADING hyphen (`#-software-engineering`) — the space the emoji
 * leaves behind becomes one. Trimming it here is the one-character mistake that
 * makes every link in the index scroll to the top of the page instead.
 *
 * Marks are KEPT because GitHub keeps them, and the one that matters is
 * invisible. `🗂️` and `🏷️` are an emoji followed by U+FE0F VARIATION
 * SELECTOR-16 (category Mn); github-slugger strips the emoji and keeps the
 * selector, so `## 🗂️ By field` really anchors at `#️-by-field` with a leading
 * character nothing renders. Dropping marks here produced `#-by-field`, and the
 * two most-used jump links on both filter hubs scrolled to the top of the page.
 * `📍` and `⚡` carry no selector, so those links worked — which is exactly why
 * this was invisible by eye.
 *
 * Do not "fix" it by deleting the selector from the emoji instead: `🏷` and `☁`
 * default to TEXT presentation, and the selector is what makes them render as
 * emoji at all.
 */
export function anchorOf(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * One application, identified the way a reader would identify it.
 *
 * The API already returns one row per catalog id, but the catalog can hold the
 * same opening under two ids — a re-post, or two aggregators that reached it by
 * different URLs. Two rows pointing at the SAME application page are one
 * application to somebody filling it in, so the newer row wins and the older
 * one is dropped. Rows with no apply URL are never folded together: with
 * nothing to compare, "same company, similar title" is a guess, and a guess
 * that hides a real opening is the expensive direction to be wrong in.
 */
export function dedupeByApplication(jobs) {
  const byApplication = new Map();
  const kept = [];
  for (const job of jobs) {
    const key = job.applyUrl ? job.applyUrl.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase() : null;
    if (!key) {
      kept.push(job);
      continue;
    }
    const seen = byApplication.get(key);
    if (seen) continue;
    byApplication.set(key, job);
    kept.push(job);
  }
  return kept;
}

/** Newest first, then company, then title — a total order, so no two runs of
 *  the same data can produce two different files. */
export function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const at = Date.parse(a.updatedAt ?? '') || 0;
    const bt = Date.parse(b.updatedAt ?? '') || 0;
    if (at !== bt) return bt - at;
    const company = (a.company ?? '').localeCompare(b.company ?? '');
    if (company !== 0) return company;
    const title = (a.title ?? '').localeCompare(b.title ?? '');
    if (title !== 0) return title;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

/**
 * Splits the set into the home-region list and everything else.
 *
 * A row counts as home when the catalog resolved ANY of its countries into the
 * home set — a role open in both Toronto and London belongs in both readers'
 * lists, and printing it once in each is the honest answer.
 *
 * A row whose country could not be read at all goes to the GLOBAL file. That
 * is the fail-safe direction: the home file is the one most readers open, and
 * padding it with roles that might be anywhere is how a focused list stops
 * being one. The global file says which section they are in.
 */
export function splitByRegion(jobs, homeCountries) {
  const home = [];
  const elsewhere = [];
  for (const job of jobs) {
    const countries = job.countries ?? [];
    if (countries.some((c) => homeCountries.includes(c))) home.push(job);
    else elsewhere.push(job);
  }
  return { home, elsewhere };
}

/** True when the row named no country the catalog recognises. */
export function countryUnknown(job) {
  return !(job.countries ?? []).some((c) => c && c !== 'Other');
}

/**
 * Rows grouped into {@link CATEGORIES} order, dropping the empty sections.
 *
 * A row whose field is not one of the five is in no section. Callers that
 * report counts filter with {@link inListedField} first, so the number in a
 * headline is always the number of rows under it.
 */
export function groupByCategory(jobs) {
  const buckets = new Map(CATEGORIES.map((c) => [c.family, { ...c, jobs: [] }]));
  for (const job of jobs) buckets.get(job.family)?.jobs.push(job);
  return [...buckets.values()].filter((bucket) => bucket.jobs.length > 0);
}

/** The UTC calendar day a posting went up, as `YYYY-MM-DD`, or '' if undated. */
function dayOf(job) {
  const at = Date.parse(job.updatedAt ?? '');
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : '';
}

/**
 * The order a table prints in: newest DAY first, then company, then title.
 *
 * By calendar day rather than by the second, so one employer's postings from
 * the same day sit on consecutive rows and the table can print the name once
 * and `↳` under it. The day is the UTC date of the posting, not its age from
 * the clock, so the order is a property of the data — it does not reshuffle
 * as the hour advances. Total, like {@link sortJobs}: the id breaks every tie.
 */
export function sortForDisplay(jobs) {
  const name = (job) => String(job.companyLabel || job.company || '').toLowerCase();
  // Code-unit comparison, not localeCompare: the hourly run and a laptop must
  // agree on the order whatever locale each one's ICU was built with.
  const compare = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return [...jobs].sort(
    (a, b) =>
      compare(dayOf(b), dayOf(a)) ||
      compare(name(a), name(b)) ||
      compare(a.title ?? '', b.title ?? '') ||
      compare(a.id ?? '', b.id ?? ''),
  );
}
