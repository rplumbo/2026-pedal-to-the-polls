# 2026 Pedal to the Polls

A single-page route map and chronological event guide for a six-leg, 1,215-mile ride across Minnesota in support of the Boundary Waters.

The site is intentionally serverless and short-lived. It uses React, TypeScript, Vite, [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/), [OpenStreetMap](https://www.openstreetmap.org/), and GitHub Pages. There are no API keys, databases, paid services, or application servers.

## Run it locally

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run data:sync  # Rebuild public/data/app-data.json
npm run data:check # Run the data-pipeline tests
npm run check      # Regenerate data, test it, and type-check the app
npm run build      # Create the production site in dist/
npm run preview    # Preview the production build
```

## How the data works

The app never parses GPX or planning notes in a visitor’s browser. `scripts/sync-data.mjs` validates the source files and generates one safe, normalized file at `public/data/app-data.json`.

- `ride_gpx/` contains the six route sources.
- `data/route-manifest.json` fixes their order, titles, dates, colors, and Ride with GPS links.
- `data/timeline-public.csv` is the checked-in, public-safe schedule snapshot.
- `data/event-overrides.json` contains curated public copy and approximate location hints for the current legacy spreadsheet.
- `public/data/app-data.json` is generated; do not edit it by hand.

The current Week 1 and Week 2 GPX exports contain sparse turn cues rather than detailed tracks. They work at the statewide scale, but can cut corners when zoomed in. Re-export those two routes from Ride with GPS as **GPX Track** files when detailed versions are available, replace the files without renaming them, and run `npm run data:sync`.

## Update the schedule in Google Sheets

The lowest-maintenance production workflow is a dedicated, public-facing Google Sheet tab. The GitHub Action fetches its published CSV every six hours and deploys a validated build. This does not create automated commits, so repository authorship remains with the repository owner.

1. Keep internal planning notes on a separate, non-published tab.
2. Publish the public tab as CSV.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
4. Create `PUBLIC_TIMELINE_CSV_URL` with the published CSV URL.
5. Run **Actions → Build and deploy to GitHub Pages → Run workflow** once to verify it.

If the Sheet cannot be fetched or fails validation, the workflow stops and the last successful Pages deployment stays live.

The current simple spreadsheet format is the recommended maintenance workflow:

| Column | Required | Notes |
| --- | --- | --- |
| `Date` | Yes | The existing 2026 date or date-range label |
| `From` | Yes | Public start-place label |
| `To` | Yes | Public end-place label |
| `Miles (approx)` | Optional | Number, or a label like `120 over 3 days` |
| `Legislative District` | Optional | Public legislative-district label |
| `Event Stop?` | Yes | `Yes` and `TBD` both publish an event stop; `No` does not |

Curated public event copy and approximate map locations live in `data/event-overrides.json`. The pipeline also supports structured event-detail columns when the team is ready to maintain them directly in the public sheet.

## Update from a local CSV

If the team does not connect a Google Sheet:

1. Export the schedule tab as CSV.
2. Replace `data/timeline-public.csv` with a public-safe export. Never add the internal planning spreadsheet to Git.
3. Run `npm run check`.
4. Review the generated `public/data/app-data.json`.
5. Commit and push to `main`.

Every push to `main` builds and deploys automatically.

## Deployment

The workflow at `.github/workflows/deploy.yml` follows the official [Vite GitHub Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages). It:

- runs on pushes to `main`, manual dispatches, and a six-hour schedule;
- validates the data and TypeScript;
- builds with the repository-relative Pages base path;
- uploads only the `dist/` artifact;
- deploys through the `github-pages` environment from `main` only.

In the repository’s **Settings → Pages**, set **Source** to **GitHub Actions**.

GitHub disables scheduled workflows in public repositories after 60 days without repository activity. Because spreadsheet edits do not count as repository activity, the owner should set a reminder every 45 days to check the Actions tab and make a legitimate owner-authored maintenance commit when needed. If the schedule is disabled, re-enable it and use **Run workflow** to refresh the site. Do not use an automated “keepalive” commit; repository commits must remain attributed to the owner.

## Map service

MapLibre is the open-source browser renderer. The default background uses OpenStreetMap’s standard raster tiles with visible attribution. A different MapLibre-compatible style URL can be supplied without changing the map code:

```bash
VITE_MAP_STYLE_URL=https://example.org/your-map-style npm run build
```

Map attribution is always visible. The schedule contains all essential information, so the app remains usable if WebGL or the basemap is unavailable.

## Retiring the site

After the campaign:

1. Disable the scheduled workflow.
2. Turn off GitHub Pages.
3. Unpublish the Google Sheet tab.
4. Archive the repository if it should remain available as a record.
