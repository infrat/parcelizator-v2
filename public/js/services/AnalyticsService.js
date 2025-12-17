/**
 * AnalyticsService - Google Analytics 4 wrapper with cookie consent
 *
 * @description Handles GA4 initialization, cookie consent, and event tracking.
 * Respects user privacy by only loading GA after consent is given.
 */

import { CONFIG } from "../config.js";

class AnalyticsService {
  _initialized = false;
  _consentGiven = false;

  /**
   * Initialize analytics - check consent and load GA if approved
   */
  initialize() {
    this._consentGiven = this._getConsent();

    if (this._consentGiven) {
      this._loadGoogleAnalytics();
    }

    this._setupConsentBanner();
  }

  /**
   * Get consent status from localStorage
   * @private
   */
  _getConsent() {
    const consent = localStorage.getItem(CONFIG.ANALYTICS.CONSENT_KEY);
    return consent === "true";
  }

  /**
   * Save consent status to localStorage
   * @private
   */
  _setConsent(value) {
    localStorage.setItem(CONFIG.ANALYTICS.CONSENT_KEY, value.toString());
    this._consentGiven = value;
  }

  /**
   * Check if consent was already decided (either way)
   * @private
   */
  _hasConsentDecision() {
    return localStorage.getItem(CONFIG.ANALYTICS.CONSENT_KEY) !== null;
  }

  /**
   * Setup cookie consent banner
   * @private
   */
  _setupConsentBanner() {
    const banner = document.getElementById("cookieConsentBanner");
    const acceptBtn = document.getElementById("acceptCookies");
    const declineBtn = document.getElementById("declineCookies");

    if (!banner || !acceptBtn || !declineBtn) {
      console.warn("Cookie consent banner elements not found");
      return;
    }

    // Show banner only if no decision was made yet
    if (!this._hasConsentDecision()) {
      banner.style.display = "flex";
    }

    acceptBtn.addEventListener("click", () => {
      this._setConsent(true);
      this._loadGoogleAnalytics();
      banner.style.display = "none";
    });

    declineBtn.addEventListener("click", () => {
      this._setConsent(false);
      banner.style.display = "none";
    });
  }

  /**
   * Load Google Analytics script dynamically
   * @private
   */
  _loadGoogleAnalytics() {
    if (this._initialized) return;

    const gaId = CONFIG.ANALYTICS.GA_MEASUREMENT_ID;

    // Don't load if placeholder or empty
    if (!gaId || gaId === "GA_MEASUREMENT_ID_PLACEHOLDER") {
      if (CONFIG.ANALYTICS.DEBUG) {
        console.log("[Analytics] GA ID not configured, skipping initialization");
      }
      return;
    }

    // Create and inject gtag script
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaId);

    this._initialized = true;

    if (CONFIG.ANALYTICS.DEBUG) {
      console.log("[Analytics] Google Analytics initialized with ID:", gaId);
    }
  }

  /**
   * Track a custom event
   * @param {string} eventName - Event name from CONFIG.ANALYTICS.EVENTS
   * @param {Object} params - Event parameters
   */
  trackEvent(eventName, params = {}) {
    // Debug mode - just log to console
    if (CONFIG.ANALYTICS.DEBUG) {
      console.log("[Analytics] Event:", eventName, params);
      return;
    }

    // Don't track if no consent or GA not loaded
    if (!this._consentGiven || !this._initialized) {
      return;
    }

    // Send to GA
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  }

  /**
   * Track parcel addition
   * @param {string} method - How parcel was added (coordinates, parcel_id, address, map_click)
   * @param {string} parcelId - The parcel ID
   */
  trackParcelAdd(method, parcelId) {
    this.trackEvent(CONFIG.ANALYTICS.EVENTS.PARCEL_ADD, {
      method,
      parcel_id: parcelId,
    });
  }

  /**
   * Track parcel addition error
   * @param {string} method - How parcel was being added
   * @param {string} errorMessage - Error message
   */
  trackParcelAddError(method, errorMessage) {
    this.trackEvent(CONFIG.ANALYTICS.EVENTS.PARCEL_ADD_ERROR, {
      method,
      error_message: errorMessage,
    });
  }

  /**
   * Track queue processing
   * @param {number} totalCount - Total items in queue
   * @param {number} successCount - Successfully processed items
   * @param {number} errorCount - Failed items
   */
  trackQueueProcess(totalCount, successCount, errorCount) {
    this.trackEvent(CONFIG.ANALYTICS.EVENTS.QUEUE_PROCESS, {
      total_count: totalCount,
      success_count: successCount,
      error_count: errorCount,
    });
  }

  /**
   * Track file download
   * @param {string} format - File format (kml, gpkg, geojson)
   * @param {number} parcelCount - Number of parcels in file
   */
  trackFileDownload(format, parcelCount) {
    this.trackEvent(CONFIG.ANALYTICS.EVENTS.FILE_DOWNLOAD, {
      format,
      parcel_count: parcelCount,
    });
  }

  /**
   * Track queue mode toggle
   * @param {boolean} enabled - Whether queue mode is now enabled
   */
  trackQueueModeToggle(enabled) {
    this.trackEvent(CONFIG.ANALYTICS.EVENTS.QUEUE_MODE_TOGGLE, {
      enabled,
    });
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
