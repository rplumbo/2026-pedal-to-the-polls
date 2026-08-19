import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_TIMELINE_FILE = "data/timeline-public.csv";
const DEFAULT_OUTPUT_FILE = "public/data/app-data.json";
const ROUTE_MANIFEST_FILE = "data/route-manifest.json";
const EVENTS_FILE = "data/events.json";
const RIDE_YEAR = 2026;
const MAX_REMOTE_CSV_BYTES = 2_000_000;
const DENSE_TRACK_SIMPLIFICATION_METERS = 8;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

const MONTHS = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["sept", 9],
  ["sep", 9],
  ["october", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12]
]);

const PLACE_ALIASES = new Map([
  ["pine island", "Pine Island"],
  ["winonah", "Winona"],
  ["lake city to", "Lake City"],
  ["redwing", "Red Wing"],
  ["chanshassen", "Chanhassen"]
]);

const PUBLIC_COPY_BLOCKLIST =
  /\b(?:tbd|internal|private|staff-only|do not publish|outreach assignment)\b/i;

const PLAIN_TEXT_BLOCKLIST =
  /(?:<\s*script\b|javascript\s*:|data\s*:\s*text\/html|on(?:error|load|click)\s*=)/i;

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function unique(values) {
  return [...new Set(values)];
}

export function parseCsv(input) {
  if (typeof input !== "string") {
    throw new TypeError("CSV input must be a string.");
  }

  const source = input.replace(/^\uFEFF/, "");
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  const finishField = () => {
    record.push(field);
    field = "";
    afterQuote = false;
  };

  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && source[index + 1] === "\n") {
          index += 1;
        }
        finishRecord();
      } else if (!/\s/.test(character)) {
        throw new Error(
          `Invalid CSV: unexpected character after a closing quote at offset ${index}.`
        );
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(
          `Invalid CSV: quote inside an unquoted field at offset ${index}.`
        );
      }
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      finishRecord();
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: unclosed quoted field.");
  }

  if (field.length > 0 || record.length > 0 || afterQuote) {
    finishRecord();
  }

  return records;
}

function buildHeaderIndex(header) {
  const index = new Map();

  header.forEach((value, column) => {
    const key = normalizeHeader(value);
    if (!key) {
      return;
    }
    if (index.has(key)) {
      throw new Error(
        `Unsafe timeline schema: duplicate header "${normalizeWhitespace(value)}".`
      );
    }
    index.set(key, column);
  });

  for (const required of ["date", "from", "to"]) {
    if (!index.has(required) && !(required === "date" && index.has("startdate"))) {
      throw new Error(`Timeline CSV is missing the required "${required}" column.`);
    }
  }

  return index;
}

function getColumn(row, headerIndex, ...keys) {
  for (const key of keys) {
    const column = headerIndex.get(key);
    if (column !== undefined) {
      return row[column] ?? "";
    }
  }
  return "";
}

function hasColumn(headerIndex, ...keys) {
  return keys.some((key) => headerIndex.has(key));
}

function resolvePublicCopy({
  row,
  headerIndex,
  keys,
  overrideValue,
  rowLabel,
  overrideLabel,
  maxLength
}) {
  const sheetValue = assertPublicCopy(
    getColumn(row, headerIndex, ...keys),
    rowLabel,
    maxLength
  );
  if (hasColumn(headerIndex, ...keys)) {
    return sheetValue;
  }
  return (
    sheetValue ||
    assertPublicCopy(overrideValue, overrideLabel, maxLength)
  );
}

export function assertSafePlainText(value, label, maxLength = 500) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return "";
  }
  if (text.length > maxLength) {
    throw new Error(`${label} is longer than ${maxLength} characters.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(`${label} contains unsafe control characters.`);
  }
  if (PLAIN_TEXT_BLOCKLIST.test(text) || /[<>]/.test(text)) {
    throw new Error(`${label} contains HTML or executable content.`);
  }
  return text;
}

function assertPublicCopy(value, label, maxLength) {
  const text = assertSafePlainText(value, label, maxLength);
  if (text && PUBLIC_COPY_BLOCKLIST.test(text)) {
    throw new Error(
      `${label} looks like non-public editorial copy. Publish curated copy instead.`
    );
  }
  return text;
}

function normalizeHttpsUrl(value, label) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials.`);
  }
  return parsed.href;
}

