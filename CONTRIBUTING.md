# Contributing

This list is **generated**. Once an hour a workflow reads the public
[TrueInterview jobs API](https://trueinterview.io/developers/api), writes
[`listings.json`](./.github/scripts/listings.json) and re-renders the two READMEs. Nobody types a
row into a table, so there is no "add a job" pull request to make — a hand-edited row is
overwritten by the next run.

## Adding a role, or fixing one

Open an issue with one of the two forms:

* [**New role**](../../issues/new?template=new_role.yml) — a real opening that is not on the list.
  It needs the link to the employer's own posting.
* [**Edit role**](../../issues/new?template=edit_role.yml) — a role that has closed, or a row with
  the wrong company, location, category or link.

Both are handled at the source, in the catalog, and reach this list on the next hourly run.

## Which roles are listed

A role in the catalog is printed when all of these hold:

1. **It has a direct link to the employer's own application page** — a careers site, or the
   applicant-tracking system the employer hires through. A role whose only link goes to LinkedIn,
   Indeed or another job board is left out
   ([`AGGREGATOR_HOSTS`](./.github/scripts/lib/select.mjs)).
2. **It is in one of the five sections**: Software Engineering; Data Science, AI & Machine
   Learning; Quantitative Finance; Hardware & Engineering; Product & Design. IT support and
   help-desk roles are not listed.
3. **It is in the file's region**: the United States and Canada in [README.md](./README.md),
   everywhere else — and roles whose country could not be read — in
   [README-Global.md](./README-Global.md).
4. **It is inside the age window.** The window starts at the 60 days the API serves and is
   shortened, a day at a time, until the file fits under GitHub's rendering limit. The oldest roles
   go first; nothing is sampled. Each README states the window it ended up with.

`listings.json` is not filtered: it carries every one of the internships the query returned.

## What the flags mean

* 🔥 — the employer is in the [company registry](./.github/scripts/lib/company-registry.mjs) as a
  technology company with 10,000+ employees. To add or correct an employer, change its entry there:
  `'ramp': { sector: 'fintech', size: 'large' }`. The key is what `companyKey()` returns, the
  sectors and sizes are listed in [`segments.mjs`](./.github/scripts/lib/segments.mjs), and if you
  are not sure of either, leave the employer out — an unlisted company is simply not flagged.
* 🎓 — the title itself asks for a Master's or a PhD.

There is no sponsorship, citizenship or "closed" flag. The API does not say which roles sponsor a
visa, and it returns only roles that are still open: a role that closes leaves the list on the next
run.

## Changing the generator

Pull requests against `.github/scripts/` are welcome. There are no dependencies to install.

```bash
node --test .github/scripts/*.test.mjs   # the tests CI runs (includes a link and size check)
node .github/scripts/fetch.mjs           # re-read the catalog (network)
node .github/scripts/render.mjs          # re-render from the committed listings.json (no network)
```

Four things to know first:

1. **`render.mjs` reads `listings.json`, never the network**, so the layout can be worked on
   against the committed snapshot.
2. **Only what is between the `LISTINGS:START` / `LISTINGS:END` markers is generated.** The lines
   above and below them are hand-written and survive every run.
3. **A failed read never publishes an empty list.** `fetch.mjs` throws instead of writing one, and
   refuses a read that has collapsed to under half of the committed list.
4. **Nothing is written over budget.** GitHub stops rendering a Markdown file at 512,000 bytes, so
   `render.mjs` narrows the window until each README is under 490,000, and fails the run if it
   cannot.

The data is also available directly:

```bash
curl 'https://trueinterview.io/api/v1/jobs?kind=intern&family=tech&limit=50'
```

## Setting up a fork

The hourly run commits to the repository, so GitHub Actions needs write permission:
Settings → Actions → General → Workflow permissions → **Read and write permissions**. The API needs
no key. Scheduled workflows run from the default branch only.
