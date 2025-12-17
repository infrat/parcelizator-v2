/**
 * GeopkgExporter - Generates GeoPackage files for parcel geometry export
 *
 * @description Creates valid GeoPackage (SQLite) files with geometry data.
 * Uses sql.js library for SQLite generation in browser.
 * Geometry is stored in GeoPackage Binary (GPB) format per OGC spec.
 */

// SQL.js WASM URL
const SQL_WASM_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm";

let SQL = null;

/**
 * Initialize SQL.js library
 * @private
 */
async function initSqlJs() {
  if (SQL) return SQL;

  if (
    typeof initSqlJs === "undefined" &&
    typeof window.initSqlJs === "undefined"
  ) {
    throw new Error("sql.js library not loaded");
  }

  SQL = await window.initSqlJs({
    locateFile: () => SQL_WASM_URL,
  });

  return SQL;
}

/**
 * Create GeoPackage Binary (GPB) header
 * @private
 * @param {number} srsId - Spatial Reference System ID
 * @param {Object} envelope - Bounding box {minX, minY, maxX, maxY}
 * @returns {Uint8Array} GPB header bytes
 */
function createGpbHeader(srsId, envelope) {
  // GPB header structure:
  // 2 bytes: magic "GP"
  // 1 byte: version (0)
  // 1 byte: flags (envelope type in bits 1-3)
  // 4 bytes: srs_id (little-endian int32)
  // envelope (if present): 4 doubles (32 bytes for 2D envelope)

  const hasEnvelope = envelope !== null;
  const envelopeType = hasEnvelope ? 1 : 0; // 1 = 2D envelope (minX, maxX, minY, maxY)
  const flags = (envelopeType << 1) | 0x01; // bit 0 = little-endian, bits 1-3 = envelope type

  const headerSize = hasEnvelope ? 8 + 32 : 8;
  const header = new ArrayBuffer(headerSize);
  const view = new DataView(header);

  // Magic number "GP"
  view.setUint8(0, 0x47); // 'G'
  view.setUint8(1, 0x50); // 'P'

  // Version
  view.setUint8(2, 0);

  // Flags
  view.setUint8(3, flags);

  // SRS ID (little-endian)
  view.setInt32(4, srsId, true);

  // Envelope (if present) - order: minX, maxX, minY, maxY
  if (hasEnvelope) {
    view.setFloat64(8, envelope.minX, true);
    view.setFloat64(16, envelope.maxX, true);
    view.setFloat64(24, envelope.minY, true);
    view.setFloat64(32, envelope.maxY, true);
  }

  return new Uint8Array(header);
}

/**
 * Create WKB (Well-Known Binary) for a Point
 * @private
 */
function pointToWkb(lng, lat) {
  // WKB Point: 1 byte order + 4 bytes type + 8 bytes X + 8 bytes Y = 21 bytes
  const buffer = new ArrayBuffer(21);
  const view = new DataView(buffer);

  view.setUint8(0, 1); // Little-endian
  view.setUint32(1, 1, true); // Point type = 1
  view.setFloat64(5, lng, true); // X coordinate
  view.setFloat64(13, lat, true); // Y coordinate

  return new Uint8Array(buffer);
}

/**
 * Create WKB for a Polygon
 * @private
 */
function polygonToWkb(rings) {
  // Calculate total size
  // 1 byte order + 4 bytes type + 4 bytes numRings
  // For each ring: 4 bytes numPoints + (numPoints * 16 bytes for XY)
  let totalSize = 9;
  rings.forEach((ring) => {
    totalSize += 4 + ring.length * 16;
  });

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint8(offset, 1); // Little-endian
  offset += 1;
  view.setUint32(offset, 3, true); // Polygon type = 3
  offset += 4;
  view.setUint32(offset, rings.length, true); // Number of rings
  offset += 4;

  rings.forEach((ring) => {
    view.setUint32(offset, ring.length, true); // Number of points
    offset += 4;

    ring.forEach((coord) => {
      view.setFloat64(offset, coord.lng, true); // X
      offset += 8;
      view.setFloat64(offset, coord.lat, true); // Y
      offset += 8;
    });
  });

  return new Uint8Array(buffer);
}

/**
 * Create GeoPackage Binary geometry for a Point
 * @private
 */
function createPointGpb(lng, lat, srsId = 4326) {
  const envelope = { minX: lng, maxX: lng, minY: lat, maxY: lat };
  const header = createGpbHeader(srsId, envelope);
  const wkb = pointToWkb(lng, lat);

  const gpb = new Uint8Array(header.length + wkb.length);
  gpb.set(header, 0);
  gpb.set(wkb, header.length);

  return gpb;
}

/**
 * Create GeoPackage Binary geometry for a Polygon
 * @private
 */
