/**
 * App - Main application orchestrator
 *
 * @description Coordinates all services and manages UI interactions.
 * Acts as the composition root following Dependency Inversion Principle.
 */

import { SearchType } from "./config.js";
import { searchService } from "./services/SearchService.js";
import { uldkService } from "./services/UldkService.js";
import { mapService } from "./services/MapService.js";
import { analyticsService } from "./services/AnalyticsService.js";
import { parseWkt, extractVertices } from "./utils/WktParser.js";
import { downloadKmlWithLayers } from "./utils/KmlExporter.js";
import { downloadGpkgWithLayers } from "./utils/GeopkgExporter.js";
import { downloadGeojsonWithLayers } from "./utils/GeojsonExporter.js";

class App {
  // Parcel list (multiple parcels)
  _parcels = [];

  // Coordinate queue for batch processing
  _coordinateQueue = [];
  _nextQueueId = 1;

  // Fixed color for all parcels
  _parcelColor = "#c62828";

  // View state
  _showingPolygons = true;
  _showingPoints = false;

  // DOM elements cache
  _elements = {};

  /**
   * Initialize application
   */
  initialize() {
    this._cacheElements();
    this._initializeMap();
    this._bindEventListeners();
    this._updateUI();

    // Initialize analytics (handles consent banner)
    analyticsService.initialize();

    console.log("Parcelizator initialized");
  }

  /**
   * Cache DOM elements for performance
   * @private
   */
  _cacheElements() {
    this._elements = {
      searchInput: document.getElementById("searchInput"),
      searchResults: document.getElementById("searchResults"),
      searchContainer: document.querySelector(".search-container"),
      addParcelBtn: document.getElementById("addParcelBtn"),
      queueModeCheckbox: document.getElementById("queueModeCheckbox"),
      // Coordinate queue elements
      coordinateQueue: document.getElementById("coordinateQueue"),
      queueItems: document.getElementById("queueItems"),
      queueCount: document.getElementById("queueCount"),
      processQueueBtn: document.getElementById("processQueueBtn"),
      clearQueueBtn: document.getElementById("clearQueueBtn"),
      // Parcel list elements
      parcelList: document.getElementById("parcelList"),
      parcelListItems: document.getElementById("parcelListItems"),
      parcelListCount: document.getElementById("parcelListCount"),
      clearAllParcelsBtn: document.getElementById("clearAllParcelsBtn"),
      utilitiesLayerCheckbox: document.getElementById("utilitiesLayerCheckbox"),
      showPolygonsBtn: document.getElementById("showPolygonsBtn"),
      showPointsBtn: document.getElementById("showPointsBtn"),
      downloadKmlBtn: document.getElementById("downloadKmlBtn"),
      downloadGpkgBtn: document.getElementById("downloadGpkgBtn"),
      downloadGeojsonBtn: document.getElementById("downloadGeojsonBtn"),
      status: document.getElementById("status"),
      stats: document.getElementById("stats"),
      parcelCount: document.getElementById("parcelCount"),
      pointCount: document.getElementById("pointCount"),
      totalArea: document.getElementById("totalArea"),
      coordinatesBadge: document.querySelector(
        ".search-type-badge.coordinates"
      ),
      parcelBadge: document.querySelector(".search-type-badge.parcel"),
      addressBadge: document.querySelector(".search-type-badge.address"),
    };
  }

  /**
   * Initialize map service
   * @private
   */
  _initializeMap() {
    mapService.initialize("map");

    // Handle map clicks for coordinate-based search
    mapService.onMapClick((latlng) => {
      this._handleMapClick(latlng);
    });
  }

