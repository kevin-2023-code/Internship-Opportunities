#!/usr/bin/env node
// Step 2 of the hourly run: listings.json in, README.md + README-Global.md out.
//
// Reads no network and no clock of its own beyond `Date.now()` at the top, so
// it can be run against the committed data file while working on the layout:
//
//   node .github/scripts/render.mjs
//
// It rewrites only what is between the LISTINGS markers of the two READMEs, and
// it leaves a file alone entirely when nothing but the Age column would change
// — see `changedBeyondClock`. Those two files are the only things it writes:
// there is no generated directory, so there is nothing for it to prune and
// nothing it can delete.
//
// Which rows are printed (the whole policy, in order):
//
//   1. a direct link to the employer's own application page — a row whose
//      link goes to LinkedIn, Indeed or another board is left out;
//   2. one of the five fields the list has a section for;
//   3. the region of the file — the United States and Canada in README.md,
//      everywhere else in README-Global.md;
//   4. the age window — `maxAgeDays`, narrowed by `fitWindow` until the file
//      fits GitHub's rendering limit. Narrowed by AGE, never sampled.
//
// listings.json itself is not filtered: it carries every row the API returned.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { README_MAX_BYTES, changedBeyondClock, fitWindow, renderListings, replaceBlock } from './lib/markdown.mjs';
import { anchorOf, countryUnknown, hasDirectApplyLink, inListedField, splitByRegion, withinDays } from './lib/select.mjs';
import { companyLabel } from './lib/companies.mjs';
import { BIG_TECH, inSizeCut, segmentOf } from './lib/segments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const count = (n) => n.toLocaleString('en-US');

/**
 * The file's own "back to top" anchor, read off its H1 rather than configured.
 *
 * The two files have different titles, so one configured anchor would be wrong
 * in one of them — and a "Back to top" link that silently does nothing is the
 * kind of defect nobody reports. Deriving it means renaming a title fixes every
 * link under it on the next run.
 */
function backToTopOf(markdown, path) {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  if (!heading) throw new Error(`${path} has no H1 for the section links to point back at.`);
  return anchorOf(heading[1].trim());
}

/**
 * One README as it WOULD be, without writing it: the widest window that fits,
 * and the file at that window.
 */
async function planReadme({ name, jobs, now, maxDays, block }) {
  const path = join(ROOT, name);
  const existing = await readFile(path, 'utf8');
  const backToTop = backToTopOf(existing, name);
  const at = (days) => replaceBlock(existing, block({ jobs, days, backToTop }));
  const days = fitWindow({ maxDays, maxBytes: README_MAX_BYTES, render: at });
  const next = at(days);
  return {
    name,
    path,
    days,
    next,
    rows: jobs.filter((job) => withinDays(job, days, now)),
    bytes: Buffer.byteLength(next, 'utf8'),
    changed: changedBeyondClock(existing, next),
  };
}

async function main() {
  const config = JSON.parse(await readFile(join(HERE, 'config.json'), 'utf8'));
  const data = JSON.parse(await readFile(join(HERE, 'listings.json'), 'utf8'));
  // The scaffold committed with a fresh repository, before anything has read
  // the catalog. Rendering it would publish "nothing matched" — a statement
  // about the job market — over a file that has simply never been filled.
  if (!data.listingsChangedAt && !data.fetchedAt) {
    throw new Error('listings.json has never been filled. Run `node .github/scripts/fetch.mjs` first.');
  }
  const now = Date.now();
  // The window can be no wider than what was fetched: asking for 120 days of a
  // 60-day read would print "the last 120 days" over 60 days of roles.
  const fetched = config.query.postedWithinDays || Infinity;
  const maxDays = Math.min(config.maxAgeDays ?? fetched, fetched);
  if (!Number.isInteger(maxDays) || maxDays < 1) {
    throw new Error('config.json needs a whole number of days in `maxAgeDays` (or a bounded `query.postedWithinDays`).');
  }

  // One canonical display name per employer, resolved once, and the one flag
  // that is a fact about the employer rather than the posting.
  const all = (data.listings ?? []).map((job) => ({
    ...job,
    companyLabel: companyLabel(job.company),
    bigTech: inSizeCut(segmentOf(job.company), BIG_TECH),
  }));

  const direct = all.filter(hasDirectApplyLink);
  const listed = direct.filter(inListedField);
  const { home, elsewhere } = splitByRegion(listed, config.homeCountries);

  const shared = { now, noun: config.noun, product: config.product ?? '' };
  const homeName = config.files.home;
  const globalName = config.files.global;

  // The global file first: the home file prints how many roles it holds.
  const globalPlan = await planReadme({
    name: globalName,
    jobs: elsewhere,
    now,
    maxDays,
    block: ({ jobs, days, backToTop }) =>
      renderListings({
        ...shared,
        jobs,
        days,
        backToTop,
        scopeNote: `Roles outside ${config.homeLabel}, and roles whose country the catalog could not read.`,
        pointers: [`🏠 For roles in ${config.homeLabel}, see the [main list](./${homeName})`, ...(config.pointers ?? [])],
      }),
  });
  const homePlan = await planReadme({
    name: homeName,
    jobs: home,
    now,
    maxDays,
    block: ({ jobs, days, backToTop }) =>
      renderListings({
        ...shared,
        jobs,
        days,
        backToTop,
        scopeNote: `Roles in ${config.homeLabel}.`,
        pointers: [
          `🌍 For roles outside ${config.homeLabel}, see [${globalName}](./${globalName}) (${count(globalPlan.rows.length)})`,
          ...(config.pointers ?? []),
        ],
      }),
  });

  // What was left out, and why — the numbers a reader of the run log needs to
  // tell a policy from a bug.
  console.log(
    `${count(all.length)} listings read. Left out: ${count(all.length - direct.length)} without a direct employer link, ` +
      `${count(direct.length - listed.length)} outside the five listed fields.`,
  );
  for (const [plan, population] of [
    [homePlan, home],
    [globalPlan, elsewhere],
  ]) {
    const unknown = plan === globalPlan ? ` (${count(population.filter(countryUnknown).length)} with no country stated)` : '';
    console.log(
      `  ${plan.name}: ${count(plan.rows.length)} rows, ${count(plan.bytes)} bytes, last ${plan.days} of ${maxDays} days — ` +
        `${count(population.length)} eligible${unknown}, ${count(population.length - plan.rows.length)} older than the window. ` +
        (plan.changed ? 'Rewritten.' : 'Unchanged.'),
    );
  }

  // Every plan was made before anything is written, so a failure above leaves
  // both files exactly as they were — a half-published run is the one state
  // that cannot be recovered from by running it again.
  const written = [];
  for (const plan of [homePlan, globalPlan]) {
    if (!plan.changed) continue;
    await writeFile(plan.path, plan.next, 'utf8');
    written.push(plan.name);
  }
  console.log(written.length ? `Updated: ${written.join(', ')}` : 'The READMEs were already current.');
}

main().catch((err) => {
  console.error(`render failed: ${err.message}`);
  process.exitCode = 1;
});