function createPolygonGpb(rings, srsId = 4326) {
  // Calculate envelope
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  rings.forEach((ring) => {
    ring.forEach((coord) => {
      if (coord.lng < minX) minX = coord.lng;
      if (coord.lng > maxX) maxX = coord.lng;
      if (coord.lat < minY) minY = coord.lat;
      if (coord.lat > maxY) maxY = coord.lat;
    });
  });

  const envelope = { minX, maxX, minY, maxY };
  const header = createGpbHeader(srsId, envelope);
  const wkb = polygonToWkb(rings);

  const gpb = new Uint8Array(header.length + wkb.length);
  gpb.set(header, 0);
  gpb.set(wkb, header.length);

  return gpb;
}

/**
 * Create GeoPackage database with parcels (polygons)
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 * @returns {Promise<Uint8Array>} GeoPackage file as binary data
 */
export async function generatePolygonsGpkg(parcels) {
  const SqlJs = await initSqlJs();
  const db = new SqlJs.Database();

  // Create GeoPackage tables (minimal spec compliance)
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    );
  `);

  db.run(`
    INSERT INTO gpkg_spatial_ref_sys VALUES 
    ('WGS 84', 4326, 'EPSG', 4326, 
     'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
     'WGS 84 geodetic');
  `);

  db.run(`
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change TEXT NOT NULL,
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  db.run(`
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z INTEGER NOT NULL,
      m INTEGER NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  // Create parcels table with BLOB geometry column
  db.run(`
    CREATE TABLE parcels (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      parcel_id TEXT NOT NULL,
      geom BLOB
    );
  `);

  // Calculate bounds
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  // Insert parcels with binary geometry
  parcels.forEach((parcel) => {
    const rings = parcel.geometry.coordinates;
    const gpb = createPolygonGpb(rings);

    db.run("INSERT INTO parcels (parcel_id, geom) VALUES (?, ?)", [
      parcel.id,
      gpb,
    ]);

    // Update bounds
    rings.forEach((ring) => {
      ring.forEach((coord) => {
        if (coord.lng < minX) minX = coord.lng;
        if (coord.lng > maxX) maxX = coord.lng;
        if (coord.lat < minY) minY = coord.lat;
        if (coord.lat > maxY) maxY = coord.lat;
      });
    });
  });

  // Register in gpkg_contents
  const timestamp = new Date().toISOString();
  db.run(`
    INSERT INTO gpkg_contents VALUES 
    ('parcels', 'features', 'parcels', 'Działki ewidencyjne', '${timestamp}', 
     ${minX}, ${minY}, ${maxX}, ${maxY}, 4326);
  `);

  db.run(`
    INSERT INTO gpkg_geometry_columns VALUES 
    ('parcels', 'geom', 'POLYGON', 4326, 0, 0);
  `);

  const data = db.export();
  db.close();

  return data;
}

/**
 * Create GeoPackage database with parcels (points)
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 * @returns {Promise<Uint8Array>} GeoPackage file as binary data
 */
export async function generatePointsGpkg(parcels) {
  const SqlJs = await initSqlJs();
  const db = new SqlJs.Database();

  // Create GeoPackage tables
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    );
  `);

  db.run(`
    INSERT INTO gpkg_spatial_ref_sys VALUES 
    ('WGS 84', 4326, 'EPSG', 4326, 
     'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
     'WGS 84 geodetic');
  `);

  db.run(`
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change TEXT NOT NULL,
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  db.run(`
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z INTEGER NOT NULL,
      m INTEGER NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  // Create points table with BLOB geometry column
  db.run(`
    CREATE TABLE points (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      parcel_id TEXT NOT NULL,
      point_index INTEGER NOT NULL,
      geom BLOB
    );
  `);

  // Calculate bounds
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  // Insert points with binary geometry
  parcels.forEach((parcel) => {
    parcel.vertices.forEach((vertex, index) => {
      const gpb = createPointGpb(vertex.lng, vertex.lat);

      db.run(
        "INSERT INTO points (parcel_id, point_index, geom) VALUES (?, ?, ?)",
        [parcel.id, index + 1, gpb]
      );

      // Update bounds
      if (vertex.lng < minX) minX = vertex.lng;
      if (vertex.lng > maxX) maxX = vertex.lng;
      if (vertex.lat < minY) minY = vertex.lat;
      if (vertex.lat > maxY) maxY = vertex.lat;
    });
  });

  // Register in gpkg_contents
  const timestamp = new Date().toISOString();
  db.run(`
    INSERT INTO gpkg_contents VALUES 
    ('points', 'features', 'points', 'Punkty graniczne działek', '${timestamp}', 
     ${minX}, ${minY}, ${maxX}, ${maxY}, 4326);
  `);

  db.run(`
    INSERT INTO gpkg_geometry_columns VALUES 
    ('points', 'geom', 'POINT', 4326, 0, 0);
  `);

  const data = db.export();
  db.close();

  return data;
}