  /**
   * Bind all event listeners
   * @private
   */
  _bindEventListeners() {
    // Search input
    this._elements.searchInput.addEventListener("input", (e) => {
      this._handleSearchInput(e.target.value);
    });

    this._elements.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._handleAddParcel();
      }
    });

    // Add parcel button
    this._elements.addParcelBtn.addEventListener("click", () => {
      this._handleAddParcel();
    });

    // Clear all parcels button
    this._elements.clearAllParcelsBtn.addEventListener("click", () => {
      this._clearAllParcels();
    });

    // Queue buttons
    this._elements.processQueueBtn.addEventListener("click", () => {
      this._processQueue();
    });

    this._elements.clearQueueBtn.addEventListener("click", () => {
      this._clearQueue();
    });

    // Queue mode toggle
    this._elements.queueModeCheckbox.addEventListener("change", (e) => {
      analyticsService.trackQueueModeToggle(e.target.checked);
    });

    // Utilities layer toggle
    this._elements.utilitiesLayerCheckbox.addEventListener("change", (e) => {
      mapService.toggleUtilitiesLayer(e.target.checked);
    });

    // Close search results when clicking outside
    document.addEventListener("click", (e) => {
      if (!this._elements.searchContainer.contains(e.target)) {
        this._hideSearchResults();
      }
    });

    // View toggle buttons
    this._elements.showPolygonsBtn.addEventListener("click", () => {
      this._togglePolygons();
    });

    this._elements.showPointsBtn.addEventListener("click", () => {
      this._togglePoints();
    });

    // Download button
    this._elements.downloadKmlBtn.addEventListener("click", () => {
      this._handleDownloadKml();
    });

    // Download GeoPackage button
    this._elements.downloadGpkgBtn.addEventListener("click", () => {
      this._handleDownloadGpkg();
    });

    // Download GeoJSON button
    this._elements.downloadGeojsonBtn.addEventListener("click", () => {
      this._handleDownloadGeojson();
    });
  }

  /**
   * Handle search input changes
   * @private
   */
  _handleSearchInput(value) {
    const searchType = searchService.detectType(value);
    this._updateSearchTypeBadges(searchType);

    // For address searches, show autocomplete results
    if (searchType === SearchType.ADDRESS && value.length >= 3) {
      // Show loading indicator while searching
      this._setAddButtonLoading(true);

      searchService.geocodeAddressDebounced(value, (results) => {
        this._setAddButtonLoading(false);
        this._showSearchResults(results);
      });
    } else {
      searchService.cancelPendingGeocode();
      this._setAddButtonLoading(false);
      this._hideSearchResults();
    }
  }

  /**
   * Handle search submit (Enter key) - now adds parcel to list
   * @private
   */
  async _handleAddParcel() {
    const query = this._elements.searchInput.value.trim();

    if (!query) {
      return;
    }

    const searchType = searchService.detectType(query);

    try {
      switch (searchType) {
        case SearchType.COORDINATES:
          this._addParcelByCoordinates(query);
          break;
        case SearchType.PARCEL_ID:
          await this._addParcelById(query);
          break;
        case SearchType.ADDRESS:
          // For address, user should select from dropdown
          this._showStatus("Wybierz adres z listy podpowiedzi", "loading");
          break;
      }
    } catch (error) {
      this._showStatus(error.message, "error");
    }
  }

  /**
   * Check if queue mode is enabled
   * @private
   */
  _isQueueMode() {
    return this._elements.queueModeCheckbox?.checked ?? false;
  }

  /**
   * Add coordinates - either to queue or directly fetch parcel
   * @private
   */
  async _addParcelByCoordinates(query) {
    const coords = searchService.parseCoordinates(query);

    if (!coords) {
      throw new Error("Nieprawidłowy format współrzędnych");
    }

    if (this._isQueueMode()) {
      this._addToQueue(coords.lat, coords.lng, "Współrzędne", { flyTo: true });
      this._elements.searchInput.value = "";
    } else {
      // Direct mode - fetch parcel immediately
      this._showStatus("Szukam działki...", "loading");
      this._setAddButtonLoading(true);
      try {
        const result = await uldkService.getParcelByCoordinates(
          coords.lng,
          coords.lat
        );
        await this._addParcelToList(result, { method: "coordinates" });
        this._elements.searchInput.value = "";
      } catch (error) {
        this._showStatus(error.message, "error");
      } finally {
        this._setAddButtonLoading(false);
      }
    }
  }

  /**
   * Add parcel by ID
   * @private
   */
  async _addParcelById(parcelId) {
    this._showStatus("Szukam działki...", "loading");
    this._setAddButtonLoading(true);

    try {
      const result = await uldkService.getParcelById(parcelId);
      await this._addParcelToList(result, { method: "parcel_id" });
    } catch (error) {
      this._showStatus(error.message, "error");
    } finally {
      this._setAddButtonLoading(false);
    }
  }

  /**
   * Add address coordinates - either to queue or directly fetch parcel
   * @private
   */
  async _addParcelByAddress(lat, lng, displayName) {
    this._hideSearchResults();
    this._elements.searchInput.value = "";

    if (this._isQueueMode()) {
      // Queue mode - add to queue
      const shortLabel =
        displayName.length > 30
          ? displayName.substring(0, 30) + "..."
          : displayName;
      this._addToQueue(
        Number.parseFloat(lat),
        Number.parseFloat(lng),
        shortLabel,
        { flyTo: true }
      );
    } else {
      // Direct mode - fetch parcel immediately
      this._showStatus("Szukam działki...", "loading");
      this._setAddButtonLoading(true);
      try {
        const result = await uldkService.getParcelByCoordinates(
          Number.parseFloat(lng),
          Number.parseFloat(lat)
        );
        await this._addParcelToList(result, { method: "address" });
      } catch (error) {
        this._showStatus(error.message, "error");
      } finally {
        this._setAddButtonLoading(false);
      }
    }
  }
  /**
   * Handle map click event - adds to queue or fetches directly based on mode
   * @private
   */
  async _handleMapClick(latlng) {
    const { lat, lng } = latlng;

    // Update search input with coordinates
    this._elements.searchInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    this._updateSearchTypeBadges(SearchType.COORDINATES);

    if (this._isQueueMode()) {
      this._addToQueue(lat, lng, "Klik na mapę");
    } else {
      // Direct mode - fetch parcel immediately
      this._showStatus("Szukam działki...", "loading");
      this._setAddButtonLoading(true);
      try {
        const result = await uldkService.getParcelByCoordinates(lng, lat);
        await this._addParcelToList(result, {
          fitBounds: false,
          method: "map_click",
        });
      } catch (error) {
        this._showStatus(error.message, "error");
      } finally {
        this._setAddButtonLoading(false);
      }
    }
  }

  /**
   * Add parcel to list
   * @param {Object} result - ULDK API result
   * @param {Object} options - Options
   * @param {boolean} options.fitBounds - Whether to fit map bounds to the new parcel
   * @private
   */
  async _addParcelToList(
    result,
    { fitBounds = true, method = "unknown" } = {}
  ) {
    try {
      // Check if parcel already in list
      if (this._parcels.some((p) => p.id === result.id)) {
        this._showStatus(`Działka ${result.id} jest już na liście`, "error");
        return;
      }

      // Parse WKT geometry
      const geometry = parseWkt(result.wkt);
      const vertices = extractVertices(geometry);

      // Create parcel object
      const parcel = {
        id: result.id,
        wkt: result.wkt,
        geometry,
        vertices,
      };

      // Add to list
      this._parcels.push(parcel);

      // Clear input
      this._elements.searchInput.value = "";

      // Redraw map
      this._redrawMap();

      // Fit bounds to the newly added parcel if requested
      if (fitBounds) {
        mapService.fitToCoordinates(parcel.vertices);
      }

      // Update UI
      this._updateParcelListUI();
      this._updateUI();
      this._updateStats();
      this._showStatus(`Dodano działkę: ${result.id}`, "success");

      // Track analytics
      analyticsService.trackParcelAdd(method, result.id);
    } catch (error) {
      console.error("Error adding parcel:", error);
      throw new Error("Błąd przetwarzania geometrii działki");
    }
  }

  /**
   * Remove parcel from list by ID
   * @private
   */
  _removeParcel(parcelId) {
    this._parcels = this._parcels.filter((p) => p.id !== parcelId);
    this._redrawMap();
    this._updateParcelListUI();
    this._updateUI();
    this._updateStats();

    if (this._parcels.length === 0) {
      this._hideStatus();
    } else {
      this._showStatus(`Usunięto działkę: ${parcelId}`, "success");
    }
  }

  /**
   * Clear all parcels
   * @private
   */
  _clearAllParcels() {
    this._parcels = [];
    mapService.clearAll();
    this._updateParcelListUI();
    this._updateUI();
    this._updateStats();
    this._hideStatus();
  }

  // ==================== COORDINATE QUEUE ====================

  /**
   * Add coordinates to the queue
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} label - Label for the queue item (e.g., "Klik na mapę", address)
   * @param {Object} options - Options
   * @param {boolean} options.flyTo - Whether to zoom map to the coordinates
   * @private
   */
  _addToQueue(lat, lng, label = "", { flyTo = false } = {}) {
    const id = this._nextQueueId++;

    // Add marker to map
    mapService.addQueueMarker(lat, lng, id);

    // Add to beginning of queue (newest first)
    this._coordinateQueue.unshift({
      id,
      lat,
      lng,
      label,
    });

    // Zoom to the new point if requested
    if (flyTo) {
      mapService.setView(lat, lng, 18);
    }

    this._updateQueueUI();
    this._showStatus(`Dodano punkt do kolejki`, "success");
  }

  /**
   * Remove item from queue by ID
   * @param {number} id - Queue item ID
   * @private
   */
  _removeFromQueue(id) {
    this._coordinateQueue = this._coordinateQueue.filter(
      (item) => item.id !== id
    );
    mapService.removeQueueMarker(id);
    this._updateQueueUI();
  }

  /**
   * Clear entire queue
   * @private
   */
  _clearQueue() {
    this._coordinateQueue = [];
    mapService.clearQueueMarkers();
    this._updateQueueUI();
    this._hideStatus();
  }

  /**
   * Process all items in the queue - fetch parcels from ULDK
   * @private
   */
  async _processQueue() {
    if (this._coordinateQueue.length === 0) {
      this._showStatus("Kolejka jest pusta", "error");
      return;
    }

    const itemsToProcess = [...this._coordinateQueue];
    const total = itemsToProcess.length;

    this._showStatus(`Pobieram działki... (0/${total})`, "loading");
    this._elements.processQueueBtn.disabled = true;
    this._elements.processQueueBtn.innerHTML =
      '<span class="loading-spinner"></span>';

    let successCount = 0;
    let errorCount = 0;
    let completedCount = 0;

    // Update progress display
    const updateProgress = () => {
      this._showStatus(
        `Pobieram działki... (${completedCount}/${total})`,
        "loading"
      );
    };

    // Process all coordinates in parallel, updating progress as each completes
    const results = await Promise.allSettled(
      itemsToProcess.map(async (item) => {
        try {
          const result = await uldkService.getParcelByCoordinates(
            item.lng,
            item.lat
          );
          completedCount++;
          updateProgress();
          return { item, result, success: true };
        } catch (error) {
          completedCount++;
          updateProgress();
          return { item, error: error.message, success: false };
        }
      })
    );

    // Add successful parcels to list
    for (const outcome of results) {
      if (outcome.status === "fulfilled" && outcome.value.success) {
        try {
          await this._addParcelToList(outcome.value.result, {
            fitBounds: false,
            method: "queue",
          });
          successCount++;
        } catch (error) {
          console.warn("Failed to add parcel:", error.message);
          errorCount++;
        }
      } else {
        errorCount++;
      }
    }

    // Clear queue after processing
    this._clearQueue();

    // Restore button
    this._elements.processQueueBtn.disabled = false;
    this._elements.processQueueBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Start
    `;

    // Fit bounds to show all parcels
    if (successCount > 0) {
      mapService.fitToPolygons();
    }

    // Track queue processing
    analyticsService.trackQueueProcess(total, successCount, errorCount);

    // Show final status
    if (errorCount === 0) {
      this._showStatus(`Pobrano ${successCount} działek`, "success");
    } else {
      this._showStatus(
        `Pobrano ${successCount} działek, ${errorCount} błędów`,
        errorCount === total ? "error" : "success"
      );
    }
  }

  /**
   * Update queue UI
   * @private
   */
  _updateQueueUI() {
    const queue = this._coordinateQueue;
    const container = this._elements.queueItems;
    const queueSection = this._elements.coordinateQueue;

    // Show/hide queue section
    queueSection.style.display = queue.length > 0 ? "block" : "none";

    // Update count
    this._elements.queueCount.textContent = queue.length;

    // Render queue items
    if (queue.length === 0) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = queue
      .map(
        (item) => `
        <div class="queue-item" data-id="${item.id}" data-lat="${
          item.lat
        }" data-lng="${item.lng}">
          <span class="queue-color"></span>
          <span class="queue-coords">${item.lat.toFixed(6)}, ${item.lng.toFixed(
          6
        )}</span>
          ${
            item.label
              ? `<span class="queue-label" title="${item.label}">${item.label}</span>`
              : ""
          }
          <button class="btn-locate" title="Pokaż na mapie">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 2v4m0 12v4m10-10h-4M6 12H2"></path>
            </svg>
          </button>
          <button class="btn-remove" title="Usuń z kolejki">×</button>
        </div>
      `
      )
      .join("");

    // Attach locate handlers
    container.querySelectorAll(".btn-locate").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".queue-item");
        const lat = Number.parseFloat(item.dataset.lat);
        const lng = Number.parseFloat(item.dataset.lng);
        mapService.setView(lat, lng, 18);
      });
    });

    // Attach remove handlers
    container.querySelectorAll(".btn-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = Number.parseInt(
          e.target.closest(".queue-item").dataset.id,
          10
        );
        this._removeFromQueue(id);
      });
    });
  }

  /**
   * Redraw all parcels on map
   * @private
   */
  _redrawMap() {
    mapService.clearPolygons();
    mapService.clearPoints();
    mapService.clearMarkers();

    // Draw all parcels
    // Fill is ALWAYS visible, stroke and points are optional
    this._parcels.forEach((parcel) => {
      // Always draw fill, optionally with stroke
      mapService.drawPolygonWithStyle(parcel.geometry.coordinates, {
        color: this._showingPolygons ? this._parcelColor : "transparent",
        fillColor: this._parcelColor,
        fillOpacity: 0.3,
        weight: this._showingPolygons ? 3 : 0,
      });

      // Draw points if enabled
      if (this._showingPoints) {
        mapService.drawPointsWithColor(parcel.vertices, this._parcelColor);
      }
    });
  }

  /**
   * Toggle polygon visibility
   * @private
   */
  _togglePolygons() {
    if (this._parcels.length === 0) return;

    this._showingPolygons = !this._showingPolygons;
    this._redrawMap();
    this._updateToggleButtons();
  }

  /**
   * Toggle points visibility
   * @private
   */
  _togglePoints() {
    if (this._parcels.length === 0) return;

    this._showingPoints = !this._showingPoints;
    this._redrawMap();
    this._updateToggleButtons();
  }

  /**
   * Handle KML download
   * @private
   */
  _handleDownloadKml() {
    if (this._parcels.length === 0) {
      this._showStatus("Najpierw dodaj działki do listy", "error");
      return;
    }

    if (!this._showingPolygons && !this._showingPoints) {
      this._showStatus(
        "Brak widocznych elementów do eksportu. Włącz obrysy lub punkty.",
        "error"
      );
      return;
    }

    try {
      downloadKmlWithLayers(this._parcels, {
        includePolygons: this._showingPolygons,
        includePoints: this._showingPoints,
      });

      const layers = [];
      if (this._showingPolygons) layers.push("obrysy");
      if (this._showingPoints) layers.push("punkty");
      this._showStatus(`Pobrano plik KML (${layers.join(", ")})`, "success");

      // Track analytics
      analyticsService.trackFileDownload("kml", this._parcels.length);
    } catch (error) {
      console.error("KML generation error:", error);
      this._showStatus("Błąd generowania pliku KML", "error");
    }
  }

  /**
   * Handle GeoPackage download
   * @private
   */
  async _handleDownloadGpkg() {
    if (this._parcels.length === 0) {
      this._showStatus("Najpierw dodaj działki do listy", "error");
      return;
    }

    if (!this._showingPolygons && !this._showingPoints) {
      this._showStatus(
        "Brak widocznych elementów do eksportu. Włącz obrysy lub punkty.",
        "error"
      );
      return;
    }

    try {
      this._showStatus("Generowanie pliku GeoPackage...", "loading");

      await downloadGpkgWithLayers(this._parcels, {
        includePolygons: this._showingPolygons,
        includePoints: this._showingPoints,
      });

      const layers = [];
      if (this._showingPolygons) layers.push("obrysy");
      if (this._showingPoints) layers.push("punkty");
      this._showStatus(
        `Pobrano plik GeoPackage (${layers.join(", ")})`,
        "success"
      );

      // Track analytics
      analyticsService.trackFileDownload("gpkg", this._parcels.length);
    } catch (error) {
      console.error("GeoPackage generation error:", error);
      this._showStatus("Błąd generowania pliku GeoPackage", "error");
    }
  }

  /**
   * Handle GeoJSON download
   * @private
   */
  _handleDownloadGeojson() {
    if (this._parcels.length === 0) {
      this._showStatus("Najpierw dodaj działki do listy", "error");
      return;
    }

    if (!this._showingPolygons && !this._showingPoints) {
      this._showStatus(
        "Brak widocznych elementów do eksportu. Włącz obrysy lub punkty.",
        "error"
      );
      return;
    }

    try {
      downloadGeojsonWithLayers(this._parcels, {
        includePolygons: this._showingPolygons,
        includePoints: this._showingPoints,
      });

      const layers = [];
      if (this._showingPolygons) layers.push("obrysy");
      if (this._showingPoints) layers.push("punkty");
      this._showStatus(
        `Pobrano plik GeoJSON (${layers.join(", ")})`,
        "success"
      );

      // Track analytics
      analyticsService.trackFileDownload("geojson", this._parcels.length);
    } catch (error) {
      console.error("GeoJSON generation error:", error);
      this._showStatus("Błąd generowania pliku GeoJSON", "error");
    }
  }

  /**
   * Update search type badges
   * @private
   */
  _updateSearchTypeBadges(activeType) {
    const badges = {
      [SearchType.COORDINATES]: this._elements.coordinatesBadge,
      [SearchType.PARCEL_ID]: this._elements.parcelBadge,
      [SearchType.ADDRESS]: this._elements.addressBadge,
    };

    Object.entries(badges).forEach(([type, badge]) => {
      if (badge) {
        badge.classList.toggle("active", type === activeType);
      }
    });
  }

  /**
   * Show search results dropdown
   * @private
   */
  _showSearchResults(results) {
    const container = this._elements.searchResults;
    container.innerHTML = "";

    if (results.length === 0) {
      container.innerHTML =
        '<div class="search-result-item">Brak wyników</div>';
      container.classList.add("active");
      return;
    }

    results.forEach((result) => {
      const item = document.createElement("div");
      item.className = "search-result-item";
      item.textContent = result.display_name;
      item.addEventListener("click", () => {
        this._addParcelByAddress(result.lat, result.lng, result.display_name);
      });
      container.appendChild(item);
    });

    container.classList.add("active");
  }

  /**
   * Hide search results dropdown
   * @private
   */
  _hideSearchResults() {
    this._elements.searchResults.classList.remove("active");
  }

  /**
   * Set add button loading state
   * @private
   */
  _setAddButtonLoading(loading) {
    const btn = this._elements.addParcelBtn;
    btn.disabled = loading;
    if (loading) {
      btn.innerHTML = '<span class="loading-spinner"></span>';
    } else {
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>`;
    }
  }

  /**
   * Show status message
   * @private
   */
  _showStatus(message, type = "loading") {
    const statusEl = this._elements.status;
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = "block";
  }

  /**
   * Hide status message
   * @private
   */
  _hideStatus() {
    this._elements.status.style.display = "none";
  }

  /**
   * Update statistics display
   * @private
   */
  _updateStats() {
    if (this._parcels.length === 0) {
      this._elements.stats.style.display = "none";
      return;
    }

    const totalPoints = this._parcels.reduce(
      (sum, p) => sum + p.vertices.length,
      0
    );

    // Calculate total area from all parcels
    const totalArea = this._parcels.reduce(
      (sum, p) => sum + this._calculatePolygonArea(p.vertices),
      0
    );

    this._elements.stats.style.display = "block";
    this._elements.parcelCount.textContent = this._parcels.length.toString();
    this._elements.pointCount.textContent = totalPoints.toString();
    this._elements.totalArea.textContent = this._formatArea(totalArea);
  }

  /**
   * Calculate polygon area using Shoelace formula
   * Converts lat/lng to approximate meters first
   * @param {Array<{lat: number, lng: number}>} vertices
   * @returns {number} Area in square meters
   * @private
   */
  _calculatePolygonArea(vertices) {
    if (!vertices || vertices.length < 3) return 0;

    // Convert to approximate meters using center point as reference
    const centerLat =
      vertices.reduce((sum, v) => sum + v.lat, 0) / vertices.length;
    const metersPerDegreeLat = 111320; // ~111km per degree latitude
    const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

    const coords = vertices.map((v) => ({
      x: v.lng * metersPerDegreeLng,
      y: v.lat * metersPerDegreeLat,
    }));

    // Shoelace formula
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i].x * coords[j].y;
      area -= coords[j].x * coords[i].y;
    }

    return Math.abs(area / 2);
  }

  /**
   * Format area for display
   * @param {number} areaM2 - Area in square meters
   * @returns {string} Formatted area
   * @private
   */
  _formatArea(areaM2) {
    if (areaM2 >= 10000) {
      // Show in hectares if >= 1 ha
      return (areaM2 / 10000).toFixed(2) + " ha";
    }
    return Math.round(areaM2).toLocaleString("pl-PL") + " m²";
  }

  /**
   * Update UI state
   * @private
   */
  _updateUI() {
    const hasParcels = this._parcels.length > 0;

    this._elements.showPolygonsBtn.disabled = !hasParcels;
    this._elements.showPointsBtn.disabled = !hasParcels;
    this._elements.downloadKmlBtn.disabled = !hasParcels;
    this._elements.downloadGpkgBtn.disabled = !hasParcels;
    this._elements.downloadGeojsonBtn.disabled = !hasParcels;

    this._updateToggleButtons();
  }

  /**
   * Update parcel list UI
   * @private
   */
  _updateParcelListUI() {
    const listContainer = this._elements.parcelList;
    const itemsContainer = this._elements.parcelListItems;
    const countSpan = this._elements.parcelListCount;

    if (this._parcels.length === 0) {
      listContainer.style.display = "none";
      return;
    }

    listContainer.style.display = "block";
    countSpan.textContent = this._parcels.length.toString();

    itemsContainer.innerHTML = "";

    // Display newest parcels first (reverse order)
    [...this._parcels].reverse().forEach((parcel) => {
      const item = document.createElement("div");
      item.className = "parcel-list-item";
      item.dataset.parcelId = parcel.id;
      item.innerHTML = `
        <span class="parcel-color" style="background: ${this._parcelColor}"></span>
        <span class="parcel-id" title="${parcel.id}">${parcel.id}</span>
        <button class="btn-locate" title="Pokaż na mapie">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 2v4m0 12v4m10-10h-4M6 12H2"></path>
          </svg>
        </button>
        <button class="btn-remove" title="Usuń działkę">×</button>
      `;

      item.querySelector(".btn-locate").addEventListener("click", () => {
        mapService.fitToCoordinates(parcel.vertices);
      });

      item.querySelector(".btn-remove").addEventListener("click", () => {
        this._removeParcel(parcel.id);
      });

      itemsContainer.appendChild(item);
    });
  }

  /**
   * Update toggle button states
   * @private
   */
  _updateToggleButtons() {
    // Update button styles based on active state
    this._elements.showPolygonsBtn.style.opacity = this._showingPolygons
      ? "1"
      : "0.7";
    this._elements.showPointsBtn.style.opacity = this._showingPoints
      ? "1"
      : "0.7";
  }
}

// Create and export app instance
export const app = new App();

/**
 * Wait for external libraries and initialize app
 */
function initWhenReady() {
  // Check if required libraries are loaded
  if (typeof L === "undefined" || typeof proj4 === "undefined") {
    // Retry after a short delay
    setTimeout(initWhenReady, 50);
    return;
  }

  app.initialize();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWhenReady);
} else {
  initWhenReady();
}

export default app;
