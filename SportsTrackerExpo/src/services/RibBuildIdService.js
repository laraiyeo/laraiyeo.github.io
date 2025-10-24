// Utility service for extracting dynamic build IDs from RIB.GG
export class RibBuildIdService {
  static buildId = null;
  static lastFetchTime = null;
  static CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  
  /**
   * Fetches the current build ID from RIB.GG HTML
   * @returns {Promise<string>} The extracted build ID
   */
  static async getBuildId() {
    try {
      // Check cache first
      if (this.buildId && this.lastFetchTime && 
          (Date.now() - this.lastFetchTime) < this.CACHE_DURATION) {
        return this.buildId;
      }

      console.log('RibBuildIdService: Fetching fresh build ID from rib.gg...');
      
      // Fetch the contact page HTML to extract build ID
      const response = await fetch('https://corsproxy.io/?url=https://www.rib.gg/contact');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Extract build ID from _buildManifest.js script tag
      // Example: <script src="/_next/static/j7QaCgeabIE0JTbIYiesS/_buildManifest.js" defer=""></script>
      const buildIdRegex = /_next\/static\/([^/]+)\/_buildManifest\.js/;
      const match = html.match(buildIdRegex);
      
      if (!match || !match[1]) {
        throw new Error('Build ID not found in HTML response');
      }
      
      const extractedBuildId = match[1];
      console.log('RibBuildIdService: Extracted build ID:', extractedBuildId);
      
      // Update cache
      this.buildId = extractedBuildId;
      this.lastFetchTime = Date.now();
      
      return extractedBuildId;
      
    } catch (error) {
      console.error('RibBuildIdService: Error fetching build ID:', error);
      
      // Return cached build ID if available, otherwise return fallback
      if (this.buildId) {
        console.log('RibBuildIdService: Using cached build ID due to fetch error');
        return this.buildId;
      }
      
      // Fallback to a known working build ID
      const fallbackBuildId = 'j7QaCgeabIE0JTbIYiesS';
      console.log('RibBuildIdService: Using fallback build ID:', fallbackBuildId);
      return fallbackBuildId;
    }
  }

  /**
   * Constructs the full _next/data URL with current build ID
   * @param {string} path - The path after the build ID (e.g., '/en/series/12345.json')
   * @returns {Promise<string>} The complete URL
   */
  static async getNextDataUrl(path) {
    const buildId = await this.getBuildId();
    return `https://corsproxy.io/?url=https://www.rib.gg/_next/data/${buildId}${path}`;
  }

  /**
   * Clears the cached build ID (for testing or forcing refresh)
   */
  static clearCache() {
    this.buildId = null;
    this.lastFetchTime = null;
    console.log('RibBuildIdService: Cache cleared');
  }
}