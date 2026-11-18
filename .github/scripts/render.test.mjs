// The generator's tests. `node --test .github/scripts/`
//
// They run in CI before any run is allowed to rewrite the published list,
// because the failures that matter here are all silent: a renderer that drops
// rows still produces a plausible-looking table, an index whose anchors have
// drifted still produces links that simply do nothing, and a page a few bytes
// over GitHub's limit loses its bottom third without an error anywhere.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ageLabel, asksAdvancedDegree, escapeHtml, flagsOf, locationLabel, markers, safeUrl } from './lib/format.mjs';
import {
  AGGREGATOR_HOSTS,
  anchorOf,
  CATEGORIES,
  countryUnknown,
  dedupeByApplication,
  groupByCategory,
  hasDirectApplyLink,
  hostOf,
  inListedField,
  sortForDisplay,
  sortJobs,
  splitByRegion,
  withinDays,
} from './lib/select.mjs';
import {
  APPLY_BUTTON,
  BLOCK_END,
  BLOCK_START,
  GITHUB_RENDER_LIMIT,
  README_MAX_BYTES,
  SITE_ICON,
  changedBeyondClock,
  fitWindow,
  renderListings,
  renderTable,
  replaceBlock,
} from './lib/markdown.mjs';
import { companyKey, companyLabel } from './lib/companies.mjs';
import { COMPANY_SEGMENTS } from './lib/company-registry.mjs';
import { BIG_TECH, SECTORS, SIZES, coverage, inSizeCut, segmentOf } from './lib/segments.mjs';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

function job(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    company: 'Acme',
    title: 'Software Engineer',
    locations: ['Seattle, WA'],
    cities: ['Seattle, WA'],
    countries: ['United States'],
    remote: 'onsite',
    category: 'Software',
    family: 'Software',
    role: 'Software Engineer',
    seniority: 'new-grad',
    level: 'newgrad',
    kind: 'newgrad',
    sponsorship: null,
    source: 'ats-boards',
    applyUrl: 'https://jobs.example.com/1',
    url: 'https://trueinterview.io/jobs/1',
    postedAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...over,
  };
}

const page = (over = {}) =>
  renderListings({
    jobs: [job()],
    now: NOW,
    days: 60,
    noun: 'roles',
    backToTop: 'title',
    product: 'The product line.',
    pointers: ['For the other list, see [there](./README-Global.md)'],
    scopeNote: 'Roles in the United States & Canada.',
    ...over,
  });

