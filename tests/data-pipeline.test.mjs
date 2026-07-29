import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSafePlainText,
  buildAppData,
  buildTimeline,
  parseCsv,
  parseGpx,
  parseLegacyDateRange
} from "../scripts/sync-data.mjs";

const TEST_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(TEST_PATH), "..");
const GENERATED_DATA_PATH = path.join(
  PROJECT_ROOT,
  "public/data/app-data.json"
);

test("CSV parser handles commas, escaped quotes, CRLF, and multiline fields", () => {
  const csv =
    '\uFEFFName,Description,Empty\r\n"Community, event","First line\r\nSecond ""quoted"" line",\r\n';

  assert.deepEqual(parseCsv(csv), [
    ["Name", "Description", "Empty"],
    ["Community, event", 'First line\r\nSecond "quoted" line', ""]
  ]);
  assert.throws(
    () => parseCsv('Name,Description\nEvent,"unfinished'),
    /unclosed quoted field/
  );
  assert.throws(
    () => parseCsv('Name,Description\nEvent,"done"x'),
    /unexpected character/
  );
});

test("legacy ride date labels normalize to explicit 2026 ranges", () => {
  assert.deepEqual(
    parseLegacyDateRange("Wednesday, Sept 23rd"),
    {
      dateLabel: "Wednesday, Sept 23rd",
      startDate: "2026-09-23",
      endDate: "2026-09-23",
      warnings: []
    }
  );
  assert.deepEqual(
    parseLegacyDateRange("Thursday, Sept 24th-Saturday, 26th"),
    {
      dateLabel: "Thursday, Sept 24th-Saturday, 26th",
      startDate: "2026-09-24",
      endDate: "2026-09-26",
      warnings: []
    }
  );
  assert.deepEqual(
    parseLegacyDateRange("Monday, October 12th and Tuesday, 13th"),
    {
      dateLabel: "Monday, October 12th and Tuesday, 13th",
      startDate: "2026-10-12",
      endDate: "2026-10-13",
      warnings: []
    }
  );
  assert.deepEqual(
    parseLegacyDateRange("Friday, October 30th-31st"),
    {
      dateLabel: "Friday, October 30th-31st",
      startDate: "2026-10-30",
      endDate: "2026-10-31",
      warnings: []
    }
  );
});

test("legacy Event Stop values publish every Yes and TBD row", () => {
  const csv = [
    "Date,From,To,Miles (approx),Event Stop?",
    '"Wednesday, Sept 23rd",Ely,Finland,38,Yes',
    '"Thursday, Sept 24th",Finland,Two Harbors,34,TBD',
    '"Sunday, Sept 27th",Two Harbors,Duluth,28,No'
  ].join("\n");
  const manifest = {
    routes: [
      {
        id: "fixture-route",
        startDate: "2026-09-23",
        endDate: "2026-09-30"
      }
    ]
  };
  const overrides = {
    eventsByStartDate: {
      "2026-09-23": {
        id: "finland-event",
        published: false,
        status: "tentative",
        city: "Finland",
        locationHint: [-91.7, 47.4]
      },
      "2026-09-24": {
        id: "two-harbors-event",
        published: false,
        status: "confirmed",
        city: "Two Harbors",
        locationHint: [-91.67, 47.02]
      }
    }
  };
  const timeline = buildTimeline({
    csv,
    manifest,
    overrides,
    geometryByRouteId: new Map([
      [
        "fixture-route",
        [
          [-91.9, 47.9],
          [-91.6, 47],
          [-92.1, 46.8]
        ]
      ]
    ]),
    warnings: []
  });

  assert.deepEqual(
    timeline.map((entry) => entry.eventStatus),
    ["confirmed", "tentative", "none"]
  );
  assert.deepEqual(
    timeline.flatMap((entry) => (entry.event ? [entry.event.id] : [])),
    ["finland-event", "two-harbors-event"]
  );
});

test("GPX parser supports dense tracks and sparse route cues without XML entities", () => {
  const track = parseGpx(
    '<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="46" lon="-94"></trkpt><trkpt lat="46.1" lon="-94.1"></trkpt></trkseg></trk></gpx>',
    "track fixture"
  );
  const route = parseGpx(
    '<?xml version="1.0"?><gpx><rte><rtept lat="46" lon="-94"></rtept><rtept lat="46.1" lon="-94.1"></rtept></rte></gpx>',
    "route fixture"
  );

  assert.equal(track.sourceType, "track");
  assert.equal(route.sourceType, "route");
  assert.deepEqual(track.coordinates, [
    [-94, 46],
    [-94.1, 46.1]
  ]);
  assert.throws(
    () =>
      parseGpx(
        '<!DOCTYPE gpx [<!ENTITY payload "unsafe">]><gpx></gpx>',
        "unsafe fixture"
      ),
    /disallowed XML declaration/
  );
});