/**
 * Download GeoPackage file with polygon geometries
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 */
export async function downloadPolygonsGpkg(parcels) {
  const gpkgData = await generatePolygonsGpkg(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGpkgFile(gpkgData, `dzialki_obrysy_${timestamp}.gpkg`);
}

/**
 * Generate GeoPackage with layers based on visibility options
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 * @returns {Promise<Uint8Array>} GeoPackage file as binary data
 */
export async function generateGpkgWithLayers(parcels, options) {
  const { includePolygons = false, includePoints = false } = options;

  const SqlJs = await initSqlJs();
  const db = new SqlJs.Database();

  // Create GeoPackage core tables
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    );
  `);

  db.run(`
    INSERT INTO gpkg_spatial_ref_sys VALUES 
    ('WGS 84', 4326, 'EPSG', 4326, 
     'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
     'WGS 84 geodetic');
  `);

  db.run(`
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change TEXT NOT NULL,
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  db.run(`
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z INTEGER NOT NULL,
      m INTEGER NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  const timestamp = new Date().toISOString();

  // Add polygons layer if requested
  if (includePolygons) {
    db.run(`
      CREATE TABLE polygons (
        fid INTEGER PRIMARY KEY AUTOINCREMENT,
        parcel_id TEXT NOT NULL,
        geom BLOB
      );
    `);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    parcels.forEach((parcel) => {
      const rings = parcel.geometry.coordinates;
      const gpb = createPolygonGpb(rings);

      db.run("INSERT INTO polygons (parcel_id, geom) VALUES (?, ?)", [
        parcel.id,
        gpb,
      ]);

      rings.forEach((ring) => {
        ring.forEach((coord) => {
          if (coord.lng < minX) minX = coord.lng;
          if (coord.lng > maxX) maxX = coord.lng;
          if (coord.lat < minY) minY = coord.lat;
          if (coord.lat > maxY) maxY = coord.lat;
        });
      });
    });

    db.run(`
      INSERT INTO gpkg_contents VALUES 
      ('polygons', 'features', 'polygons', 'Obrysy działek', '${timestamp}', 
       ${minX}, ${minY}, ${maxX}, ${maxY}, 4326);
    `);

    db.run(`
      INSERT INTO gpkg_geometry_columns VALUES 
      ('polygons', 'geom', 'POLYGON', 4326, 0, 0);
    `);
  }

  // Add points layer if requested
  if (includePoints) {
    db.run(`
      CREATE TABLE points (
        fid INTEGER PRIMARY KEY AUTOINCREMENT,
        parcel_id TEXT NOT NULL,
        point_index INTEGER NOT NULL,
        geom BLOB
      );
    `);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    parcels.forEach((parcel) => {
      parcel.vertices.forEach((vertex, index) => {
        const gpb = createPointGpb(vertex.lng, vertex.lat);

        db.run(
          "INSERT INTO points (parcel_id, point_index, geom) VALUES (?, ?, ?)",
          [parcel.id, index + 1, gpb]
        );

        if (vertex.lng < minX) minX = vertex.lng;
        if (vertex.lng > maxX) maxX = vertex.lng;
        if (vertex.lat < minY) minY = vertex.lat;
        if (vertex.lat > maxY) maxY = vertex.lat;
      });
    });

    db.run(`
      INSERT INTO gpkg_contents VALUES 
      ('points', 'features', 'points', 'Punkty graniczne działek', '${timestamp}', 
       ${minX}, ${minY}, ${maxX}, ${maxY}, 4326);
    `);

    db.run(`
      INSERT INTO gpkg_geometry_columns VALUES 
      ('points', 'geom', 'POINT', 4326, 0, 0);
    `);
  }

  const data = db.export();
  db.close();

  return data;
}

/**
 * Download GeoPackage file with layers based on visibility
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 */
export async function downloadGpkgWithLayers(parcels, options) {
  const gpkgData = await generateGpkgWithLayers(parcels, options);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGpkgFile(gpkgData, `dzialki_${timestamp}.gpkg`);
}

/**
 * Download GeoPackage file with point geometries
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 */
export async function downloadPointsGpkg(parcels) {
  const gpkgData = await generatePointsGpkg(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGpkgFile(gpkgData, `dzialki_punkty_${timestamp}.gpkg`);
}

/**
 * Helper function to download GeoPackage content as file
 * @private
 */
function downloadGpkgFile(data, filename) {
  const blob = new Blob([data], {
    type: "application/geopackage+sqlite3",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Clean up object URL
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export default {
  generateGpkgWithLayers,
  downloadGpkgWithLayers,
  generatePolygonsGpkg,
  generatePointsGpkg,
  downloadPolygonsGpkg,
  downloadPointsGpkg,
};