describe('cells', () => {
  it('escapes text a posting controls', () => {
    assert.equal(escapeHtml('<script>&"'), '&lt;script&gt;&amp;&quot;');
  });

  it('refuses a URL that is not http(s), however it is spelled', () => {
    assert.equal(safeUrl('https://x.test/a'), 'https://x.test/a');
    assert.equal(safeUrl('javascript:alert(1)'), null);
    // A scheme may legally carry whitespace and control characters, which is
    // what defeats a hand-written prefix check; parsing does not care.
    assert.equal(safeUrl('java\nscript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,<script>'), null);
    assert.equal(safeUrl(''), null);
    assert.equal(safeUrl(undefined), null);
  });

  it('says nothing about the age of an undated posting', () => {
    assert.equal(ageLabel(null), '—');
    assert.equal(ageLabel(0), '0d');
    assert.equal(ageLabel(29), '29d');
    assert.equal(ageLabel(30), '1mo');
    assert.equal(ageLabel(213), '7mo');
  });

  it('leads with Remote, and names the countries it is remote in', () => {
    assert.equal(
      locationLabel(job({ remote: 'remote', countries: ['United States', 'Canada'], cities: [] })),
      'Remote — United States, Canada',
    );
    assert.equal(locationLabel(job({ remote: 'remote', countries: ['Other'], cities: [] })), 'Remote');
  });

  it('prints up to three places one per line', () => {
    const label = locationLabel(job({ cities: ['Austin, TX'], locations: ['Austin, TX', 'Boston, MA', 'Denver, CO'] }));
    assert.equal(label, 'Austin, TX<br>Boston, MA<br>Denver, CO');
  });

  it('folds four or more places away, with the count as the summary', () => {
    const label = locationLabel(
      job({ cities: [], locations: ['Austin, TX', 'Boston, MA', 'Denver, CO', 'Omaha, NE', 'Reno, NV'] }),
    );
    assert.equal(
      label,
      '<details><summary><strong>5 locations</strong></summary>' +
        'Austin, TX<br>Boston, MA<br>Denver, CO<br>Omaha, NE<br>Reno, NV</details>',
    );
  });

  it('does not let one posting with hundreds of offices take over the page', () => {
    const locations = Array.from({ length: 200 }, (_, i) => `Town${String.fromCharCode(65 + (i % 26))}${i}, TX`);
    const label = locationLabel(job({ cities: [], locations }));
    assert.ok(label.includes('<strong>200 locations</strong>'));
    assert.ok(label.includes('+175 more'));
  });

  it('prints one place once, whichever way the ATS spelled it', () => {
    // A real row: the same office three times, one of them as a building code.
    const label = locationLabel(
      job({
        cities: [],
        locations: ['Mountain View, CA, USA', 'Mountain View (US-MTV-EMF680)', 'Mountain View, CA, United States'],
      }),
    );
    assert.equal(label, 'Mountain View, CA, USA');
  });

  it('falls back to the country, then to a dash, when the posting names no place', () => {
    assert.equal(locationLabel(job({ cities: [], locations: [], countries: ['Canada'] })), 'Canada');
    assert.equal(locationLabel(job({ cities: [], locations: [], countries: [] })), '—');
  });

  it('does not say "hybrid" twice when the posting already said it once', () => {
    assert.equal(
      locationLabel(job({ remote: 'hybrid', cities: [], locations: ['Hybrid (UK)'], countries: ['United Kingdom'] })),
      'Hybrid (UK)',
    );
    assert.equal(
      locationLabel(job({ remote: 'hybrid', cities: ['Dublin'], locations: ['Dublin'], countries: ['Ireland'] })),
      'Dublin (hybrid)',
    );
  });

  it('escapes a location that tries to close the table', () => {
    const label = locationLabel(job({ cities: [], locations: ['</td></tr></table><script>x</script>'] }));
    assert.ok(!label.includes('<script>'));
    assert.ok(!label.includes('</table>'));
  });
});

describe('flags', () => {
  it('reads an advanced degree from the title, and only from the title', () => {
    assert.ok(asksAdvancedDegree('Research Scientist Intern, AI Maps (PhD)'));
    assert.ok(asksAdvancedDegree('Machine Learning Engineering Intern (Masters/PhD)'));
    assert.ok(asksAdvancedDegree("Master's Machine Learning Engineer, Intern"));
    assert.ok(asksAdvancedDegree('Postdoctoral Researcher in Polymer Rheology'));
    assert.ok(!asksAdvancedDegree('Software Engineer Intern'));
  });

  it('does not mistake a word that merely looks like a degree', () => {
    assert.ok(!asksAdvancedDegree('Master Data Analyst'));
    assert.ok(!asksAdvancedDegree('Software Developer, Master Data Management'));
    assert.ok(!asksAdvancedDegree('YPHD Programmer'));
    assert.ok(!asksAdvancedDegree('MBA Enrollment Data Analyst'));
  });

  it("leaves a title alone when a bachelor's is enough", () => {
    assert.ok(!asksAdvancedDegree("Data Science Intern - Bachelor's/Master's"));
    assert.ok(!asksAdvancedDegree('Software Engineering Intern (BS/MS/PhD)'));
  });

  it('marks only what the row can actually evidence', () => {
    assert.equal(markers(job()), '');
    assert.equal(markers(job({ bigTech: true })), '🔥');
    assert.equal(markers(job({ bigTech: true, title: 'Research Intern (PhD)' })), '🔥 🎓');
    // No row can be flagged for sponsorship or work mode: the field is null on
    // every row the API returns, and a flag nothing fills is a wrong legend.
    assert.deepEqual(flagsOf(job({ sponsorship: 'U.S. Citizenship is Required', remote: 'remote' })), []);
  });

  it('calls an employer Big Tech only when the registry says so', () => {
    assert.equal(inSizeCut(segmentOf('Zzz Definitely Not A Real Employer'), BIG_TECH), false);
    assert.equal(inSizeCut({ sector: 'consumer-internet', size: 'mega' }, BIG_TECH), true);
    assert.equal(inSizeCut({ sector: 'banking-finance', size: 'mega' }, BIG_TECH), false);
  });
});