function slugify(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isoDate(year, month, day, label) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} contains an invalid calendar date.`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

export function assertIsoDate(value, label = "Date") {
  const text = normalizeWhitespace(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  return isoDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    label
  );
}

export function parseLegacyDateRange(label, year = RIDE_YEAR) {
  const dateLabel = assertSafePlainText(label, "Timeline date", 120);
  const monthPattern =
    /\b(January|February|March|April|May|June|July|August|September|Sept|Sep|October|Oct|November|Nov|December|Dec)\.?\b/gi;
  const monthMatches = [...dateLabel.matchAll(monthPattern)];
  if (monthMatches.length === 0) {
    throw new Error(`Could not find a month in timeline date "${dateLabel}".`);
  }

  const datePortion = dateLabel.slice(monthMatches[0].index);
  const dayMatches = [
    ...datePortion.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/gi)
  ].map((match) => Number(match[1]));
  if (dayMatches.length === 0) {
    throw new Error(`Could not find a day in timeline date "${dateLabel}".`);
  }

  const firstMonth = MONTHS.get(monthMatches[0][1].toLowerCase());
  const lastMonth =
    MONTHS.get(monthMatches.at(-1)[1].toLowerCase()) ?? firstMonth;
  let startYear = year;
  let endYear = year;
  let startDate = isoDate(
    startYear,
    firstMonth,
    dayMatches[0],
    `Timeline date "${dateLabel}"`
  );
  let endDate = isoDate(
    endYear,
    lastMonth,
    dayMatches.at(-1),
    `Timeline date "${dateLabel}"`
  );

  if (endDate < startDate && monthMatches.length === 1) {
    endYear += 1;
    endDate = isoDate(
      endYear,
      lastMonth,
      dayMatches.at(-1),
      `Timeline date "${dateLabel}"`
    );
  }
  if (endDate < startDate) {
    throw new Error(`Timeline date range ends before it starts: "${dateLabel}".`);
  }

  const warnings = [];
  const weekdayMatches = [
    ...dateLabel.matchAll(
      /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi
    )
  ].map(
    (match) =>
      match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()
  );

  if (weekdayMatches.length > 0) {
    const actualStart =
      WEEKDAYS[new Date(`${startDate}T12:00:00Z`).getUTCDay()];
    if (weekdayMatches[0] !== actualStart) {
      warnings.push(
        `The weekday in "${dateLabel}" does not match ${startDate}.`
      );
    }
  }
  if (weekdayMatches.length > 1) {
    const actualEnd = WEEKDAYS[new Date(`${endDate}T12:00:00Z`).getUTCDay()];
    if (weekdayMatches.at(-1) !== actualEnd) {
      warnings.push(
        `The ending weekday in "${dateLabel}" does not match ${endDate}.`
      );
    }
  }

  return { dateLabel, startDate, endDate, warnings };
}

function parseDateRange(row, headerIndex) {
  const structuredStart = normalizeWhitespace(
    getColumn(row, headerIndex, "startdate")
  );
  const structuredEnd = normalizeWhitespace(
    getColumn(row, headerIndex, "enddate")
  );
  const sourceLabel = getColumn(row, headerIndex, "datelabel", "date");

  if (structuredStart || structuredEnd) {
    if (!structuredStart) {
      throw new Error("A timeline end date was provided without a start date.");
    }
    const startDate = assertIsoDate(structuredStart, "Timeline start date");
    const endDate = structuredEnd
      ? assertIsoDate(structuredEnd, "Timeline end date")
      : startDate;
    if (endDate < startDate) {
      throw new Error(`Timeline range ${startDate}–${endDate} is reversed.`);
    }
    const dateLabel =
      assertSafePlainText(sourceLabel, "Timeline date label", 120) ||
      (startDate === endDate ? startDate : `${startDate} – ${endDate}`);
    return { dateLabel, startDate, endDate, warnings: [] };
  }

  return parseLegacyDateRange(sourceLabel);
}

function normalizePlace(value, label, warnings) {
  const text = assertSafePlainText(value, label, 100);
  if (!text) {
    return "";
  }

  const alias = PLACE_ALIASES.get(text.toLowerCase());
  if (alias) {
    if (text !== alias) {
      warnings.push(`Normalized a legacy place label in ${label}.`);
    }
    return alias;
  }
  return text;
}

function parseMileage(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return { miles: null, milesLabel: null };
  }

  const match =
    /^(?:approx(?:imately)?\.?\s*)?(\d+(?:\.\d+)?)(?:\s*miles?)?(?:\s+over\s+(\d+)\s+days?)?$/i.exec(
      text
    );
  if (!match) {
    throw new Error(`Unrecognized mileage value "${text}".`);
  }

  const miles = Number(match[1]);
  if (!Number.isFinite(miles) || miles < 0 || miles > 500) {
    throw new Error(`Mileage "${text}" is outside the accepted range.`);
  }

  const displayMiles = Number.isInteger(miles) ? String(miles) : String(miles);
  return {
    miles,
    milesLabel: match[2]
      ? `${displayMiles} miles over ${Number(match[2])} days`
      : `${displayMiles} miles`
  };
}

function parsePublished(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) {
    return undefined;
  }
  if (["true", "yes", "1", "published"].includes(text)) {
    return true;
  }
  if (["false", "no", "0", "draft", "hidden", "unpublished"].includes(text)) {
    return false;
  }
  throw new Error(`Published value "${value}" must be yes/no or true/false.`);
}

function normalizeEventStatus(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text || ["no", "none", "false", "0"].includes(text)) {
    return "none";
  }
  if (["yes", "confirmed", "true", "1"].includes(text)) {
    return "confirmed";
  }
  if (
    ["tbd", "tentative", "planned", "planning", "draft", "maybe"].includes(text)
  ) {
    return "tentative";
  }
  throw new Error(
    `Event status "${value}" must be confirmed, tentative, or none.`
  );
}

function parseCoordinate(value, axis, label) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return null;
  }
  const coordinate = Number(text);
  if (!Number.isFinite(coordinate)) {
    throw new Error(`${label} must be a number.`);
  }

  const valid =
    axis === "lat"
      ? coordinate >= 43 && coordinate <= 49.5
      : coordinate >= -97.5 && coordinate <= -89;
  if (!valid) {
    throw new Error(`${label} is outside the Minnesota route region.`);
  }
  return coordinate;
}

function validateCoordinatePair(coordinates, label) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !coordinates.every(Number.isFinite)
  ) {
    throw new Error(`${label} must be a [longitude, latitude] pair.`);
  }
  parseCoordinate(coordinates[0], "lng", `${label} longitude`);
  parseCoordinate(coordinates[1], "lat", `${label} latitude`);
  return coordinates;
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16))
    )
    .replace(/&#(\d+);/g, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 10))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readXmlAttribute(attributes, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i"
  );
  const match = pattern.exec(attributes);
  return match ? decodeXml(match[1] ?? match[2]) : null;
}

export function parseGpx(xml, sourceLabel = "GPX") {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error(`${sourceLabel} contains a disallowed XML declaration.`);
  }

  const extractPoints = (element) => {
    const points = [];
    const pattern = new RegExp(
      `<(?:[\\w.-]+:)?${element}\\b([^>]*)>`,
      "gi"
    );
    for (const match of xml.matchAll(pattern)) {
      const latitude = Number(readXmlAttribute(match[1], "lat"));
      const longitude = Number(readXmlAttribute(match[1], "lon"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`${sourceLabel} contains an invalid ${element}.`);
      }
      validateCoordinatePair(
        [longitude, latitude],
        `${sourceLabel} ${element}`
      );
      points.push([longitude, latitude]);
    }
    return points;
  };

  const trackPoints = extractPoints("trkpt");
  const routePoints = extractPoints("rtept");
  if (trackPoints.length > 0 && routePoints.length > 0) {
    throw new Error(
      `${sourceLabel} mixes track and route geometry; split it into one geometry type.`
    );
  }

  const coordinates = trackPoints.length > 0 ? trackPoints : routePoints;
  if (coordinates.length < 2) {
    throw new Error(`${sourceLabel} contains fewer than two route points.`);
  }

  return {
    coordinates,
    sourceType: trackPoints.length > 0 ? "track" : "route"
  };
}

function haversineMiles(first, second) {
  const earthRadiusMiles = 3958.7613;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const deltaLatitude = secondLatitude - firstLatitude;
  const deltaLongitude = toRadians(second[0] - first[0]);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function lineDistanceMiles(coordinates) {
  let distance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += haversineMiles(coordinates[index - 1], coordinates[index]);
  }
  return distance;
}

function pointSegmentDistanceMeters(point, start, end) {
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const longitudeScale = 111_320 * Math.cos(latitudeRadians);
  const latitudeScale = 110_574;
  const startX = (start[0] - point[0]) * longitudeScale;
  const startY = (start[1] - point[1]) * latitudeScale;
  const endX = (end[0] - point[0]) * longitudeScale;
  const endY = (end[1] - point[1]) * latitudeScale;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  const position =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            (-(startX * segmentX + startY * segmentY)) /
              segmentLengthSquared
          )
        );
  const projectedX = startX + position * segmentX;
  const projectedY = startY + position * segmentY;
  return Math.hypot(projectedX, projectedY);
}

export function simplifyLine(coordinates, toleranceMeters) {
  if (coordinates.length <= 2 || toleranceMeters <= 0) {
    return coordinates.map((coordinate) => [...coordinate]);
  }

  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;
  const stack = [[0, coordinates.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = toleranceMeters;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointSegmentDistanceMeters(
        coordinates[index],
        coordinates[startIndex],
        coordinates[endIndex]
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }

    if (furthestIndex !== -1) {
      keep[furthestIndex] = 1;
      stack.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }

  return coordinates.filter((_, index) => keep[index] === 1);
}

function calculateBounds(coordinates) {
  let minimumLongitude = Infinity;
  let minimumLatitude = Infinity;
  let maximumLongitude = -Infinity;
  let maximumLatitude = -Infinity;

  for (const [longitude, latitude] of coordinates) {
    minimumLongitude = Math.min(minimumLongitude, longitude);
    minimumLatitude = Math.min(minimumLatitude, latitude);
    maximumLongitude = Math.max(maximumLongitude, longitude);
    maximumLatitude = Math.max(maximumLatitude, latitude);
  }

  return [
    [round(minimumLongitude), round(minimumLatitude)],
    [round(maximumLongitude), round(maximumLatitude)]
  ];
}

function nearestPointOnLine(hint, coordinates) {
  validateCoordinatePair(hint, "Event location hint");
  let best = null;

  const latitudeRadians = (hint[1] * Math.PI) / 180;
  const longitudeScale = 111_320 * Math.cos(latitudeRadians);
  const latitudeScale = 110_574;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const startX = (start[0] - hint[0]) * longitudeScale;
    const startY = (start[1] - hint[1]) * latitudeScale;
    const endX = (end[0] - hint[0]) * longitudeScale;
    const endY = (end[1] - hint[1]) * latitudeScale;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const position =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (-(startX * segmentX + startY * segmentY)) /
                segmentLengthSquared
            )
          );
    const projectedX = startX + position * segmentX;
    const projectedY = startY + position * segmentY;
    const distanceSquared = projectedX ** 2 + projectedY ** 2;

    if (!best || distanceSquared < best.distanceSquared) {
      best = {
        distanceSquared,
        coordinates: [
          start[0] + position * (end[0] - start[0]),
          start[1] + position * (end[1] - start[1])
        ]
      };
    }
  }

  return best.coordinates.map((coordinate) => round(coordinate));
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.routes)) {
    throw new Error("Route manifest must use schemaVersion 1 and contain routes.");
  }
  if (manifest.routes.length !== 6) {
    throw new Error("Route manifest must explicitly contain all six routes.");
  }

  const ids = new Set();
  const orders = new Set();
  let previousEndDate = null;

  for (const route of [...manifest.routes].sort((a, b) => a.order - b.order)) {
    const id = slugify(route.id);
    if (!id || id !== route.id || ids.has(id)) {
      throw new Error(`Route ID "${route.id}" is invalid or duplicated.`);
    }
    ids.add(id);
    if (
      !Number.isInteger(route.order) ||
      route.order < 1 ||
      route.order > 6 ||
      orders.has(route.order)
    ) {
      throw new Error(`Route order "${route.order}" is invalid or duplicated.`);
    }
    orders.add(route.order);
    assertPublicCopy(route.title, `Route ${route.id} title`, 100);
    assertPublicCopy(route.leg, `Route ${route.id} leg`, 60);
    if (
      path.basename(route.file) !== route.file ||
      !route.file.toLowerCase().endsWith(".gpx")
    ) {
      throw new Error(`Route ${route.id} has an unsafe GPX filename.`);
    }
    const startDate = assertIsoDate(route.startDate, `${route.id} start date`);
    const endDate = assertIsoDate(route.endDate, `${route.id} end date`);
    if (endDate < startDate) {
      throw new Error(`Route ${route.id} has a reversed date range.`);
    }
    if (previousEndDate && startDate <= previousEndDate) {
      throw new Error("Route manifest date ranges overlap or are out of order.");
    }
    previousEndDate = endDate;
    if (!/^#[0-9A-F]{6}$/i.test(route.color)) {
      throw new Error(`Route ${route.id} has an invalid color.`);
    }
    normalizeHttpsUrl(route.sourceUrl, `Route ${route.id} source URL`);
  }
}

async function loadRoutes(manifest) {
  validateManifest(manifest);
  const routes = [];
  const geometryByRouteId = new Map();

  for (const entry of [...manifest.routes].sort(
    (first, second) => first.order - second.order
  )) {
    const gpxPath = path.join(PROJECT_ROOT, "ride_gpx", entry.file);
    const xml = await readFile(gpxPath, "utf8");
    const parsed = parseGpx(xml, entry.file);
    const originalCoordinates = parsed.coordinates;
    const renderedCoordinates =
      parsed.sourceType === "track"
        ? simplifyLine(
            originalCoordinates,
            DENSE_TRACK_SIMPLIFICATION_METERS
          )
        : originalCoordinates.map((coordinate) => [...coordinate]);

    geometryByRouteId.set(entry.id, originalCoordinates);
    routes.push({
      id: entry.id,
      order: entry.order,
      title: entry.title,
      leg: entry.leg,
      dateRange: {
        startDate: entry.startDate,
        endDate: entry.endDate
      },
      color: entry.color,
      geometry: {
        type: "LineString",
        coordinates: renderedCoordinates.map(([longitude, latitude]) => [
          round(longitude, 5),
          round(latitude, 5)
        ])
      },
      bounds: calculateBounds(originalCoordinates),
      distanceMiles: round(lineDistanceMiles(originalCoordinates), 1),
      geometryQuality:
        parsed.sourceType === "track"
          ? "track"
          : "sparse-cue-route",
      source: {
        file: entry.file,
        url: normalizeHttpsUrl(
          entry.sourceUrl,
          `Route ${entry.id} source URL`
        ),
        sourceGeometry: parsed.sourceType,
        sourcePointCount: originalCoordinates.length,
        renderedPointCount: renderedCoordinates.length
      }
    });
  }

  return { routes, geometryByRouteId };
}

function validateOverrides(overrides) {
  if (
    overrides?.schemaVersion !== 1 ||
    typeof overrides.eventsByTimelineStartDate !== "object" ||
    Array.isArray(overrides.eventsByTimelineStartDate)
  ) {
    throw new Error(
      "Events must use schemaVersion 1 and eventsByTimelineStartDate."
    );
  }

  const ids = new Set();
  for (const [date, event] of Object.entries(overrides.eventsByTimelineStartDate)) {
    assertIsoDate(date, `Event override date ${date}`);
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error(`Event override ${date} must be an object.`);
    }
    if (!event.id || event.id !== slugify(event.id) || ids.has(event.id)) {
      throw new Error(`Event override ${date} has an invalid or duplicate ID.`);
    }
    ids.add(event.id);
    if (typeof event.published !== "boolean") {
      throw new Error(`Event override ${date} must set published true or false.`);
    }
    normalizeEventStatus(event.status);
    if (event.published && normalizeEventStatus(event.status) === "none") {
      throw new Error(`Published event override ${date} cannot have status none.`);
    }
    assertPublicCopy(event.title, `Event override ${date} title`, 120);
    assertPublicCopy(
      event.description,
      `Event override ${date} description`,
      600
    );
    for (const [field, limit] of [
      ["timeLabel", 80],
      ["venue", 160],
      ["address", 200],
      ["city", 100]
    ]) {
      if (event[field]) {
        assertPublicCopy(
          event[field],
          `Event override ${date} ${field}`,
          limit
        );
      }
    }
    if (event.url) {
      normalizeHttpsUrl(event.url, `Event override ${date} URL`);
    }
    if (event.date) {
      assertIsoDate(event.date, `Event override ${date} public date`);
    }
    if (event.locationHint) {
      validateCoordinatePair(
        event.locationHint,
        `Event override ${date} location hint`
      );
    }
    if (event.coordinates) {
      validateCoordinatePair(
        event.coordinates,
        `Event override ${date} coordinates`
      );
    }
  }
}

function createCityHintLookup(overrides) {
  const lookup = new Map();
  for (const event of Object.values(overrides.eventsByTimelineStartDate)) {
    if (event.city && event.locationHint) {
      lookup.set(normalizeWhitespace(event.city).toLowerCase(), event.locationHint);
    }
  }
  return lookup;
}

function findRouteForDates(manifestRoutes, startDate, endDate, explicitRouteId) {
  if (explicitRouteId) {
    const route = manifestRoutes.find((candidate) => candidate.id === explicitRouteId);
    if (!route) {
      throw new Error(`Timeline references unknown route "${explicitRouteId}".`);
    }
    if (startDate < route.startDate || endDate > route.endDate) {
      throw new Error(
        `Timeline dates ${startDate}–${endDate} fall outside route ${route.id}.`
      );
    }
    return route;
  }

  const candidates = manifestRoutes.filter(
    (route) => startDate >= route.startDate && endDate <= route.endDate
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Timeline dates ${startDate}–${endDate} do not map to exactly one route.`
    );
  }
  return candidates[0];
}

