/**
 * MapService - Leaflet map management
 *
 * @description Handles all map interactions including layer management,
 * polygon/point rendering, and map controls. Single Responsibility Principle.
 */

import { CONFIG } from "../config.js";

class MapService {
  _map = null;
  _polygonLayer = null;
  _pointsLayer = null;
  _markerLayer = null;
  _wmsLayer = null;
  _onMapClickCallback = null;

  /**
   * Initialize Leaflet map
   *
   * @param {string} containerId - DOM element ID for map container
   * @returns {MapService} this for chaining
   */
  initialize(containerId) {
    if (this._map) {
      console.warn("Map already initialized");
      return this;
    }

    if (typeof L === "undefined") {
      throw new TypeError("Leaflet library not loaded");
    }

    this._map = L.map(containerId, {
      maxZoom: CONFIG.MAP.MAX_ZOOM,
    }).setView(CONFIG.MAP.CENTER, CONFIG.MAP.ZOOM);

    L.tileLayer(CONFIG.MAP.TILE_URL, {
      attribution: CONFIG.MAP.TILE_ATTRIBUTION,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      maxNativeZoom: CONFIG.MAP.MAX_NATIVE_ZOOM, // Scale tiles beyond native zoom
    }).addTo(this._map);

    // Initialize feature groups (featureGroup supports getBounds, layerGroup doesn't)
    this._polygonLayer = L.featureGroup().addTo(this._map);
    this._pointsLayer = L.featureGroup().addTo(this._map);
    this._markerLayer = L.featureGroup().addTo(this._map);

    // Initialize WMS cadastral layer (GUGiK KIEG)
    this._initWmsLayer();

    // Set up click handler
    this._map.on("click", (e) => {
      if (this._onMapClickCallback) {
        this._onMapClickCallback(e.latlng);
      }
    });

    return this;
  }

  /**
   * Initialize WMS cadastral layer with zoom-based visibility
   * @private
   */
  _initWmsLayer() {
    // Create WMS layer for cadastral data
    // Using EPSG:3857 (Web Mercator) which is Leaflet's default and supported by KIEG
    // minZoom/maxZoom control when tiles are requested
    this._wmsLayer = L.tileLayer.wms(CONFIG.WMS.CADASTRAL_URL, {
      layers: CONFIG.WMS.CADASTRAL_LAYERS,
      format: "image/png",
      transparent: true,
      version: "1.1.1", // Use 1.1.1 for better compatibility (uses SRS instead of CRS)
      attribution: CONFIG.WMS.ATTRIBUTION,
      minZoom: CONFIG.WMS.MIN_ZOOM,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      tileSize: CONFIG.WMS.TILE_SIZE,
    });

    // Add layer immediately - Leaflet handles zoom visibility via minZoom/maxZoom
    this._wmsLayer.addTo(this._map);
  }

  /**
   * Register callback for map click events
   *
   * @param {Function} callback - Function to call with {lat, lng} on click
   */
  onMapClick(callback) {
    this._onMapClickCallback = callback;
  }

