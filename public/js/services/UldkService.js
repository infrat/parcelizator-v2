/**
 * UldkService - ULDK API client for fetching parcel geometry
 *
 * @description Communicates with GUGiK ULDK API to retrieve
 * cadastral parcel data. Single Responsibility Principle.
 */

import { CONFIG } from "../config.js";

/**
 * Result object from ULDK API
 * @typedef {Object} ParcelResult
 * @property {string} id - Parcel identifier
 * @property {string} wkt - WKT geometry string
 */

class UldkService {
  /**
   * Build ULDK API URL with parameters
   * @private
   */
  _buildUrl(request, params) {
    const url = new URL(CONFIG.ULDK.BASE_URL);
    url.searchParams.set("request", request);
    url.searchParams.set("result", CONFIG.ULDK.RESULT_FIELDS);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  /**
   * Parse ULDK API response
   * Response format: "status\ndata|id" or "status\nerror_message"
   * @private
   */
  _parseResponse(responseText) {
    const lines = responseText.trim().split("\n");

    if (lines.length < 2) {
      throw new Error("Nieprawidłowa odpowiedź z serwera ULDK");
    }

    const status = lines[0].trim();
    const data = lines.slice(1).join("\n").trim();

    if (status !== CONFIG.ULDK.SUCCESS_STATUS) {
      throw new Error(this._getErrorMessage(status, data));
    }

    // Parse WKT and ID from response (format: "wkt|id")
    const separatorIndex = data.lastIndexOf("|");

    if (separatorIndex === -1) {
      throw new Error("Nieprawidłowy format danych z ULDK");
    }

    return {
      wkt: data.substring(0, separatorIndex),
      id: data.substring(separatorIndex + 1),
    };
  }

  /**
   * Get user-friendly error message
   * @private
   */
  _getErrorMessage(status, data) {
    const errorMessages = {
      "-1": "Nie znaleziono działki o podanych parametrach",
      1: "Błąd w zapytaniu do serwera ULDK",
    };

    return errorMessages[status] || data || "Nieznany błąd serwera ULDK";
  }

  /**
   * Fetch parcel geometry by coordinates (WGS84)
   *
   * @param {number} lng - Longitude (WGS84)
   * @param {number} lat - Latitude (WGS84)
   * @returns {Promise<ParcelResult>} Parcel data with WKT geometry
   * @throws {Error} If parcel not found or API error
   */
  async getParcelByCoordinates(lng, lat) {
    // ULDK expects xy=X,Y,SRID format (lon,lat,srid for WGS84)
    const url = this._buildUrl(CONFIG.ULDK.ENDPOINTS.GET_BY_XY, {
      xy: `${lng},${lat},${CONFIG.ULDK.SRID_WGS84}`,
    });

    return this._fetchAndParse(url);
  }

  /**
   * Fetch parcel geometry by parcel ID
   *
   * @param {string} parcelId - Polish parcel identifier (e.g., "141201_1.0001.6509")
   * @returns {Promise<ParcelResult>} Parcel data with WKT geometry
   * @throws {Error} If parcel not found or API error
   */
  async getParcelById(parcelId) {
    const url = this._buildUrl(CONFIG.ULDK.ENDPOINTS.GET_BY_ID, {
      id: parcelId,
    });

    return this._fetchAndParse(url);
  }

  /**
   * Common fetch and parse logic
   * @private
   */
  async _fetchAndParse(url) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Błąd sieci: ${response.status} ${response.statusText}`
        );
      }

      const text = await response.text();
      return this._parseResponse(text);
    } catch (error) {
      if (
        error.name === "TypeError" &&
        error.message.includes("Failed to fetch")
      ) {
        throw new Error(
          "Brak połączenia z serwerem ULDK. Sprawdź połączenie internetowe."
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const uldkService = new UldkService();
export default uldkService;