describe('which rows are listed', () => {
  it('keeps a link to the employer or to the ATS it hires through', () => {
    for (const applyUrl of [
      'https://boards.greenhouse.io/acme/jobs/1',
      'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/1',
      'https://jobs.lever.co/acme/1',
      'https://careers.acme.com/positions/1',
    ]) {
      assert.ok(hasDirectApplyLink(job({ applyUrl })), applyUrl);
    }
  });

  it('leaves out a link that lands on a job board', () => {
    for (const applyUrl of [
      'https://www.linkedin.com/jobs/view/4491794194/',
      'https://sg.linkedin.com/jobs/view/1',
      'https://www.indeed.com/viewjob?jk=1',
      'https://uk.indeed.com/viewjob?jk=1',
      'https://www.efinancialcareers.hk/jobs-1',
      'https://www.glassdoor.co.uk/job-listing/1',
    ]) {
      assert.ok(!hasDirectApplyLink(job({ applyUrl })), applyUrl);
    }
  });

  it('does not mistake an employer whose name contains a board for the board', () => {
    assert.ok(hasDirectApplyLink(job({ applyUrl: 'https://careers.notlinkedin.com/1' })));
    assert.ok(hasDirectApplyLink(job({ applyUrl: 'https://indeedflex.example.com/1' })));
  });

  it('leaves out a row with no usable link at all', () => {
    assert.ok(!hasDirectApplyLink(job({ applyUrl: null })));
    assert.ok(!hasDirectApplyLink(job({ applyUrl: '' })));
    assert.ok(!hasDirectApplyLink(job({ applyUrl: 'javascript:alert(1)' })));
    assert.equal(hostOf('https://WWW.Example.com/x'), 'example.com');
    assert.equal(hostOf('not a url'), '');
  });

  it('lists every board as a bare host, the form the matcher compares', () => {
    for (const host of AGGREGATOR_HOSTS) {
      assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, host);
      assert.ok(!host.startsWith('www.'), host);
    }
  });

  it('has no section for IT support, and files nothing there under another heading', () => {
    assert.ok(!inListedField(job({ family: 'IT & Support' })));
    assert.ok(!inListedField(job({ family: null })));
    assert.ok(inListedField(job({ family: 'Quantitative Finance' })));
    assert.deepEqual(groupByCategory([job({ family: 'IT & Support' }), job({ family: 'Healthcare' })]), []);
  });

  it('puts an undated posting in no window', () => {
    assert.ok(withinDays(job({ updatedAt: daysAgo(30) }), 30, NOW));
    assert.ok(!withinDays(job({ updatedAt: daysAgo(31) }), 30, NOW));
    assert.ok(!withinDays(job({ updatedAt: null }), 30, NOW));
  });
});