test("public text validation rejects executable markup", () => {
  assert.equal(
    assertSafePlainText("  Boundary Waters community ride  ", "fixture"),
    "Boundary Waters community ride"
  );
  assert.throws(
    () => assertSafePlainText("<script>alert(1)</script>", "fixture"),
    /HTML or executable content/
  );
  assert.throws(
    () => assertSafePlainText("javascript:alert(1)", "fixture"),
    /HTML or executable content/
  );
});

test("future structured sheet columns override legacy parsing safely", () => {
  const csv = [
    [
      "Timeline ID",
      "Start Date",
      "End Date",
      "Route ID",
      "From",
      "To",
      "Miles",
      "Event Status",
      "Event ID",
      "Event Title",
      "Event Description",
      "Event Time",
      "Venue",
      "Address",
      "Event City",
      "Latitude",
      "Longitude",
      "URL",
      "Published"
    ].join(","),
    [
      "structured-day",
      "2026-09-23",
      "2026-09-23",
      "fixture-route",
      "Ely",
      "Finland",
      "38",
      "confirmed",
      "structured-event",
      "Public ride gathering",
      "Join the riders.",
      "5:30 p.m.",
      "Community Center",
      "1 Main Street",
      "Ely",
      "47.90325",
      "-91.86687",
      "https://example.org/event",
      "true"
    ].map((value) => `"${value}"`).join(",")
  ].join("\n");
  const manifest = {
    routes: [
      {
        id: "fixture-route",
        startDate: "2026-09-23",
        endDate: "2026-09-30"
      }
    ]
  };
  const overrides = { eventsByStartDate: {} };
  const geometryByRouteId = new Map([
    [
      "fixture-route",
      [
        [-91.86687, 47.90325],
        [-91.8, 47.8]
      ]
    ]
  ]);
  const warnings = [];

  const timeline = buildTimeline({
    csv,
    manifest,
    overrides,
    geometryByRouteId,
    warnings
  });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].id, "structured-day");
  assert.equal(timeline[0].dateLabel, "2026-09-23");
  assert.equal(timeline[0].event.id, "structured-event");
  assert.equal(timeline[0].event.coordinateSource, "provided");
  assert.deepEqual(timeline[0].event.coordinates, [-91.86687, 47.90325]);
  assert.equal(timeline[0].event.url, "https://example.org/event");

  const blankStructuredFields = csv
    .replace('"Public ride gathering"', '""')
    .replace('"Join the riders."', '""')
    .replace('"5:30 p.m."', '""')
    .replace('"Community Center"', '""')
    .replace('"1 Main Street"', '""')
    .replace('"https://example.org/event"', '""');
  const matchingOverride = {
    eventsByStartDate: {
      "2026-09-23": {
        id: "structured-event",
        title: "Retired event title",
        description: "Retired event description",
        timeLabel: "4 p.m.",
        venue: "Retired venue",
        address: "Retired address",
        url: "https://example.org/retired"
      }
    }
  };
  const clearedTimeline = buildTimeline({
    csv: blankStructuredFields,
    manifest,
    overrides: matchingOverride,
    geometryByRouteId,
    warnings: []
  });
  assert.equal(clearedTimeline[0].event.title, "Ely community stop");
  assert.equal(
    clearedTimeline[0].event.description,
    "Event details will be shared as they are confirmed."
  );
  assert.equal(clearedTimeline[0].event.timeLabel, null);
  assert.equal(clearedTimeline[0].event.venue, null);
  assert.equal(clearedTimeline[0].event.address, null);
  assert.equal(clearedTimeline[0].event.url, null);

  const minimalStructuredCsv = [
    "Start Date,End Date,Route ID,From,To,Miles,Event Status,Event ID,Event City,Latitude,Longitude,Published",
    "2026-09-23,2026-09-23,fixture-route,Ely,Finland,38,confirmed,new-event,Ely,47.90325,-91.86687,true"
  ].join("\n");
  const staleOverrideTimeline = buildTimeline({
    csv: minimalStructuredCsv,
    manifest,
    overrides: {
      eventsByStartDate: {
        "2026-09-23": {
          id: "retired-event",
          title: "Retired event title",
          description: "Retired event description",
          venue: "Retired venue"
        }
      }
    },
    geometryByRouteId,
    warnings: []
  });
  assert.equal(staleOverrideTimeline[0].event.id, "new-event");
  assert.equal(staleOverrideTimeline[0].event.title, "Ely community stop");
  assert.equal(staleOverrideTimeline[0].event.venue, null);

  const blankIdTimeline = buildTimeline({
    csv: minimalStructuredCsv.replace(",new-event,", ",,"),
    manifest,
    overrides: {
      eventsByStartDate: {
        "2026-09-23": {
          id: "retired-event",
          title: "Retired event title",
          city: "Ely",
          locationHint: [-90, 45]
        }
      }
    },
    geometryByRouteId,
    warnings: []
  });
  assert.equal(blankIdTimeline[0].event.id, "event-2026-09-23-ely");
  assert.deepEqual(blankIdTimeline[0].event.coordinates, [-91.86687, 47.90325]);

  assert.throws(
    () =>
      buildTimeline({
        csv: csv.replace('"true"', '""'),
        manifest,
        overrides,
        geometryByRouteId,
        warnings: []
      }),
    /explicitly publish or hide/
  );

  assert.throws(
    () =>
      buildTimeline({
        csv: csv.replace("Public ride gathering", "<script>unsafe</script>"),
        manifest,
        overrides,
        geometryByRouteId,
        warnings: []
      }),
    /HTML or executable content/
  );
});

