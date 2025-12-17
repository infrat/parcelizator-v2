/**
 * KmlExporter - Generates KML files for parcel geometry export
 *
 * @description Creates valid KML documents with Placemark elements
 * for download. Follows Single Responsibility Principle.
 */

/**
 * Generate KML document with layers based on visibility options
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 * @returns {string} KML document as XML string
 */
export function generateKmlWithLayers(parcels, options) {
  const { includePolygons = false, includePoints = false } = options;
  const timestamp = new Date().toISOString();
  const parcelCount = parcels.length;

  let folders = "";

  // Polygons folder
  if (includePolygons) {
    const polygonPlacemarks = parcels
      .map((parcel) => {
        const coordinates = formatCoordinatesForKml(parcel.geometry);
        return `
      <Placemark>
        <name>${escapeXml(parcel.id)}</name>
        <description>Działka ewidencyjna: ${escapeXml(parcel.id)}</description>
        <styleUrl>#parcelStyle</styleUrl>
        ${generateGeometryKml(parcel.geometry, coordinates)}
      </Placemark>`;
      })
      .join("");

    folders += `
    <Folder>
      <name>Obrysy działek</name>
      <description>Obrysy ${parcelCount} działek</description>${polygonPlacemarks}
    </Folder>`;
  }

  // Points folder
  if (includePoints) {
    const pointPlacemarks = parcels
      .flatMap((parcel) =>
        parcel.vertices.map(
          (point, index) => `
      <Placemark>
        <name>${escapeXml(parcel.id)} - Pkt ${index + 1}</name>
        <description>Działka: ${escapeXml(parcel.id)}, Punkt ${
            index + 1
          }</description>
        <styleUrl>#pointStyle</styleUrl>
        <Point>
          <coordinates>${point.lng},${point.lat},0</coordinates>
        </Point>
      </Placemark>`
        )
      )
      .join("");

    folders += `
    <Folder>
      <name>Punkty graniczne</name>
      <description>Punkty graniczne ${parcelCount} działek</description>${pointPlacemarks}
    </Folder>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Działki (${parcelCount})</name>
    <description>Eksport ${parcelCount} działek - wygenerowano: ${timestamp}</description>
    <Style id="parcelStyle">
      <LineStyle>
        <color>ff2828c6</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>4d2828c6</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="pointStyle">
      <IconStyle>
        <color>ff0065e6</color>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.7</scale>
      </LabelStyle>
    </Style>${folders}
  </Document>
</kml>`;
}

/**
 * Download KML file with layers based on visibility
 *
 * @param {Array<{id: string, geometry: Object, vertices: Array}>} parcels - Array of parcel objects
 * @param {Object} options - Export options
 * @param {boolean} options.includePolygons - Whether to include polygon layer
 * @param {boolean} options.includePoints - Whether to include points layer
 */
export function downloadKmlWithLayers(parcels, options) {
  const kmlContent = generateKmlWithLayers(parcels, options);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadKmlFile(kmlContent, `dzialki_${timestamp}.kml`);
}

/**
 * Generate KML document with multiple parcels (polygons)
 * @deprecated Use generateKmlWithLayers instead
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 * @returns {string} KML document as XML string
 */
export function generatePolygonsKml(parcels) {
  const timestamp = new Date().toISOString();
  const parcelCount = parcels.length;

  const placemarks = parcels
    .map((parcel) => {
      const coordinates = formatCoordinatesForKml(parcel.geometry);
      return `
    <Placemark>
      <name>${escapeXml(parcel.id)}</name>
      <description>Działka ewidencyjna: ${escapeXml(parcel.id)}</description>
      <styleUrl>#parcelStyle</styleUrl>
      ${generateGeometryKml(parcel.geometry, coordinates)}
    </Placemark>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Działki (${parcelCount})</name>
    <description>Eksport ${parcelCount} działek - wygenerowano: ${timestamp}</description>
    <Style id="parcelStyle">
      <LineStyle>
        <color>ff2828c6</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>4d2828c6</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>${placemarks}
  </Document>
</kml>`;
}

/**
 * Generate KML document with multiple parcels (points)
 * @deprecated Use generateKmlWithLayers instead
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 * @returns {string} KML document as XML string
 */
export function generatePointsKml(parcels) {
  const timestamp = new Date().toISOString();
  const parcelCount = parcels.length;

  const placemarks = parcels
    .flatMap((parcel) =>
      parcel.vertices.map(
        (point, index) => `
    <Placemark>
      <name>${escapeXml(parcel.id)} - Pkt ${index + 1}</name>
      <description>Działka: ${escapeXml(parcel.id)}, Punkt ${
          index + 1
        }</description>
      <styleUrl>#pointStyle</styleUrl>
      <Point>
        <coordinates>${point.lng},${point.lat},0</coordinates>
      </Point>
    </Placemark>`
      )
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Punkty graniczne (${parcelCount} działek)</name>
    <description>Punkty graniczne ${parcelCount} działek - wygenerowano: ${timestamp}</description>
    <Style id="pointStyle">
      <IconStyle>
        <color>ff0065e6</color>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.7</scale>
      </LabelStyle>
    </Style>${placemarks}
  </Document>
</kml>`;
}

/**
 * Format coordinates array for KML format (lon,lat,0)
 * @private
 */
function formatCoordinatesForKml(geometry) {
  const formatRing = (ring) => {
    return ring.map((coord) => `${coord.lng},${coord.lat},0`).join(" ");
  };

  if (geometry.type === "POLYGON") {
    return geometry.coordinates.map(formatRing);
  } else if (geometry.type === "MULTIPOLYGON") {
    return geometry.coordinates.map((polygon) => polygon.map(formatRing));
  }

  return [];
}

/**
 * Generate KML geometry element based on type
 * @private
 */
function generateGeometryKml(geometry, formattedCoords) {
  if (geometry.type === "POLYGON") {
    return generatePolygonKml(formattedCoords);
  } else if (geometry.type === "MULTIPOLYGON") {
    return generateMultiPolygonKml(formattedCoords);
  }
  return "";
}

/**
 * Generate KML Polygon element
 * @private
 */
function generatePolygonKml(rings) {
  const [outerRing, ...innerRings] = rings;

  let kml = `<Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${outerRing}</coordinates>
          </LinearRing>
        </outerBoundaryIs>`;

  // Add inner rings (holes) if present
  innerRings.forEach((ring) => {
    kml += `
        <innerBoundaryIs>
          <LinearRing>
            <coordinates>${ring}</coordinates>
          </LinearRing>
        </innerBoundaryIs>`;
  });

  kml += `
      </Polygon>`;

  return kml;
}

/**
 * Generate KML MultiGeometry for MultiPolygon
 * @private
 */
function generateMultiPolygonKml(polygons) {
  let kml = "<MultiGeometry>";

  polygons.forEach((polygon) => {
    kml += generatePolygonKml(polygon);
  });

  kml += "</MultiGeometry>";

  return kml;
}

/**
 * Escape XML special characters
 * @private
 */
function escapeXml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Download KML file with polygon geometries
 *
 * @param {Array<{id: string, geometry: Object}>} parcels - Array of parcel objects
 */
export function downloadPolygonsKml(parcels) {
  const kmlContent = generatePolygonsKml(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadKmlFile(kmlContent, `dzialki_obrysy_${timestamp}.kml`);
}

/**
 * Download KML file with point geometries
 *
 * @param {Array<{id: string, vertices: Array}>} parcels - Array of parcel objects with vertices
 */
export function downloadPointsKml(parcels) {
  const kmlContent = generatePointsKml(parcels);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadKmlFile(kmlContent, `dzialki_punkty_${timestamp}.kml`);
}

/**
 * Helper function to download KML content as file
 * @private
 */
function downloadKmlFile(kmlContent, filename) {
  const blob = new Blob([kmlContent], {
    type: "application/vnd.google-earth.kml+xml",
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
  generateKmlWithLayers,
  downloadKmlWithLayers,
  generatePolygonsKml,
  generatePointsKml,
  downloadPolygonsKml,
  downloadPointsKml,
};
