/**
 * CoordinateTransformer - Handles coordinate system transformations
 *
 * @description Wraps Proj4js to convert between EPSG:2180 (Polish system)
 * and EPSG:4326 (WGS84/GPS). Single Responsibility Principle.
 */

import { CONFIG } from "../config.js";

class CoordinateTransformer {
  _initialized = false;

  /**
   * Initialize Proj4 with Polish PUWG 1992 projection definition
   * Must be called after proj4 library is loaded
   */
  initialize() {
    if (this._initialized) return;

    if (typeof proj4 === "undefined") {
      throw new Error(
        "Proj4js library not loaded. Include it before using CoordinateTransformer."
      );
    }

    // Define EPSG:2180 if not already defined
    if (!proj4.defs(CONFIG.PROJECTIONS.PUWG_1992)) {
      proj4.defs(
        CONFIG.PROJECTIONS.PUWG_1992,
        CONFIG.PROJECTIONS.PUWG_1992_DEF
      );
    }

    this._initialized = true;
  }

  /**
   * Convert coordinates from EPSG:2180 (PUWG 1992) to WGS84
   *
   * @param {number} x - X coordinate in EPSG:2180 (easting)
   * @param {number} y - Y coordinate in EPSG:2180 (northing)
   * @returns {{lat: number, lng: number}} Coordinates in WGS84
   */
  toWGS84(x, y) {
    this.initialize();
    const [lng, lat] = proj4(
      CONFIG.PROJECTIONS.PUWG_1992,
      CONFIG.PROJECTIONS.WGS84,
      [x, y]
    );
    return { lat, lng };
  }

  /**
   * Convert coordinates from WGS84 to EPSG:2180 (PUWG 1992)
   *
   * @param {number} lat - Latitude in WGS84
   * @param {number} lng - Longitude in WGS84
   * @returns {{x: number, y: number}} Coordinates in EPSG:2180
   */
  fromWGS84(lat, lng) {
    this.initialize();
    const [x, y] = proj4(
      CONFIG.PROJECTIONS.WGS84,
      CONFIG.PROJECTIONS.PUWG_1992,
      [lng, lat]
    );
    return { x, y };
  }

  /**
   * Transform an array of coordinate pairs from EPSG:2180 to WGS84
   *
   * @param {Array<{x: number, y: number}>} coordinates - Array of EPSG:2180 coordinates
   * @returns {Array<{lat: number, lng: number}>} Array of WGS84 coordinates
   */
  transformArrayToWGS84(coordinates) {
    return coordinates.map(({ x, y }) => this.toWGS84(x, y));
  }
}

// Export singleton instance
export const coordinateTransformer = new CoordinateTransformer();
export default coordinateTransformer;