test("generated app data is normalized, chronological, and public-safe", async () => {
  const data = JSON.parse(await readFile(GENERATED_DATA_PATH, "utf8"));

  assert.equal(data.meta.schemaVersion, 1);
  assert.equal(data.meta.title, "2026 Pedal to the Polls");
  assert.equal(data.meta.timezone, "America/Chicago");
  assert.equal(data.meta.startDate, "2026-09-23");
  assert.equal(data.meta.endDate, "2026-11-01");
  assert.equal(data.meta.dateRange, "September 23 – November 1, 2026");
  assert.deepEqual(Object.keys(data).sort(), [
    "meta",
    "routes",
    "stats",
    "timeline"
  ]);

  assert.equal(data.routes.length, 6);
  assert.deepEqual(
    data.routes.map((route) => route.order),
    [1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    data.routes.map((route) => route.leg),
    ["Leg 1", "Leg 2", "Leg 3", "Leg 4", "Leg 5", "Leg 6"]
  );
  assert.deepEqual(
    data.routes.map((route) => route.title),
    [
      "Ely to Grand Rapids",
      "Grand Rapids to Detroit Lakes",
      "Moorhead to Saint Cloud",
      "Saint Cloud to Mankato",
      "Mankato to Winona",
      "Winona to Stillwater"
    ]
  );
  assert.ok(data.routes.every((route) => !("chapter" in route)));
  assert.ok(
    data.routes.every(
      (route) =>
        route.geometry.type === "LineString" &&
        route.geometry.coordinates.length === route.source.renderedPointCount &&
        route.source.renderedPointCount > 1 &&
        route.source.renderedPointCount <= route.source.sourcePointCount &&
        ["track", "sparse-cue-route"].includes(route.geometryQuality) &&
        route.distanceMiles > 100
    )
  );

  assert.ok(data.timeline.length > 0);
  assert.deepEqual(
    data.timeline.map((entry) => entry.order),
    Array.from({ length: data.timeline.length }, (_, index) => index + 1)
  );
  assert.ok(data.timeline[0].startDate >= data.meta.startDate);
  assert.ok(data.timeline.at(-1).endDate <= data.meta.endDate);
  assert.ok(
    data.timeline.every(
      (entry, index, timeline) =>
        index === 0 || entry.startDate >= timeline[index - 1].startDate
    )
  );
  assert.ok(
    data.routes.every((route) =>
      data.timeline.some((entry) => entry.routeId === route.id)
    )
  );

  const events = data.timeline.flatMap((entry) =>
    entry.event ? [entry.event] : []
  );
  assert.equal(data.stats.routeCount, data.routes.length);
  assert.equal(data.stats.timelineEntryCount, data.timeline.length);
  assert.equal(data.stats.eventCount, events.length);
  assert.equal(
    data.stats.confirmedEventCount + data.stats.tentativeEventCount,
    events.length
  );
  assert.equal(data.stats.campaignMiles, 1215);
  assert.equal(data.stats.campaignDays, 35);
  assert.deepEqual(
    events.map((event) => event.number),
    Array.from({ length: events.length }, (_, index) => index + 1)
  );
  assert.ok(
    events.every(
      (event) =>
        ["provided", "route-approximate"].includes(event.coordinateSource) &&
        Array.isArray(event.coordinates) &&
        event.coordinates.length === 2 &&
        event.coordinates.every(Number.isFinite)
      )
  );

  const eventKeys = [
    "address",
    "city",
    "coordinateSource",
    "coordinates",
    "description",
    "id",
    "number",
    "status",
    "timeLabel",
    "title",
    "url",
    "venue"
  ].sort();
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), eventKeys);
  }
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(
    serialized,
    /\b(?:internal|private|staff-only|do not publish|outreach assignment)\b/i
  );
});

test("generated app data matches a fresh build from the configured source", async () => {
  const [checkedIn, rebuilt] = await Promise.all([
    readFile(GENERATED_DATA_PATH, "utf8").then(JSON.parse),
    buildAppData()
  ]);
  checkedIn.meta.generatedAt = "<ignored>";
  rebuilt.meta.generatedAt = "<ignored>";
  assert.deepEqual(checkedIn, rebuilt);
});