function combineTimeLabel(row, headerIndex) {
  const direct = getColumn(
    row,
    headerIndex,
    "eventtimelabel",
    "timelabel",
    "eventtime",
    "time"
  );
  if (normalizeWhitespace(direct)) {
    return direct;
  }
  const start = normalizeWhitespace(
    getColumn(row, headerIndex, "eventstarttime", "starttime")
  );
  const end = normalizeWhitespace(
    getColumn(row, headerIndex, "eventendtime", "endtime")
  );
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start || end;
}

export function buildTimeline({
  csv,
  manifest,
  overrides,
  geometryByRouteId,
  warnings
}) {
  const records = parseCsv(csv);
  if (records.length < 2) {
    throw new Error("Timeline CSV does not contain any data rows.");
  }

  const header = records[0];
  const headerIndex = buildHeaderIndex(header);
  const cityHints = createCityHintLookup(overrides);
  const rows = records
    .slice(1)
    .filter((row) => row.some((value) => normalizeWhitespace(value)));
  const itineraryRows = [];

  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) {
      throw new Error(
        `Timeline record ${index + 2} has ${row.length} columns; expected ${header.length}.`
      );
    }
    const dateValue = normalizeWhitespace(
      getColumn(row, headerIndex, "date", "startdate")
    );
    if (dateValue.toUpperCase() === "TOTALS") {
      continue;
    }
    itineraryRows.push({ row, sourceRecord: index + 2 });
  }

  const timeline = [];
  const timelineIds = new Set();
  const eventIds = new Set();
  let previousStartDate = null;
  let eventNumber = 0;

  for (const [index, source] of itineraryRows.entries()) {
    const { row, sourceRecord } = source;
    const date = parseDateRange(row, headerIndex);
    warnings.push(...date.warnings);
    if (previousStartDate && date.startDate < previousStartDate) {
      throw new Error(
        `Timeline record ${sourceRecord} is out of chronological order.`
      );
    }
    previousStartDate = date.startDate;

    const explicitRouteId = normalizeWhitespace(
      getColumn(row, headerIndex, "routeid")
    );
    const route = findRouteForDates(
      manifest.routes,
      date.startDate,
      date.endDate,
      explicitRouteId
    );
    let from = normalizePlace(
      getColumn(row, headerIndex, "from"),
      `timeline record ${sourceRecord} From`,
      warnings
    );
    let to = normalizePlace(
      getColumn(row, headerIndex, "to"),
      `timeline record ${sourceRecord} To`,
      warnings
    );
    const mileage = parseMileage(
      getColumn(row, headerIndex, "miles", "milesapprox")
    );
    if (!to && mileage.miles === 0) {
      to = from;
      warnings.push("Normalized a zero-mile stop with an empty destination.");
    }
    if (!from || !to) {
      throw new Error(
        `Timeline record ${sourceRecord} must have public From and To labels.`
      );
    }

    const structuredTimelineId = normalizeWhitespace(
      getColumn(row, headerIndex, "id", "timelineid", "legid")
    );
    const timelineId =
      structuredTimelineId ||
      `day-${date.startDate}-${slugify(from)}-${slugify(to)}`;
    if (timelineId !== slugify(timelineId) || timelineIds.has(timelineId)) {
      throw new Error(
        `Timeline record ${sourceRecord} has an invalid or duplicate ID.`
      );
    }
    timelineIds.add(timelineId);

    const legacyStatusValue = getColumn(row, headerIndex, "eventstop");
    const structuredStatusValue = getColumn(row, headerIndex, "eventstatus");
    const structuredEventId = normalizeWhitespace(
      getColumn(row, headerIndex, "eventid")
    );
    const hasStructuredEventSchema = hasColumn(
      headerIndex,
      "eventid",
      "eventstatus",
      "eventtitle",
      "eventdescription",
      "eventcity",
      "eventvenue",
      "eventaddress",
      "eventurl",
      "eventlat",
      "eventlng",
      "eventlon",
      "published",
      "eventpublished"
    );
    const datedOverride = overrides.eventsByTimelineStartDate[date.startDate] ?? {};
    const override =
      hasStructuredEventSchema
        ? structuredEventId && datedOverride.id === structuredEventId
          ? datedOverride
          : {}
        : datedOverride;
    const hasStructuredStatus = hasColumn(headerIndex, "eventstatus");
    const hasPublishedColumn = hasColumn(
      headerIndex,
      "published",
      "eventpublished"
    );
    const structuredPublished = parsePublished(
      getColumn(row, headerIndex, "published", "eventpublished")
    );
    const sourceStatus = normalizeEventStatus(
      hasStructuredStatus ? structuredStatusValue : legacyStatusValue
    );
    const initialStatus = sourceStatus;
    if (
      hasPublishedColumn &&
      structuredPublished === undefined &&
      sourceStatus !== "none"
    ) {
      throw new Error(
        `Timeline record ${sourceRecord} must explicitly publish or hide its event.`
      );
    }
    const isPublished = hasPublishedColumn
      ? structuredPublished ?? false
      : sourceStatus !== "none";

    let event = null;
    let eventStatus = "none";
    if (isPublished) {
      if (initialStatus === "none") {
        throw new Error(
          `Timeline record ${sourceRecord} publishes an event with status none.`
        );
      }

      eventStatus = initialStatus;
      const city =
        resolvePublicCopy({
          row,
          headerIndex,
          keys: ["eventcity", "city"],
          overrideValue: override.city,
          rowLabel: `Timeline record ${sourceRecord} event city`,
          overrideLabel: `Event override ${date.startDate} city`,
          maxLength: 100
        }) ||
        to;
      const eventId =
        structuredEventId ||
        override.id ||
        `event-${date.startDate}-${slugify(city)}`;
      if (eventId !== slugify(eventId) || eventIds.has(eventId)) {
        throw new Error(
          `Timeline record ${sourceRecord} has an invalid or duplicate event ID.`
        );
      }
      eventIds.add(eventId);

      const title =
        resolvePublicCopy({
          row,
          headerIndex,
          keys: ["eventtitle"],
          overrideValue: override.title,
          rowLabel: `Timeline record ${sourceRecord} event title`,
          overrideLabel: `Event override ${date.startDate} title`,
          maxLength: 120
        }) ||
        `${city} community stop`;
      const description =
        resolvePublicCopy({
          row,
          headerIndex,
          keys: ["eventdescription"],
          overrideValue: override.description,
          rowLabel: `Timeline record ${sourceRecord} event description`,
          overrideLabel: `Event override ${date.startDate} description`,
          maxLength: 600
        }) ||
        "Event details will be shared as they are confirmed.";
      const timeLabel =
        (hasColumn(
          headerIndex,
          "eventtimelabel",
          "timelabel",
          "eventtime",
          "time",
          "eventstarttime",
          "starttime",
          "eventendtime",
          "endtime"
        )
          ? assertPublicCopy(
              combineTimeLabel(row, headerIndex),
              `Timeline record ${sourceRecord} event time`,
              80
            )
          : assertPublicCopy(
              override.timeLabel,
              `Event override ${date.startDate} time`,
              80
            )) ||
        null;
      const venue =
        resolvePublicCopy({
          row,
          headerIndex,
          keys: ["eventvenue", "venue"],
          overrideValue: override.venue,
          rowLabel: `Timeline record ${sourceRecord} event venue`,
          overrideLabel: `Event override ${date.startDate} venue`,
          maxLength: 160
        }) ||
        null;
      const address =
        resolvePublicCopy({
          row,
          headerIndex,
          keys: ["eventaddress", "address"],
          overrideValue: override.address,
          rowLabel: `Timeline record ${sourceRecord} event address`,
          overrideLabel: `Event override ${date.startDate} address`,
          maxLength: 200
        }) ||
        null;
      const sheetUrl = normalizeHttpsUrl(
          getColumn(row, headerIndex, "eventurl", "url"),
          `Timeline record ${sourceRecord} event URL`
        );
      const url = hasColumn(headerIndex, "eventurl", "url")
        ? sheetUrl
        : sheetUrl ||
          normalizeHttpsUrl(
            override.url,
            `Event override ${date.startDate} URL`
          );

      const latitude = parseCoordinate(
        getColumn(row, headerIndex, "eventlat", "latitude", "lat"),
        "lat",
        `Timeline record ${sourceRecord} event latitude`
      );
      const longitude = parseCoordinate(
        getColumn(row, headerIndex, "eventlng", "eventlon", "longitude", "lng", "lon"),
        "lng",
        `Timeline record ${sourceRecord} event longitude`
      );
      if ((latitude === null) !== (longitude === null)) {
        throw new Error(
          `Timeline record ${sourceRecord} must provide both event latitude and longitude.`
        );
      }
      const overrideCoordinates = override.coordinates
        ? validateCoordinatePair(
            override.coordinates,
            `Event override ${date.startDate} coordinates`
          )
        : null;

      let coordinates;
      let coordinateSource;
      if (latitude !== null && longitude !== null) {
        coordinates = [round(longitude), round(latitude)];
        coordinateSource = "provided";
      } else if (overrideCoordinates) {
        coordinates = overrideCoordinates.map((coordinate) => round(coordinate));
        coordinateSource = "provided";
      } else {
        const overrideCity = normalizeWhitespace(override.city).toLowerCase();
        const locationHint =
          override.locationHint && overrideCity === city.toLowerCase()
            ? override.locationHint
            : cityHints.get(city.toLowerCase());
        if (!locationHint) {
          throw new Error(
            `Timeline record ${sourceRecord} needs event lat/lng or a curated location hint for "${city}".`
          );
        }
        const routeGeometry = geometryByRouteId.get(route.id);
        coordinates = nearestPointOnLine(locationHint, routeGeometry);
        coordinateSource = "route-approximate";
      }

      eventNumber += 1;
      event = {
        id: eventId,
        number: eventNumber,
        date: override.date
          ? assertIsoDate(
              override.date,
              `Event override ${date.startDate} public date`
            )
          : date.startDate,
        title,
        description,
        timeLabel,
        venue,
        address,
        city,
        coordinates,
        coordinateSource,
        status: eventStatus,
        url
      };
    }

    timeline.push({
      id: timelineId,
      order: index + 1,
      dateLabel: date.dateLabel,
      startDate: date.startDate,
      endDate: date.endDate,
      routeId: route.id,
      from,
      to,
      miles: mileage.miles,
      milesLabel: mileage.milesLabel,
      district:
        assertSafePlainText(
          getColumn(row, headerIndex, "legislativedistrict", "district"),
          `Timeline record ${sourceRecord} district`,
          80
        ) || null,
      eventStatus,
      ...(event ? { event } : {})
    });
  }

  if (timeline.length === 0) {
    throw new Error("Timeline CSV did not produce any public timeline rows.");
  }
  return timeline;
}

