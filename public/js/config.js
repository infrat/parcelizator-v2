/**
 * Application configuration - API endpoints and constants
 *
 * @description Centralizes all configuration to allow easy modifications
 * without touching business logic (Open/Closed Principle)
 */

export const CONFIG = {
  // ULDK API (GUGiK) - Polish Cadastral Parcel Service
  ULDK: {
    BASE_URL: "https://uldk.gugik.gov.pl/",
    ENDPOINTS: {
      GET_BY_ID: "GetParcelById",
      GET_BY_XY: "GetParcelByXY",
    },
    RESULT_FIELDS: "geom_wkt,id",
    SRID_WGS84: "4326",
    SUCCESS_STATUS: "0",
  },

  // Nominatim (OpenStreetMap) - Geocoding Service
  NOMINATIM: {
    BASE_URL: "https://nominatim.openstreetmap.org/search",
    COUNTRY_CODE: "pl",
    FORMAT: "json",
    MAX_RESULTS: 5,
    DEBOUNCE_MS: 300,
  },

  // Coordinate Systems
  PROJECTIONS: {
    WGS84: "EPSG:4326",
    PUWG_1992: "EPSG:2180",
    // Proj4 definition for Polish coordinate system
    PUWG_1992_DEF:
      "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
  },

  // Map defaults
  MAP: {
    CENTER: [52.0, 19.0], // Center of Poland
    ZOOM: 6,
    TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    TILE_ATTRIBUTION:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    MAX_ZOOM: 22,
    MAX_NATIVE_ZOOM: 19, // OSM tiles only go up to 19, Leaflet will scale beyond
  },

  // WMS - Cadastral map overlay (GUGiK KIEG)
  WMS: {
    CADASTRAL_URL:
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
    CADASTRAL_LAYERS: "dzialki,numery_dzialek,budynki",
    MIN_ZOOM: 17, // Show WMS only at zoom 17 and above
    ATTRIBUTION: '&copy; <a href="https://www.geoportal.gov.pl">GUGiK</a>',
    TILE_SIZE: 1024, // Larger tiles for better quality (default is 256)
  },

  // UI constants
  UI: {
    POLYGON_COLOR: "#667eea",
    POLYGON_FILL_OPACITY: 0.3,
    POLYGON_WEIGHT: 3,
    POINT_COLOR: "#e65100",
    POINT_RADIUS: 6,
    POINT_FILL_OPACITY: 0.9,
    FIT_BOUNDS_PADDING: [50, 50],
  },

  // Google Analytics
  ANALYTICS: {
    // Placeholder replaced during deploy by GitHub Actions
    GA_MEASUREMENT_ID: "GA_MEASUREMENT_ID_PLACEHOLDER",
    // Debug mode - logs events to console instead of sending to GA
    DEBUG: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1",
    // LocalStorage key for consent
    CONSENT_KEY: "parcelizator_analytics_consent",
    // Event names
    EVENTS: {
      PARCEL_ADD: "parcel_add",
      PARCEL_ADD_ERROR: "parcel_add_error",
      QUEUE_PROCESS: "queue_process",
      FILE_DOWNLOAD: "file_download",
      QUEUE_MODE_TOGGLE: "queue_mode_toggle",
    },
  },

  // Regex patterns for search type detection
  PATTERNS: {
    // Matches: "50.1234, 19.5678" or "50.1234 19.5678" or "50,1234; 19,5678"
    COORDINATES: /^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/,
    // Matches Polish parcel ID: "141201_1.0001.6509" or "141201_1.0001.6509/2"
    PARCEL_ID: /^\d{6}_\d\.\d{4}\.\d+([/]\d+)?$/,
  },
};

// Search type enum
export const SearchType = Object.freeze({
  COORDINATES: "coordinates",
  PARCEL_ID: "parcel",
  ADDRESS: "address",
});
