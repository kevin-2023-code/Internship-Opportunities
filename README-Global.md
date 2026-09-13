# Internship Opportunities — Worldwide

**Tech internships outside the United States and Canada — refreshed every hour.**

Every row below is pulled straight from the [TrueInterview job catalog](https://trueinterview.io/applications/jobs)
by a scheduled job in this repository. Nothing is typed by hand, so an internship that closes
disappears from the list on the next run instead of wasting your afternoon.

> 🇺🇸🇨🇦 **Internships in the United States and Canada** are in the [main list](./README.md).
> 🎓 **Graduating instead?** → [New-Grad-Opportunities](https://github.com/kevin-2023-code/New-Grad-Opportunities)
> 📬 **Want these in your inbox?** TrueInterview mails a digest of new roles matching your search — [set it up here](https://trueinterview.io/applications/jobs).

<!-- LISTINGS:START — everything between these markers is generated hourly. Edit the scripts, not the table. -->

_The hourly refresh has not run in this repository yet. The first run of the **Update listings** workflow writes the table here — trigger it by hand from the Actions tab, or wait for the top of the hour._

<!-- LISTINGS:END -->

---

## How this list is built

1. **The catalog.** TrueInterview continuously ingests postings, deduplicates them, and classifies
   each one — field, seniority rung, work mode, city and country. A posting that stops appearing at
   its source is retired.
2. **The query.** Once an hour this repository asks the public API for everything that matches
   [`config.json`](./.github/scripts/config.json): **internships** in the six technical fields,
   still open. No API key — the endpoint is public and documented at
   <https://trueinterview.io/developers/api>.
3. **The files.** [`fetch.mjs`](./.github/scripts/fetch.mjs) writes
   [`listings.json`](./.github/scripts/listings.json); [`render.mjs`](./.github/scripts/render.mjs)
   renders the tables between the markers above. A run that cannot read the API changes nothing —
   an hour-old list beats a list that says there are no internships.

**Why there is no "Summer 2027" split.** The catalog classifies a posting as an internship or not;
it does not parse a season and a year out of the title, and guessing one from the words would drop
every internship that names its term differently — or names it nowhere, which most of them do. So
this list is *every open tech internship*, newest first, and the term is in the title where the
employer put it.

**Prefer the data?** [`listings.json`](./.github/scripts/listings.json) carries every internship in
the window with its structured fields — field, cities, countries, work mode and both URLs. Or call
the API yourself:

```bash
curl 'https://trueinterview.io/api/v1/jobs?kind=intern&family=tech&limit=50'
```

## What the columns mean

| Column | What it is |
| --- | --- |
| **Company** | The employer, as the posting names them. `↳` means "same company as the row above". |
| **Role** | The job title, linking to the role on TrueInterview, where you can score it against your CV and track the application. |
| **Location** | Canonical city where the pipeline could resolve one, otherwise what the posting said. |
| **Apply** | The employer's own application page. |
| **Age** | How long ago the posting was published or last re-posted. |

## Contributing

A wrong or stale row is almost always a catalog problem rather than a rendering one, so
[open an issue](../../issues/new) with the row and what is wrong with it and it gets fixed at the
source, for every surface at once. Changes to how the list is built are pull requests against
`.github/scripts/` — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

The scripts in this repository are MIT-licensed. The job postings themselves belong to the
employers who published them; this list links to them and does not reproduce their text.
