/**
 * GeojsonExporter - Generates GeoJSON files for parcel geometry export
 *
 * @description Creates valid GeoJSON documents with Feature/FeatureCollection
 * for download. Follows Single Responsibility Principle.
 */

/**
 * Generate GeoJSON FeatureCollection with layers based on visibility options
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 * @returns {string} GeoJSON document as string
 */
export function generateGeojsonWithLayers(parcels, options) {
  const { includePolygons = false, includePoints = false } = options;

  const features = [];

  // Add polygon features
  if (includePolygons) {
    parcels.forEach((parcel) => {
      features.push({
        type: "Feature",
        properties: {
          parcel_id: parcel.id,
          layer: "polygons",
        },
        geometry: geometryToGeojson(parcel.geometry),
      });
    });
  }

  // Add point features
  if (includePoints) {
    parcels.forEach((parcel) => {
      parcel.vertices.forEach((vertex, index) => {
        features.push({
          type: "Feature",
          properties: {
            parcel_id: parcel.id,
            point_index: index + 1,
            layer: "points",
          },
          geometry: {
            type: "Point",
            coordinates: [vertex.lng, vertex.lat],
          },
        });
      });
    });
  }

  const featureCollection = {
    type: "FeatureCollection",
    features,
  };

  return JSON.stringify(featureCollection, null, 2);
}

/**
 * Download GeoJSON file with layers based on visibility
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 */
export function downloadGeojsonWithLayers(parcels, options) {
  const geojsonContent = generateGeojsonWithLayers(parcels, options);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGeojsonFile(geojsonContent, `dzialki_${timestamp}.geojson`);
}

/**
 * Generate GeoJSON FeatureCollection with multiple parcels (polygons)
 * @deprecated Use generateGeojsonWithLayers instead
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 * @returns {string} GeoJSON document as string
 */
export function generatePolygonsGeojson(parcels) {
  const features = parcels.map((parcel) => ({
    type: "Feature",
    properties: {
      parcel_id: parcel.id,
    },
    geometry: geometryToGeojson(parcel.geometry),
  }));

  const featureCollection = {
    type: "FeatureCollection",
    features,
  };

  return JSON.stringify(featureCollection, null, 2);
}

/**
 * Generate GeoJSON FeatureCollection with multiple parcels (points)
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 * @returns {string} GeoJSON document as string
 */
export function generatePointsGeojson(parcels) {
  const features = parcels.flatMap((parcel) =>
    parcel.vertices.map((vertex, index) => ({
      type: "Feature",
      properties: {
        parcel_id: parcel.id,
        point_index: index + 1,
      },
      geometry: {
        type: "Point",
        coordinates: [vertex.lng, vertex.lat],
      },
    }))
  );

  const featureCollection = {
    type: "FeatureCollection",
    features,
  };

  return JSON.stringify(featureCollection, null, 2);
}

/**
 * Convert internal geometry to GeoJSON geometry
 * @private
 */
function geometryToGeojson(geometry) {
  if (geometry.type === "POLYGON") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        ring.map((coord) => [coord.lng, coord.lat])
      ),
    };
  } else if (geometry.type === "MULTIPOLYGON") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map((coord) => [coord.lng, coord.lat]))
      ),
    };
  }
  return null;
}

/**
 * Download GeoJSON file with polygon geometries
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 */
export function downloadPolygonsGeojson(parcels) {
  const geojsonContent = generatePolygonsGeojson(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGeojsonFile(geojsonContent, `dzialki_obrysy_${timestamp}.geojson`);
}

/**
 * Download GeoJSON file with point geometries
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 */
export function downloadPointsGeojson(parcels) {
  const geojsonContent = generatePointsGeojson(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadGeojsonFile(geojsonContent, `dzialki_punkty_${timestamp}.geojson`);
}

/**
 * Helper function to download GeoJSON content as file
 * @private
 */
function downloadGeojsonFile(content, filename) {
  const blob = new Blob([content], {
    type: "application/geo+json",
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
  generateGeojsonWithLayers,
  downloadGeojsonWithLayers,
  generatePolygonsGeojson,
  generatePointsGeojson,
  downloadPolygonsGeojson,
  downloadPointsGeojson,
};
