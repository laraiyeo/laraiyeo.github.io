/**
 * Year Fallback Utility
 * 
 * This utility provides a fallback mechanism for fetching sports data:
 * 1. Try next year first
 * 2. If no data or no relevant data, try current year
 * 3. If still no data, try previous year
 * 
 * This ensures the app always shows relevant data even when seasons transition
 */

export class YearFallbackUtils {
  
  /**
   * Get the preferred year for data fetching
   * Always starts with next year as default
   */
  static getPreferredYear() {
    const currentYear = new Date().getFullYear();
    return currentYear + 1; // Start with next year
  }

  /**
   * Get current year
   */
  static getCurrentYear() {
    return new Date().getFullYear();
  }

  /**
   * Get previous year
   */
  static getPreviousYear() {
    const currentYear = new Date().getFullYear();
    return currentYear - 1;
  }

  /**
   * Get an array of years to try in order: next year, current year, previous year
   */
  static getYearFallbackSequence() {
    const currentYear = new Date().getFullYear();
    return [
      currentYear + 1, // Next year
      currentYear,     // Current year
      currentYear - 1  // Previous year
    ];
  }

  /**
   * Attempt to fetch data with year fallback
   * @param {Function} fetchFunction - Function that takes a year parameter and returns a Promise
   * @param {Function} dataValidator - Optional function to validate if the returned data is relevant
   * @returns {Promise} - Promise that resolves with the first successful data fetch
   */
  static async fetchWithYearFallback(fetchFunction, dataValidator = null) {
    const years = this.getYearFallbackSequence();
    let lastError = null;

    for (const year of years) {
      try {
        console.log(`Attempting to fetch data for year: ${year}`);
        const data = await fetchFunction(year);
        
        // If no data validator provided, just check if data exists
        if (!dataValidator) {
          if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
            console.log(`Successfully fetched data for year: ${year}`);
            return { data, year };
          }
        } else {
          // Use custom validator
          if (dataValidator(data)) {
            console.log(`Successfully fetched valid data for year: ${year}`);
            return { data, year };
          }
        }
        
        console.log(`No relevant data found for year: ${year}`);
      } catch (error) {
        console.log(`Error fetching data for year ${year}:`, error.message);
        lastError = error;
      }
    }

    throw new Error(`Failed to fetch data for all years. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Build API URL with year parameter
   * @param {string} baseUrl - Base URL template with {year} placeholder
   * @param {number} year - Year to substitute
   * @returns {string} - URL with year substituted
   */
  static buildUrlWithYear(baseUrl, year) {
    return baseUrl.replace('{year}', year);
  }



  /**
   * Format date for API calls (YYYY-MM-DD format)
   * Uses the current date's year for date components
   * @param {Date} date - Date to format
   * @returns {string} - Formatted date string
   */
  static formatDateForAPI(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Create a date with a specific year while keeping month and day
   * @param {Date} originalDate - Original date
   * @param {number} year - Year to use
   * @returns {Date} - New date with the specified year
   */
  static createDateWithYear(originalDate, year) {
    return new Date(year, originalDate.getMonth(), originalDate.getDate(), 
                   originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());
  }
}

export default YearFallbackUtils;