describe('selection', () => {
  it('anchors a heading the way GitHub does, leading hyphen and all', () => {
    assert.equal(anchorOf('💻 Software Engineering'), '-software-engineering');
    assert.equal(anchorOf('🤖 Data Science, AI & Machine Learning'), '-data-science-ai--machine-learning');
  });

  it('keeps the invisible variation selector, because GitHub keeps it', () => {
    // Checked against github-slugger itself. An emoji that carries U+FE0F
    // loses the emoji and KEEPS the selector, so the anchor opens with a
    // character nothing renders.
    assert.equal(anchorOf('🗂️ By field'), '️-by-field');
    assert.equal(anchorOf('📍 By location'), '-by-location');
  });

  it('folds two rows that lead to the same application form', () => {
    const kept = dedupeByApplication([
      job({ id: 'a', applyUrl: 'https://jobs.example.com/1?utm_source=x' }),
      job({ id: 'b', applyUrl: 'https://jobs.example.com/1/' }),
      job({ id: 'c', applyUrl: 'https://jobs.example.com/2' }),
    ]);
    assert.deepEqual(kept.map((j) => j.id), ['a', 'c']);
  });

  it('never folds rows that have no application URL to compare', () => {
    const kept = dedupeByApplication([job({ id: 'a', applyUrl: null }), job({ id: 'b', applyUrl: null })]);
    assert.equal(kept.length, 2);
  });

  it('orders the data file newest first, and totally', () => {
    const rows = [
      job({ id: 'b', company: 'Beta', updatedAt: daysAgo(1) }),
      job({ id: 'a', company: 'Alpha', updatedAt: daysAgo(1) }),
      job({ id: 'c', company: 'Gamma', updatedAt: daysAgo(0) }),
    ];
    assert.deepEqual(sortJobs(rows).map((j) => j.id), ['c', 'a', 'b']);
    assert.deepEqual(sortJobs([...rows].reverse()).map((j) => j.id), ['c', 'a', 'b']);
  });

  it('orders a table by day, then keeps one employer on consecutive rows', () => {
    const at = (iso) => new Date(iso).toISOString();
    const rows = [
      job({ id: '1', company: 'Acme', title: 'B', updatedAt: at('2026-09-12T23:00:00Z') }),
      job({ id: '2', company: 'Globex', title: 'A', updatedAt: at('2026-09-12T12:00:00Z') }),
      job({ id: '3', company: 'Acme', title: 'A', updatedAt: at('2026-09-12T01:00:00Z') }),
      job({ id: '4', company: 'Zeta', title: 'A', updatedAt: at('2026-09-13T01:00:00Z') }),
      job({ id: '5', company: 'Old', title: 'A', updatedAt: null }),
    ];
    assert.deepEqual(sortForDisplay(rows).map((j) => j.id), ['4', '3', '1', '2', '5']);
    assert.deepEqual(sortForDisplay([...rows].reverse()).map((j) => j.id), ['4', '3', '1', '2', '5']);
  });

  it('puts a role open in two regions in the home list', () => {
    const { home, elsewhere } = splitByRegion(
      [job({ id: 'both', countries: ['Canada', 'United Kingdom'] })],
      ['United States', 'Canada'],
    );
    assert.equal(home.length, 1);
    assert.equal(elsewhere.length, 0);
  });

  it('sends a role with no country to the global list, not the home one', () => {
    const rows = [job({ id: 'nowhere', countries: [] }), job({ id: 'other', countries: ['Other'] })];
    const { home, elsewhere } = splitByRegion(rows, ['United States', 'Canada']);
    assert.equal(home.length, 0);
    assert.equal(elsewhere.length, 2);
    assert.ok(countryUnknown(rows[0]));
    assert.ok(countryUnknown(rows[1]));
  });

  it('keeps the category order and drops the sections nothing landed in', () => {
    const grouped = groupByCategory([
      job({ family: 'Product & Design' }),
      job({ family: 'Software' }),
      job({ family: 'Quantitative Finance' }),
    ]);
    assert.deepEqual(grouped.map((b) => b.title), ['Software Engineering', 'Quantitative Finance', 'Product & Design']);
  });

  it('cuts the list into the five sections, in reading order', () => {
    assert.deepEqual(CATEGORIES.map((c) => c.family), [
      'Software',
      'Data & AI',
      'Quantitative Finance',
      'Hardware & Engineering',
      'Product & Design',
    ]);
  });
});

