/**
 * WktParser - Parses Well-Known Text (WKT) geometry format
 *
 * @description Converts WKT POLYGON strings from ULDK API responses
 * to coordinate arrays usable by Leaflet. Single Responsibility Principle.
 */

import { coordinateTransformer } from "./CoordinateTransformer.js";

/**
 * Supported geometry types from WKT
 */
const GeometryType = Object.freeze({
  POLYGON: "POLYGON",
  MULTIPOLYGON: "MULTIPOLYGON",
});

/**
 * Parse WKT string and extract coordinates in WGS84 format
 *
 * @param {string} wktString - WKT geometry string, may include SRID prefix
 * @returns {{type: string, coordinates: Array<Array<{lat: number, lng: number}>>}} Parsed geometry
 * @throws {Error} If WKT format is invalid or unsupported
 *
 * @example
 * const result = parseWkt('SRID=2180;POLYGON((x1 y1, x2 y2, x3 y3))');
 * // Returns: { type: 'POLYGON', coordinates: [[{lat, lng}, ...]] }
 */
export function parseWkt(wktString) {
  if (!wktString || typeof wktString !== "string") {
    throw new Error("Invalid WKT: input must be a non-empty string");
  }

  // Remove SRID prefix if present (e.g., "SRID=2180;")
  const cleanedWkt = removeSridPrefix(wktString);

  // Detect geometry type
  const geometryType = detectGeometryType(cleanedWkt);

  // Parse based on geometry type
  switch (geometryType) {
    case GeometryType.POLYGON:
      return parsePolygon(cleanedWkt);
    case GeometryType.MULTIPOLYGON:
      return parseMultiPolygon(cleanedWkt);
    default:
      throw new Error(`Unsupported geometry type: ${geometryType}`);
  }
}

/**
 * Remove SRID prefix from WKT string
 * @private
 */
function removeSridPrefix(wkt) {
  const sridPattern = /^SRID=\d+;/i;
  return wkt.replace(sridPattern, "").trim();
}

/**
 * Detect geometry type from WKT string
 * @private
 */
function detectGeometryType(wkt) {
  const upperWkt = wkt.toUpperCase();

  if (upperWkt.startsWith("MULTIPOLYGON")) {
    return GeometryType.MULTIPOLYGON;
  }
  if (upperWkt.startsWith("POLYGON")) {
    return GeometryType.POLYGON;
  }

  throw new Error("Unknown or unsupported WKT geometry type");
}

/**
 * Parse POLYGON WKT
 * @private
 */
function parsePolygon(wkt) {
  // Extract content between POLYGON(( and ))
  const match = wkt.match(/POLYGON\s*\(\((.+)\)\)/i);

  if (!match) {
    throw new Error("Invalid POLYGON WKT format");
  }

  const rings = parseRings(match[1]);

  return {
    type: GeometryType.POLYGON,
    coordinates: rings,
  };
}

/**
 * Parse MULTIPOLYGON WKT
 * @private
 */
function parseMultiPolygon(wkt) {
  // Extract content between MULTIPOLYGON((( and )))
  const match = wkt.match(/MULTIPOLYGON\s*\(\(\((.+)\)\)\)/i);

  if (!match) {
    throw new Error("Invalid MULTIPOLYGON WKT format");
  }

  // Split by polygon separator ")),(("
  const polygonStrings = match[1].split(/\)\s*\)\s*,\s*\(\s*\(/);

  const polygons = polygonStrings.map((polyStr) => parseRings(polyStr));

  return {
    type: GeometryType.MULTIPOLYGON,
    coordinates: polygons,
  };
}

/**
 * Parse coordinate rings (outer ring and optional holes)
 * @private
 */
function parseRings(ringContent) {
  // Split by ring separator "),("
  const ringStrings = ringContent.split(/\)\s*,\s*\(/);

  return ringStrings.map((ringStr) => parseCoordinatePairs(ringStr));
}

/**
 * Parse coordinate pairs from string
 * @private
 */
function parseCoordinatePairs(coordinateString) {
  // Clean up parentheses
  const cleaned = coordinateString.replaceAll(/[()]/g, "").trim();

  // Split by comma to get individual coordinate pairs
  const pairs = cleaned.split(",");

  return pairs.map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);

    if (Number.isNaN(x) || Number.isNaN(y)) {
      throw new TypeError(`Invalid coordinate pair: ${pair}`);
    }

    // Transform from EPSG:2180 to WGS84
    return coordinateTransformer.toWGS84(x, y);
  });
}

/**
 * Extract all unique vertices from parsed geometry
 * Useful for displaying boundary points
 *
 * @param {{type: string, coordinates: Array}} geometry - Parsed geometry object
 * @returns {Array<{lat: number, lng: number}>} Array of unique vertices
 */
export function extractVertices(geometry) {
  const vertices = [];
  const seen = new Set();

  const addVertex = (coord) => {
    const key = `${coord.lat.toFixed(8)},${coord.lng.toFixed(8)}`;
    if (!seen.has(key)) {
      seen.add(key);
      vertices.push(coord);
    }
  };

  if (geometry.type === GeometryType.POLYGON) {
    // First ring is outer boundary, skip closing point (same as first)
    const outerRing = geometry.coordinates[0];
    outerRing.slice(0, -1).forEach(addVertex);
  } else if (geometry.type === GeometryType.MULTIPOLYGON) {
    geometry.coordinates.forEach((polygon) => {
      const outerRing = polygon[0];
      outerRing.slice(0, -1).forEach(addVertex);
    });
  }

  return vertices;
}

export default { parseWkt, extractVertices };
