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
  _queueMarkersLayer = null;
  _queueMarkers = {}; // Map of id -> marker
  _wmsLayer = null;
  _wmsUtilitiesLayer = null;
  _onMapClickCallback = null;
  _locationMarker = null;
  _locationCircle = null;
  _baseLayer = null;
  _baseLayers = {};

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

    // Initialize base layers
    this._initBaseLayers();

    // Initialize feature groups (featureGroup supports getBounds, layerGroup doesn't)
    this._polygonLayer = L.featureGroup().addTo(this._map);
    this._pointsLayer = L.featureGroup().addTo(this._map);
    this._markerLayer = L.featureGroup().addTo(this._map);
    this._queueMarkersLayer = L.featureGroup().addTo(this._map);

    // Initialize WMS cadastral layer (GUGiK KIEG)
    this._initWmsLayer();

    // Add geolocation control button
    this._initGeolocationControl();

    // Set up click handler
    this._map.on("click", (e) => {
      if (this._onMapClickCallback) {
        this._onMapClickCallback(e.latlng);
      }
    });

    return this;
  }

  /**
   * Initialize base map layers and layer control
   * @private
   */
  _initBaseLayers() {
    const basemaps = CONFIG.BASEMAPS;

    // Create OSM layer
    this._baseLayers.OSM = L.tileLayer(basemaps.OSM.url, {
      attribution: basemaps.OSM.attribution,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      maxNativeZoom: basemaps.OSM.maxNativeZoom,
    });

    // Create Google Satellite layer
    this._baseLayers.GOOGLE_SATELLITE = L.tileLayer(
      basemaps.GOOGLE_SATELLITE.url,
      {
        attribution: basemaps.GOOGLE_SATELLITE.attribution,
        maxZoom: CONFIG.MAP.MAX_ZOOM,
        maxNativeZoom: basemaps.GOOGLE_SATELLITE.maxNativeZoom,
      }
    );

    // Create Ortofotomapa layer (WMTS with EPSG:3857)
    this._baseLayers.ORTO = L.tileLayer(basemaps.ORTO.url, {
      attribution: basemaps.ORTO.attribution,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      maxNativeZoom: basemaps.ORTO.maxNativeZoom,
    });

    // Set default layer (OSM)
    this._baseLayer = this._baseLayers.OSM;
    this._baseLayer.addTo(this._map);

    // Add layer switcher control
    this._initLayerSwitcher();
  }

  /**
   * Initialize custom layer switcher control
   * @private
   */
  _initLayerSwitcher() {
    const self = this;

    const LayerSwitcher = L.Control.extend({
      options: {
        position: "topright",
      },

      onAdd: function () {
        const container = L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-control leaflet-control-layers-switcher"
        );

        const button = L.DomUtil.create(
          "a",
          "leaflet-control-layers-toggle",
          container
        );
        button.href = "#";
        button.title = "Zmień mapę bazową";
        button.setAttribute("role", "button");
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        `;

        const dropdown = L.DomUtil.create("div", "layers-dropdown", container);
        dropdown.style.display = "none";

        const basemaps = CONFIG.BASEMAPS;
        const layers = [
          { key: "OSM", name: basemaps.OSM.name },
          { key: "GOOGLE_SATELLITE", name: basemaps.GOOGLE_SATELLITE.name },
          { key: "ORTO", name: basemaps.ORTO.name },
        ];

        layers.forEach((layer) => {
          const item = L.DomUtil.create("div", "layer-item", dropdown);
          item.textContent = layer.name;
          item.dataset.layer = layer.key;
          if (layer.key === "OSM") {
            item.classList.add("active");
          }

          item.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            self._switchBaseLayer(layer.key);
            dropdown
              .querySelectorAll(".layer-item")
              .forEach((el) => el.classList.remove("active"));
            item.classList.add("active");
            dropdown.style.display = "none";
          });
        });

        // Prevent map interactions when clicking on control
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        // Also prevent double-click zoom
        container.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        // Toggle dropdown on button click
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.style.display =
            dropdown.style.display === "none" ? "block" : "none";
        });

        // Close dropdown when clicking elsewhere on the document
        document.addEventListener("click", (e) => {
          if (!container.contains(e.target)) {
            dropdown.style.display = "none";
          }
        });

        return container;
      },
    });

    new LayerSwitcher().addTo(this._map);
  }

  /**
   * Switch to a different base layer
   * @param {string} layerKey - Key from CONFIG.BASEMAPS (OSM, GOOGLE_SATELLITE, ORTO)
   */
  _switchBaseLayer(layerKey) {
    if (!this._baseLayers[layerKey]) {
      console.warn(`Unknown base layer: ${layerKey}`);
      return;
    }

    // Save current view position and zoom
    const currentCenter = this._map.getCenter();
    const currentZoom = this._map.getZoom();

    // Remove current base layer
    if (this._baseLayer) {
      this._map.removeLayer(this._baseLayer);
    }

    // Add new base layer (at the bottom)
    this._baseLayer = this._baseLayers[layerKey];
    this._baseLayer.addTo(this._map);
    this._baseLayer.bringToBack();

    // Restore view position and zoom (use setView with no animation to avoid glitches)
    this._map.setView(currentCenter, currentZoom, { animate: false });
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

    // Create WMS layer for utilities (KUIT - Krajowa Integracja Uzbrojenia Terenu)
    // Layer is NOT added by default - controlled via checkbox
    this._wmsUtilitiesLayer = L.tileLayer.wms(CONFIG.WMS_UTILITIES.URL, {
      layers: CONFIG.WMS_UTILITIES.LAYERS,
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      attribution: CONFIG.WMS_UTILITIES.ATTRIBUTION,
      minZoom: CONFIG.WMS_UTILITIES.MIN_ZOOM,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      tileSize: CONFIG.WMS.TILE_SIZE, // Use same tile size as cadastral layer
    });
  }

  /**
   * Toggle utilities WMS layer visibility
   * @param {boolean} visible - Whether the layer should be visible
   */
  toggleUtilitiesLayer(visible) {
    if (!this._wmsUtilitiesLayer || !this._map) {
      return;
    }

    if (visible) {
      this._wmsUtilitiesLayer.addTo(this._map);
    } else {
      this._map.removeLayer(this._wmsUtilitiesLayer);
    }
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
   * Add a queue marker (temporary pin for coordinate queue)
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string|number} id - Unique identifier for this marker
   * @returns {string|number} The marker id
   */
  addQueueMarker(lat, lng, id) {
    if (!this._queueMarkersLayer) return id;

    const marker = L.marker([lat, lng], {
      title: `Punkt ${id}`,
    }).addTo(this._queueMarkersLayer);

    this._queueMarkers[id] = marker;
    return id;
  }

  /**
   * Remove a specific queue marker by id
   * @param {string|number} id - The marker id
   */
  removeQueueMarker(id) {
    const marker = this._queueMarkers[id];
    if (marker && this._queueMarkersLayer) {
      this._queueMarkersLayer.removeLayer(marker);
      delete this._queueMarkers[id];
    }
  }

  /**
   * Clear all queue markers
   */
  clearQueueMarkers() {
    if (this._queueMarkersLayer) {
      this._queueMarkersLayer.clearLayers();
      this._queueMarkers = {};
    }
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
   * Pan and zoom to specific location (animated)
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} zoom - Zoom level
   */
  flyTo(lat, lng, zoom = 17) {
    this._map.flyTo([lat, lng], zoom);
  }

  /**
   * Set view to specific location (instant, no animation)
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} zoom - Zoom level
   */
  setView(lat, lng, zoom = 18) {
    this._map.setView([lat, lng], zoom);
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

  /**
   * Initialize geolocation control button
   * @private
   */
  _initGeolocationControl() {
    const GeolocationControl = L.Control.extend({
      options: {
        position: "topright",
      },

      onAdd: () => {
        const container = L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-control leaflet-control-geolocation"
        );
        const button = L.DomUtil.create(
          "a",
          "leaflet-control-geolocation-button",
          container
        );

        button.href = "#";
        button.title = "Moja lokalizacja";
        button.setAttribute("role", "button");
        button.setAttribute("aria-label", "Moja lokalizacja");
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2m0 16v2m10-10h-2M4 12H2"></path>
          </svg>
        `;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, "click", (e) => {
          L.DomEvent.preventDefault(e);
          this._locateUser(button);
        });

        return container;
      },
    });

    new GeolocationControl().addTo(this._map);
  }

  /**
   * Locate user using browser geolocation
   * @private
   */
  _locateUser(button) {
    // Toggle off if already showing location
    if (this._locationMarker) {
      this._hideUserLocation();
      button.classList.remove("active");
      return;
    }

    if (!navigator.geolocation) {
      alert("Twoja przeglądarka nie obsługuje geolokalizacji.");
      return;
    }

    // Add loading state
    button.classList.add("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        button.classList.remove("loading");
        button.classList.add("active");
        const { latitude, longitude, accuracy } = position.coords;
        this._showUserLocation(latitude, longitude, accuracy);
      },
      (error) => {
        button.classList.remove("loading");
        let message = "Nie udało się pobrać lokalizacji.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "Odmówiono dostępu do lokalizacji.";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Lokalizacja niedostępna.";
            break;
          case error.TIMEOUT:
            message = "Przekroczono czas oczekiwania na lokalizację.";
            break;
        }
        alert(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  /**
   * Hide user location marker and circle
   * @private
   */
  _hideUserLocation() {
    if (this._locationMarker) {
      this._map.removeLayer(this._locationMarker);
      this._locationMarker = null;
    }
    if (this._locationCircle) {
      this._map.removeLayer(this._locationCircle);
      this._locationCircle = null;
    }
  }

  /**
   * Show user location on map with marker and accuracy circle
   * @private
   */
  _showUserLocation(lat, lng, accuracy) {
    // Remove previous location marker and circle
    if (this._locationMarker) {
      this._map.removeLayer(this._locationMarker);
    }
    if (this._locationCircle) {
      this._map.removeLayer(this._locationCircle);
    }

    // Create accuracy circle
    this._locationCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: "#4285f4",
      fillColor: "#4285f4",
      fillOpacity: 0.15,
      weight: 1,
    }).addTo(this._map);

    // Create pulsing marker for user location (blue dot style like Google Maps)
    this._locationMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#fff",
      fillColor: "#4285f4",
      fillOpacity: 1,
      weight: 3,
    }).addTo(this._map);

    // Fit view to show accuracy circle
    this._map.fitBounds(this._locationCircle.getBounds(), {
      maxZoom: 17,
      padding: [50, 50],
    });
  }
}

// Export singleton instance
export const mapService = new MapService();
export default mapService;
