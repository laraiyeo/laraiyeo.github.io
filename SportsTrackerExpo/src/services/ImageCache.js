import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export class ImageCache {
  static CACHE_DIR = `${FileSystem.cacheDirectory}emotes/`;
  static MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  static CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Check if platform supports file system operations
   */
  static isFileSystemSupported() {
    return Platform.OS !== "web";
  }

  /**
   * Initialize cache directory
   */
  static async init() {
    if (!this.isFileSystemSupported()) {
      console.log(
        "📁 FileSystem not supported on web, using memory cache only"
      );
      return;
    }

    try {
      const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.CACHE_DIR, {
          intermediates: true,
        });
        console.log("📁 Emote cache directory created");
      }
    } catch (error) {
      console.error("📁 Error creating cache directory:", error);
    }
  }

  /**
   * Get cached image path or download if not cached
   */
  static async getCachedImageUri(imageUrl, emoteName) {
    // On web, always return original URL
    if (!this.isFileSystemSupported()) {
      return imageUrl;
    }

    try {
      await this.init();

      const fileName = this.getFileName(imageUrl, emoteName);
      const localUri = `${this.CACHE_DIR}${fileName}`;

      // Check if file exists and is not expired
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        const cacheData = await this.getCacheMetadata(fileName);
        const isExpired =
          cacheData && Date.now() - cacheData.cachedAt > this.CACHE_DURATION;

        if (!isExpired) {
          console.log(`🖼️ Cache hit for ${emoteName}`);
          return localUri;
        } else {
          console.log(`🖼️ Cache expired for ${emoteName}`);
          await this.removeFromCache(fileName);
        }
      }

      // Download and cache the image
      console.log(`🖼️ Downloading ${emoteName}...`);
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);

      if (downloadResult.status === 200) {
        // Save metadata
        await this.saveCacheMetadata(fileName, {
          originalUrl: imageUrl,
          emoteName,
          cachedAt: Date.now(),
          size: fileInfo.size || 0,
        });

        console.log(`🖼️ Cached ${emoteName}`);
        return localUri;
      } else {
        console.error(
          `🖼️ Failed to download ${emoteName}:`,
          downloadResult.status
        );
        return imageUrl; // Fallback to original URL
      }
    } catch (error) {
      console.error(`🖼️ Error caching ${emoteName}:`, error);
      return imageUrl; // Fallback to original URL
    }
  }

  /**
   * Generate a safe filename from URL and emote name
   */
  static getFileName(url, emoteName) {
    const urlHash = this.hashCode(url).toString();
    const safeName = emoteName.replace(/[^a-zA-Z0-9]/g, "_");
    const extension = url.split(".").pop()?.split("?")[0] || "webp";
    return `${safeName}_${urlHash}.${extension}`;
  }

  /**
   * Simple hash function for URLs
   */
  static hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Save cache metadata
   */
  static async saveCacheMetadata(fileName, metadata) {
    try {
      const key = `emote_cache_${fileName}`;
      await AsyncStorage.setItem(key, JSON.stringify(metadata));
    } catch (error) {
      console.error("📁 Error saving cache metadata:", error);
    }
  }

  /**
   * Get cache metadata
   */
  static async getCacheMetadata(fileName) {
    try {
      const key = `emote_cache_${fileName}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("📁 Error getting cache metadata:", error);
      return null;
    }
  }

  /**
   * Remove a file from cache
   */
  static async removeFromCache(fileName) {
    try {
      const localUri = `${this.CACHE_DIR}${fileName}`;
      await FileSystem.deleteAsync(localUri, { idempotent: true });

      const key = `emote_cache_${fileName}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error("📁 Error removing from cache:", error);
    }
  }

  /**
   * Get cache size
   */
  static async getCacheSize() {
    if (!this.isFileSystemSupported()) {
      return 0;
    }

    try {
      const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
      if (dirInfo.exists && dirInfo.isDirectory) {
        const files = await FileSystem.readDirectoryAsync(this.CACHE_DIR);
        let totalSize = 0;

        for (const file of files) {
          const fileInfo = await FileSystem.getInfoAsync(
            `${this.CACHE_DIR}${file}`
          );
          totalSize += fileInfo.size || 0;
        }

        return totalSize;
      }
      return 0;
    } catch (error) {
      console.error("📁 Error getting cache size:", error);
      return 0;
    }
  }

  /**
   * Clear old cache files if cache size exceeds limit
   */
  static async cleanupCache() {
    try {
      const cacheSize = await this.getCacheSize();

      if (cacheSize > this.MAX_CACHE_SIZE) {
        console.log("🧹 Cache size exceeded, cleaning up...");

        const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
        if (dirInfo.exists && dirInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(this.CACHE_DIR);

          // Get file metadata with timestamps
          const fileMetadata = [];
          for (const file of files) {
            const metadata = await this.getCacheMetadata(file);
            if (metadata) {
              fileMetadata.push({
                fileName: file,
                cachedAt: metadata.cachedAt,
                size: metadata.size || 0,
              });
            }
          }

          // Sort by age (oldest first)
          fileMetadata.sort((a, b) => a.cachedAt - b.cachedAt);

          // Remove oldest files until under limit
          let currentSize = cacheSize;
          for (const file of fileMetadata) {
            if (currentSize <= this.MAX_CACHE_SIZE * 0.8) break; // Remove until 80% of limit

            await this.removeFromCache(file.fileName);
            currentSize -= file.size;
            console.log(`🧹 Removed cached emote: ${file.fileName}`);
          }
        }
      }
    } catch (error) {
      console.error("🧹 Error cleaning cache:", error);
    }
  }

  /**
   * Clear all cached emotes
   */
  static async clearAllCache() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.CACHE_DIR);
        await this.init(); // Recreate directory

        // Clear metadata from AsyncStorage
        const keys = await AsyncStorage.getAllKeys();
        const emoteKeys = keys.filter((key) => key.startsWith("emote_cache_"));
        await AsyncStorage.multiRemove(emoteKeys);

        console.log("🧹 All emote cache cleared");
      }
    } catch (error) {
      console.error("🧹 Error clearing cache:", error);
    }
  }

  /**
   * Pre-cache emotes in background
   */
  static async precacheEmotes(emotes) {
    if (!this.isFileSystemSupported()) {
      console.log(
        "🖼️ Pre-caching skipped: FileSystem not supported on web platform"
      );
      return;
    }

    try {
      console.log(`🖼️ Pre-caching ${emotes.length} emotes...`);

      // Cache cleanup first
      await this.cleanupCache();

      // Cache emotes in batches to avoid overwhelming the network
      const batchSize = 5;
      for (let i = 0; i < emotes.length; i += batchSize) {
        const batch = emotes.slice(i, i + batchSize);

        const promises = batch.map((emote) => {
          // Only cache image emotes (not unicode emoji)
          if (emote.type === "streamed" && emote.url.startsWith("http")) {
            return this.getCachedImageUri(emote.url, emote.name);
          }
          return Promise.resolve();
        });

        await Promise.allSettled(promises);

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log("🖼️ Pre-caching complete");
    } catch (error) {
      console.error("🖼️ Error pre-caching emotes:", error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  static async getCacheStats() {
    if (!this.isFileSystemSupported()) {
      return {
        exists: false,
        size: 0,
        fileCount: 0,
        maxSize: this.MAX_CACHE_SIZE,
        formattedSize: "0 B (Web)",
        formattedMaxSize: this.formatBytes(this.MAX_CACHE_SIZE),
        usagePercent: 0,
        platform: "web",
      };
    }

    try {
      const cacheSize = await this.getCacheSize();
      const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);

      if (!dirInfo.exists) {
        return {
          exists: false,
          size: 0,
          fileCount: 0,
          maxSize: this.MAX_CACHE_SIZE,
          formattedSize: "0 B",
          formattedMaxSize: this.formatBytes(this.MAX_CACHE_SIZE),
          usagePercent: 0,
        };
      }

      const files = await FileSystem.readDirectoryAsync(this.CACHE_DIR);

      return {
        exists: true,
        size: cacheSize,
        fileCount: files.length,
        maxSize: this.MAX_CACHE_SIZE,
        formattedSize: this.formatBytes(cacheSize),
        formattedMaxSize: this.formatBytes(this.MAX_CACHE_SIZE),
        usagePercent: Math.round((cacheSize / this.MAX_CACHE_SIZE) * 100),
      };
    } catch (error) {
      console.error("📊 Error getting cache stats:", error);
      return {
        exists: false,
        size: 0,
        fileCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

export default ImageCache;
