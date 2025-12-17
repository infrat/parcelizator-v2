/**
 * SearchService - Handles search input detection and geocoding
 *
 * @description Detects search type (coordinates, parcel ID, address)
 * and performs geocoding via Nominatim. Single Responsibility Principle.
 */

import { CONFIG, SearchType } from "../config.js";

class SearchService {
  _debounceTimer = null;

  /**
   * Detect the type of search query
   *
   * @param {string} query - User input string
   * @returns {string} SearchType enum value
   */
  detectType(query) {
    if (!query || typeof query !== "string") {
      return SearchType.ADDRESS;
    }

    const trimmed = query.trim();

    // Check for coordinates pattern first
    if (CONFIG.PATTERNS.COORDINATES.test(trimmed)) {
      return SearchType.COORDINATES;
    }

    // Check for parcel ID pattern
    if (CONFIG.PATTERNS.PARCEL_ID.test(trimmed)) {
      return SearchType.PARCEL_ID;
    }

    // Default to address search
    return SearchType.ADDRESS;
  }

  /**
   * Parse coordinates from string
   *
   * @param {string} query - Coordinate string (e.g., "50.1234, 19.5678")
   * @returns {{lat: number, lng: number} | null} Parsed coordinates or null
   */
  parseCoordinates(query) {
    const match = query.match(CONFIG.PATTERNS.COORDINATES);

    if (!match) {
      return null;
    }

    // Normalize decimal separator (Polish uses comma)
    const first = parseFloat(match[1].replace(",", "."));
    const second = parseFloat(match[2].replace(",", "."));

    // Determine which is lat and which is lng based on Poland's bounds
    // Poland: lat 49-55, lng 14-24
    const isFirstLat = first >= 49 && first <= 55;
    const isSecondLat = second >= 49 && second <= 55;

    if (isFirstLat && !isSecondLat) {
      return { lat: first, lng: second };
    } else if (isSecondLat && !isFirstLat) {
      return { lat: second, lng: first };
    }

    // Default: assume first is lat, second is lng
    return { lat: first, lng: second };
  }

  /**
   * Geocode an address using Nominatim API
   *
   * @param {string} address - Address string to geocode
   * @returns {Promise<Array<{display_name: string, lat: number, lng: number}>>} Geocoding results
   */
  async geocodeAddress(address) {
    if (!address || address.length < 3) {
      return [];
    }

    const params = new URLSearchParams({
      q: address,
      format: CONFIG.NOMINATIM.FORMAT,
      countrycodes: CONFIG.NOMINATIM.COUNTRY_CODE,
      limit: CONFIG.NOMINATIM.MAX_RESULTS.toString(),
    });

    try {
      const response = await fetch(`${CONFIG.NOMINATIM.BASE_URL}?${params}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = await response.json();

      return data.map((item) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
    } catch (error) {
      console.error("Geocoding error:", error);
      return [];
    }
  }

  /**
   * Geocode with debounce to respect Nominatim rate limits
   *
   * @param {string} address - Address string to geocode
   * @param {Function} callback - Callback with results
   */
  geocodeAddressDebounced(address, callback) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(async () => {
      const results = await this.geocodeAddress(address);
      callback(results);
    }, CONFIG.NOMINATIM.DEBOUNCE_MS);
  }

  /**
   * Cancel pending debounced geocoding request
   */
  cancelPendingGeocode() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }
}

// Export singleton instance
export const searchService = new SearchService();
export default searchService;