describe('the table', () => {
  it('has the five columns, in order', () => {
    const table = renderTable([job()], NOW);
    assert.ok(
      table.includes('<tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr>'),
    );
  });

  it('repeats a company as ↳ and names it again when it changes', () => {
    const table = renderTable(
      [job({ company: 'Acme' }), job({ company: 'Acme' }), job({ company: 'Globex' })],
      NOW,
    );
    assert.equal(table.match(/<strong>Acme<\/strong>/g).length, 1);
    assert.equal(table.match(/<td>↳<\/td>/g).length, 1);
    assert.ok(table.includes('<strong>Globex</strong>'));
  });

  it('prints the role as plain text with its flags after it', () => {
    const table = renderTable([job({ title: 'Research Intern (PhD)', bigTech: true })], NOW);
    assert.ok(table.includes('<td>Research Intern (PhD) 🔥 🎓</td>'));
  });

  it('sends the button to the employer and the icon to the role on the site', () => {
    const table = renderTable([job({ applyUrl: 'https://jobs.example.com/1?a=1&b=2' })], NOW);
    assert.ok(
      table.includes(
        `<td><a href="https://jobs.example.com/1?a=1&amp;b=2"><img src="${APPLY_BUTTON}" alt="Apply" width="70"></a> ` +
          `<a href="https://trueinterview.io/jobs/1"><img src="${SITE_ICON}" alt="TrueInterview" width="22"></a></td>`,
      ),
    );
    // Exactly two links per row: the title is not one of them.
    assert.equal(table.match(/<a href=/g).length, 2);
  });

  it('renders an unlinkable URL as nothing rather than a dead link', () => {
    const table = renderTable([job({ applyUrl: 'javascript:alert(1)', url: 'javascript:alert(2)' })], NOW);
    assert.ok(!table.includes('javascript:'));
    assert.ok(table.includes('<td>—</td>'));
  });

  it('escapes a hostile title instead of rendering it', () => {
    const table = renderTable([job({ title: 'SWE <img src=x onerror=alert(1)>' })], NOW);
    assert.ok(!table.includes('<img src=x'));
    assert.ok(table.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('puts every row on one line, ending in its age', () => {
    const table = renderTable([job({ updatedAt: daysAgo(5) }), job({ updatedAt: null })], NOW);
    const rows = table.split('\n').filter((line) => line.startsWith('<tr><td>'));
    assert.equal(rows.length, 2);
    assert.ok(rows[0].endsWith('<td>5d</td></tr>'));
    assert.ok(rows[1].endsWith('<td>—</td></tr>'));
  });

  it('renders nothing at all for no rows, rather than an empty table', () => {
    assert.equal(renderTable([], NOW), '');
  });
});

describe('the page', () => {
  const rows = [
    job({ id: 'new', company: 'Acme', family: 'Software', updatedAt: daysAgo(2) }),
    job({ id: 'old', company: 'Oldco', family: 'Software', updatedAt: daysAgo(40) }),
    job({ id: 'ml', company: 'Globex', family: 'Data & AI', updatedAt: daysAgo(3), bigTech: true }),
    job({ id: 'none', company: 'Undated', family: 'Software', updatedAt: null }),
  ];

  it('links its index at anchors the headings actually have', () => {
    const out = page({ jobs: rows });
    const linked = [...out.matchAll(/\]\(#([^)]+)\)\*\* \(/g)].map((m) => m[1]);
    const headings = [...out.matchAll(/^## (.+)$/gm)].map((m) => anchorOf(m[1]));
    assert.ok(linked.length >= 2);
    for (const anchor of linked) assert.ok(headings.includes(anchor), `no heading for #${anchor}`);
  });

  it('counts the headline, the index and the tables over the same rows', () => {
    const out = page({ jobs: rows, days: 60 });
    assert.ok(out.includes('### Browse 3 roles by category'));
    assert.ok(out.includes('(2)') && out.includes('(1)'));
    assert.equal(out.split('\n').filter((line) => line.startsWith('<tr><td>')).length, 3);
  });

  it('narrows by age, dropping the oldest and stating the window', () => {
    const out = page({ jobs: rows, days: 30 });
    assert.ok(out.includes('### Browse 2 roles by category'));
    assert.ok(!out.includes('Oldco'));
    assert.ok(out.includes('Posted in the last 30 days'));
    assert.ok(out.includes('Roles in the United States & Canada.'));
  });

  it('prints the top matter in order: index, product, legend, pointers, window, tables', () => {
    const out = page({ jobs: rows });
    const order = ['### Browse', 'The product line.', '## Legend', 'Looking for something else?', 'Posted in the last', '<table>'];
    const positions = order.map((needle) => out.indexOf(needle));
    assert.ok(positions.every((at) => at !== -1), JSON.stringify(positions));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  });

  it('puts in the legend only the flags a printed row carries', () => {
    const fire = page({ jobs: rows });
    assert.ok(fire.includes('- 🔥 '));
    assert.ok(!fire.includes('- 🎓 '));
    const none = page({ jobs: [job()] });
    assert.ok(!none.includes('## Legend'));
    // The flags this data cannot fill are in no legend at all.
    for (const emoji of ['🛂', '🇺🇸', '🔒', '🆕', '🌐']) assert.ok(!fire.includes(emoji), emoji);
  });

  it('has none of the things the page used to send a reader away to', () => {
    const out = page({ jobs: rows });
    assert.ok(!out.includes('lists/'));
    assert.ok(!out.includes('<details><summary>Show'));
    assert.ok(!out.includes('Posting the most'));
  });

  it('says the list is empty rather than rendering an empty page', () => {
    const out = page({ jobs: [job({ updatedAt: daysAgo(90) })], days: 30 });
    assert.ok(out.includes('_No roles with a direct application link were posted in the last 30 days._'));
    assert.ok(!out.includes('<table>'));
    assert.ok(out.startsWith(BLOCK_START));
    assert.ok(out.endsWith(BLOCK_END));
  });
});

describe('the byte budget', () => {
  const many = Array.from({ length: 600 }, (_, i) =>
    job({ id: `r${i}`, company: `Company ${i}`, updatedAt: daysAgo(i % 60) }),
  );
  const render = (days) => page({ jobs: many, days });

  it('stays under what GitHub will finish rendering', () => {
    assert.ok(README_MAX_BYTES < GITHUB_RENDER_LIMIT);
    assert.ok(README_MAX_BYTES <= 500_000);
  });

  it('keeps the whole window when it fits', () => {
    assert.equal(fitWindow({ maxDays: 60, maxBytes: 10_000_000, render }), 60);
  });

  it('narrows to the widest window that fits, by age and never by sample', () => {
    const maxBytes = 100_000;
    const days = fitWindow({ maxDays: 60, maxBytes, render });
    assert.ok(days >= 1 && days < 60);
    assert.ok(Buffer.byteLength(render(days), 'utf8') <= maxBytes);
    assert.ok(Buffer.byteLength(render(days + 1), 'utf8') > maxBytes);
    // Every row inside the window is on the page: nothing was sampled out.
    const expected = many.filter((row) => withinDays(row, days, NOW)).length;
    assert.equal(render(days).split('\n').filter((line) => line.startsWith('<tr><td>')).length, expected);
  });

  it('fails the run rather than publishing a page no window can fit', () => {
    assert.throws(() => fitWindow({ maxDays: 60, maxBytes: 500, render }), /over the 500-byte budget/);
  });
});

describe('writing the file', () => {
  const file = `# Title\n\nIntro a human wrote.\n\n${BLOCK_START}\nold\n${BLOCK_END}\n\nFooter a human wrote.\n`;

  it('replaces only what is between the markers', () => {
    const next = replaceBlock(file, `${BLOCK_START}\nnew\n${BLOCK_END}`);
    assert.ok(next.includes('Intro a human wrote.'));
    assert.ok(next.includes('Footer a human wrote.'));
    assert.ok(next.includes('new'));
    assert.ok(!next.includes('old'));
  });

  it('refuses a file whose markers are gone, rather than appending a second list', () => {
    assert.throws(() => replaceBlock('# Title\n\nno markers\n', 'block'), /markers are missing/);
  });

  it('does not count an age cell ticking over as a change worth committing', () => {
    const rows = [job({ id: 'a', updatedAt: daysAgo(4) }), job({ id: 'b', company: 'Globex', updatedAt: daysAgo(9) })];
    const before = page({ jobs: rows, now: NOW });
    const after = page({ jobs: rows, now: NOW + 86_400_000 });
    assert.notEqual(before, after);
    assert.equal(changedBeyondClock(before, after), false);
  });

  it('still counts a role arriving or leaving as a change', () => {
    const before = page({ jobs: [job({ id: 'a' })] });
    const after = page({ jobs: [job({ id: 'a' }), job({ id: 'b', company: 'Globex' })] });
    assert.equal(changedBeyondClock(before, after), true);
  });

  it('counts the window itself moving as a change', () => {
    const rows = [job({ id: 'a' })];
    assert.equal(changedBeyondClock(page({ jobs: rows, days: 30 }), page({ jobs: rows, days: 29 })), true);
  });
});

describe('one employer, one name', () => {
  it('collapses the spellings one employer reaches the catalog under', () => {
    assert.equal(companyLabel('Spacex'), 'SpaceX');
    assert.equal(companyLabel('SpaceX'), 'SpaceX');
    assert.equal(companyKey('Spacex'), companyKey('SpaceX'));
    assert.equal(companyKey('Openai'), 'openai');
  });

  it('leaves a name the catalog stored as authored exactly as it was written', () => {
    assert.equal(companyLabel('Susquehanna International Group'), 'Susquehanna International Group');
    assert.equal(companyLabel('Ci&t'), 'Ci&t');
    assert.equal(companyKey('Ci&t'), 'ci-and-t');
  });

  it('title-cases only the names that arrived with no casing at all', () => {
    assert.equal(companyLabel('applied intuition'), 'applied intuition');
    assert.equal(companyLabel('applied-intuition'), 'Applied Intuition');
    assert.equal(companyLabel(''), '');
  });
});

describe('the company registry', () => {
  it('answers for a company it has never heard of, without guessing', () => {
    assert.deepEqual(segmentOf('Zzz Definitely Not A Real Employer'), { sector: null, size: null });
    assert.deepEqual(segmentOf(''), { sector: null, size: null });
  });

  it('is keyed on the slug every other surface files a company under', () => {
    // A registry key that is not what `companyKey` produces is an entry that
    // will never be found, and nothing anywhere would report it.
    for (const key of Object.keys(COMPANY_SEGMENTS)) {
      assert.equal(companyKey(key), key, `${key} is not a canonical company key`);
    }
  });

  it('only ever records a sector and a size the taxonomy defines', () => {
    const sectors = new Set(SECTORS.map((sector) => sector.id));
    const sizes = new Set(SIZES.map((size) => size.id));
    for (const [key, entry] of Object.entries(COMPANY_SEGMENTS)) {
      assert.ok(entry.sector === null || sectors.has(entry.sector), `${key}: unknown sector ${entry.sector}`);
      assert.ok(entry.size === null || sizes.has(entry.size), `${key}: unknown size ${entry.size}`);
    }
  });

  it('takes a size cut over technology sectors only', () => {
    const cut = { id: 'big-tech', sizes: ['mega'] };
    assert.equal(inSizeCut({ sector: 'consumer-internet', size: 'mega' }, cut), true);
    // A 10,000-person employer that is not a technology company: big, not Big Tech.
    assert.equal(inSizeCut({ sector: 'engineering-services', size: 'mega' }, cut), false);
    // An employer whose headcount nobody could establish is in no size cut.
    assert.equal(inSizeCut({ sector: 'consumer-internet', size: null }, cut), false);
    assert.equal(inSizeCut({ sector: null, size: 'mega' }, cut), false);
  });

  it('reports how much of a set it actually covers', () => {
    const rows = [job({ company: 'Google' }), job({ company: 'Zzz Not Real Ltd' }), job({ company: '***' })];
    const cover = coverage(rows);
    assert.equal(cover.rows, 3);
    assert.equal(cover.companies, 3);
    assert.ok(cover.companiesClassified <= cover.companies);
  });
});