function validateOutput(data) {
  if (data.meta?.schemaVersion !== 1) {
    throw new Error("Generated output has an invalid schema version.");
  }
  if (data.routes.length !== 6) {
    throw new Error("Generated output must contain six routes.");
  }
  if (!data.timeline.every((entry, index) => entry.order === index + 1)) {
    throw new Error("Generated timeline order is not contiguous.");
  }

  const routeIds = new Set(data.routes.map((route) => route.id));
  const eventNumbers = [];
  let previousEventDate = null;
  for (const entry of data.timeline) {
    if (!routeIds.has(entry.routeId)) {
      throw new Error(`Generated timeline references unknown route ${entry.routeId}.`);
    }
    if (!["confirmed", "tentative", "none"].includes(entry.eventStatus)) {
      throw new Error(`Generated timeline has invalid event status.`);
    }
    if (entry.event) {
      if (entry.event.status !== entry.eventStatus) {
        throw new Error(`Generated event status does not match its timeline row.`);
      }
      validateCoordinatePair(
        entry.event.coordinates,
        `Generated event ${entry.event.id}`
      );
      const eventDate = assertIsoDate(
        entry.event.date,
        `Generated event ${entry.event.id} date`
      );
      if (
        eventDate < data.meta.startDate ||
        eventDate > data.meta.endDate ||
        (previousEventDate && eventDate < previousEventDate)
      ) {
        throw new Error(`Generated event ${entry.event.id} is outside chronological campaign order.`);
      }
      previousEventDate = eventDate;
      eventNumbers.push(entry.event.number);
    } else if (entry.eventStatus !== "none") {
      throw new Error("Generated non-event row has a public event status.");
    }
  }
  if (!eventNumbers.every((number, index) => number === index + 1)) {
    throw new Error("Generated event numbers are not contiguous.");
  }

  const serialized = JSON.stringify(data);
  if (PUBLIC_COPY_BLOCKLIST.test(serialized)) {
    throw new Error("Generated data contains non-public editorial copy.");
  }
}