  /**
   * Draw polygon on map from coordinates
   *
   * @param {Array<Array<{lat: number, lng: number}>>} rings - Array of coordinate rings
   * @param {Object} options - Optional styling options
   */
  drawPolygon(rings, options = {}) {
    this.clearPolygons();

    const defaultOptions = {
      color: CONFIG.UI.POLYGON_COLOR,
      fillOpacity: CONFIG.UI.POLYGON_FILL_OPACITY,
      weight: CONFIG.UI.POLYGON_WEIGHT,
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // Convert to Leaflet format [lat, lng]
    const leafletRings = rings.map((ring) =>
      ring.map((coord) => [coord.lat, coord.lng])
    );

    const polygon = L.polygon(leafletRings, mergedOptions);
    this._polygonLayer.addLayer(polygon);

    return polygon;
  }

  /**
   * Draw polygon with specific color (without clearing existing polygons)
   *
   * @param {Array<Array<{lat: number, lng: number}>>} rings - Array of coordinate rings
   * @param {string} color - Polygon color
   */
  drawPolygonWithColor(rings, color) {
    const options = {
      color: color,
      fillColor: color,
      fillOpacity: CONFIG.UI.POLYGON_FILL_OPACITY,
      weight: CONFIG.UI.POLYGON_WEIGHT,
    };

    // Convert to Leaflet format [lat, lng]
    const leafletRings = rings.map((ring) =>
      ring.map((coord) => [coord.lat, coord.lng])
    );

    const polygon = L.polygon(leafletRings, options);
    this._polygonLayer.addLayer(polygon);

    return polygon;
  }

  /**
   * Draw polygon with custom style options (without clearing existing polygons)
   *
   * @param {Array<Array<{lat: number, lng: number}>>} rings - Array of coordinate rings
   * @param {Object} styleOptions - Leaflet polygon style options
   */
  drawPolygonWithStyle(rings, styleOptions) {
    // Convert to Leaflet format [lat, lng]
    const leafletRings = rings.map((ring) =>
      ring.map((coord) => [coord.lat, coord.lng])
    );

    const polygon = L.polygon(leafletRings, styleOptions);
    this._polygonLayer.addLayer(polygon);

    return polygon;
  }

  /**
   * Draw points (vertices) on map
   *
   * @param {Array<{lat: number, lng: number}>} points - Array of coordinates
   * @param {Object} options - Optional styling options
   */
  drawPoints(points, options = {}) {
    this.clearPoints();

    const defaultOptions = {
      color: CONFIG.UI.POINT_COLOR,
      fillColor: CONFIG.UI.POINT_COLOR,
      fillOpacity: CONFIG.UI.POINT_FILL_OPACITY,
      radius: CONFIG.UI.POINT_RADIUS,
      weight: 2,
    };

    const mergedOptions = { ...defaultOptions, ...options };

    points.forEach((point, index) => {
      const marker = L.circleMarker([point.lat, point.lng], mergedOptions);

      marker.bindTooltip(
        `Punkt ${index + 1}<br>Lat: ${point.lat.toFixed(
          6
        )}<br>Lng: ${point.lng.toFixed(6)}`,
        {
          permanent: false,
          direction: "top",
        }
      );

      this._pointsLayer.addLayer(marker);
    });
  }

  /**
   * Draw points with specific color (without clearing existing points)
   *
   * @param {Array<{lat: number, lng: number}>} points - Array of coordinates
   * @param {string} color - Point color
   */
  drawPointsWithColor(points, color) {
    const options = {
      color: color,
      fillColor: color,
      fillOpacity: CONFIG.UI.POINT_FILL_OPACITY,
      radius: CONFIG.UI.POINT_RADIUS,
      weight: 2,
    };

    points.forEach((point, index) => {
      const marker = L.circleMarker([point.lat, point.lng], options);

      marker.bindTooltip(
        `Punkt ${index + 1}<br>Lat: ${point.lat.toFixed(
          6
        )}<br>Lng: ${point.lng.toFixed(6)}`,
        {
          permanent: false,
          direction: "top",
        }
      );

      this._pointsLayer.addLayer(marker);
    });
  }

  /**
   * Add a marker at specified location
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} popupText - Optional popup text
   */
  addMarker(lat, lng, popupText = null) {
    this.clearMarkers();

    const marker = L.marker([lat, lng]);

    if (popupText) {
      marker.bindPopup(popupText);
    }

    this._markerLayer.addLayer(marker);
    return marker;
  }

  /**
   * Clear polygon layer
   */
  clearPolygons() {
    if (this._polygonLayer) {
      this._polygonLayer.clearLayers();
    }
  }

  /**
   * Clear points layer
   */
  clearPoints() {
    if (this._pointsLayer) {
      this._pointsLayer.clearLayers();
    }
  }

  /**
   * Clear marker layer
   */
  clearMarkers() {
    if (this._markerLayer) {
      this._markerLayer.clearLayers();
    }
  }

  /**
   * Clear all layers
   */
  clearAll() {
    this.clearPolygons();
    this.clearPoints();
    this.clearMarkers();
  }

  /**
   * Fit map bounds to show all content in polygon layer
   */
  fitToPolygons() {
    if (this._polygonLayer && this._polygonLayer.getLayers().length > 0) {
      const bounds = this._polygonLayer.getBounds();
      this._map.fitBounds(bounds, {
        padding: CONFIG.UI.FIT_BOUNDS_PADDING,
      });
    }
  }

  /**
   * Fit map to specific bounds
   *
   * @param {Array<{lat: number, lng: number}>} coordinates - Array of coordinates
   */
  fitToCoordinates(coordinates) {
    if (coordinates && coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates.map((c) => [c.lat, c.lng]));
      this._map.fitBounds(bounds, {
        padding: CONFIG.UI.FIT_BOUNDS_PADDING,
      });
    }
  }

  /**
   * Pan and zoom to specific location
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} zoom - Zoom level
   */
  flyTo(lat, lng, zoom = 17) {
    this._map.flyTo([lat, lng], zoom);
  }

  /**
   * Get current map bounds
   *
   * @returns {L.LatLngBounds} Current map bounds
   */
  getBounds() {
    return this._map.getBounds();
  }

  /**
   * Check if polygon layer has content
   *
   * @returns {boolean} True if polygons are drawn
   */
  hasPolygons() {
    return this._polygonLayer && this._polygonLayer.getLayers().length > 0;
  }

  /**
   * Check if points layer has content
   *
   * @returns {boolean} True if points are drawn
   */
  hasPoints() {
    return this._pointsLayer && this._pointsLayer.getLayers().length > 0;
  }

  /**
   * Toggle polygon layer visibility
   *
   * @param {boolean} visible - Whether to show polygons
   */
  setPolygonsVisible(visible) {
    if (visible) {
      this._map.addLayer(this._polygonLayer);
    } else {
      this._map.removeLayer(this._polygonLayer);
    }
  }

  /**
   * Toggle points layer visibility
   *
   * @param {boolean} visible - Whether to show points
   */
  setPointsVisible(visible) {
    if (visible) {
      this._map.addLayer(this._pointsLayer);
    } else {
      this._map.removeLayer(this._pointsLayer);
    }
  }
}

// Export singleton instance
export const mapService = new MapService();
export default mapService;