async function readJson(relativePath) {
  const absolutePath = path.join(PROJECT_ROOT, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function loadTimelineCsv() {
  const configuredUrl =
    process.env.PUBLIC_TIMELINE_CSV_URL ||
    process.env.GOOGLE_SHEET_CSV_URL ||
    "";
  const requireRemote =
    /^(?:1|true|yes)$/i.test(process.env.REQUIRE_REMOTE_TIMELINE || "");
  const localPath = path.join(PROJECT_ROOT, DEFAULT_TIMELINE_FILE);

  if (!configuredUrl) {
    if (requireRemote) {
      throw new Error(
        "A remote timeline is required, but PUBLIC_TIMELINE_CSV_URL is not configured."
      );
    }
    return {
      csv: await readFile(localPath, "utf8"),
      source: {
        kind: "local",
        label: DEFAULT_TIMELINE_FILE
      },
      warning: null
    };
  }

  const remoteUrl = normalizeHttpsUrl(configuredUrl, "Timeline CSV URL");
  try {
    const response = await fetch(remoteUrl, {
      headers: {
        Accept: "text/csv,text/plain;q=0.9"
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_REMOTE_CSV_BYTES) {
      throw new Error("response exceeds the 2 MB safety limit");
    }
    const csv = await response.text();
    if (Buffer.byteLength(csv, "utf8") > MAX_REMOTE_CSV_BYTES) {
      throw new Error("response exceeds the 2 MB safety limit");
    }
    return {
      csv,
      source: {
        kind: "remote",
        label: new URL(remoteUrl).hostname
      },
      warning: null
    };
  } catch (error) {
    if (requireRemote) {
      throw new Error(
        `Remote timeline fetch failed and a remote source is required: ${error.message}`
      );
    }
    return {
      csv: await readFile(localPath, "utf8"),
      source: {
        kind: "local-fallback",
        label: DEFAULT_TIMELINE_FILE
      },
      warning: `Remote timeline fetch failed (${error.message}); used the checked-in CSV snapshot.`
    };
  }
}

function generatedAt() {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  if (sourceDateEpoch) {
    const milliseconds = Number(sourceDateEpoch) * 1000;
    if (!Number.isFinite(milliseconds)) {
      throw new Error("SOURCE_DATE_EPOCH must be a Unix timestamp.");
    }
    return new Date(milliseconds).toISOString();
  }
  return new Date().toISOString();
}

export async function buildAppData() {
  const [manifest, overrides, timelineSource] = await Promise.all([
    readJson(ROUTE_MANIFEST_FILE),
    readJson(EVENTS_FILE),
    loadTimelineCsv()
  ]);
  validateManifest(manifest);
  validateOverrides(overrides);

  const warnings = [
    "Events without published latitude and longitude are snapped to the route near a curated city center.",
    "Source cumulative-mile totals are excluded because they do not reconcile with the itinerary rows."
  ];
  if (timelineSource.warning) {
    warnings.push(timelineSource.warning);
  }

  const { routes, geometryByRouteId } = await loadRoutes(manifest);
  const timeline = buildTimeline({
    csv: timelineSource.csv,
    manifest,
    overrides,
    geometryByRouteId,
    warnings
  });

  const events = timeline.flatMap((entry) => (entry.event ? [entry.event] : []));
  const listedMiles = timeline.reduce(
    (total, entry) => total + (entry.miles ?? 0),
    0
  );
  const routeDistanceMiles = routes.reduce(
    (total, route) => total + route.distanceMiles,
    0
  );

  const data = {
    meta: {
      schemaVersion: 1,
      title: "2026 Pedal to the Polls",
      year: RIDE_YEAR,
      timezone: "America/Chicago",
      startDate: "2026-09-22",
      endDate: "2026-11-01",
      dateRange: "September 22 – November 1, 2026",
      generatedAt: generatedAt(),
      source: {
        timeline: timelineSource.source,
        timelineSha256: createHash("sha256")
          .update(timelineSource.csv)
          .digest("hex"),
        routeManifest: ROUTE_MANIFEST_FILE
      },
      warnings: unique(warnings)
    },
    stats: {
      routeCount: routes.length,
      timelineEntryCount: timeline.length,
      eventCount: events.length,
      confirmedEventCount: events.filter(
        (event) => event.status === "confirmed"
      ).length,
      tentativeEventCount: events.filter(
        (event) => event.status === "tentative"
      ).length,
      campaignMiles: 1215,
      campaignDays: 35,
      routeDistanceMiles: round(routeDistanceMiles, 1),
      listedMiles: round(listedMiles, 1)
    },
    routes,
    timeline
  };

  validateOutput(data);
  return data;
}

export async function main() {
  const outputFile = process.env.APP_DATA_OUTPUT
    ? path.resolve(PROJECT_ROOT, process.env.APP_DATA_OUTPUT)
    : path.join(PROJECT_ROOT, DEFAULT_OUTPUT_FILE);
  const relativeOutput = path.relative(PROJECT_ROOT, outputFile);
  if (
    relativeOutput.startsWith("..") ||
    path.isAbsolute(relativeOutput) ||
    path.extname(outputFile) !== ".json"
  ) {
    throw new Error("APP_DATA_OUTPUT must be a JSON file inside the project.");
  }

  const data = await buildAppData();
  try {
    const existing = JSON.parse(await readFile(outputFile, "utf8"));
    const withoutGeneratedAt = (value) =>
      JSON.stringify({
        ...value,
        meta: { ...value.meta, generatedAt: "<ignored>" }
      });
    if (withoutGeneratedAt(existing) === withoutGeneratedAt(data)) {
      data.meta.generatedAt = existing.meta.generatedAt;
    }
  } catch {
    // A missing or malformed prior output should be replaced by validated data.
  }
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${relativeOutput}: ${data.routes.length} routes, ${data.timeline.length} timeline entries, ${data.stats.eventCount} events.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`Data sync failed: ${error.message}`);
    process.exitCode = 1;
  });
}
