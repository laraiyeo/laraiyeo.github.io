import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import ImageCache from "./ImageCache";

export class EmoteService {
  static STREAMED_PK_API = "https://streamed.pk/api/emotes";
  static STREAMED_PK_IMAGE_BASE = "https://streamed.pk/api/images/emote/";

  // Cache emotes for 24 hours
  static CACHE_DURATION = 24 * 60 * 60 * 1000;

  // Custom sports emotes (you can add more here)
  static CUSTOM_EMOTES = [
    {
      id: "touchdown",
      name: ":touchdown:",
      category: "sports",
      url: "🏈", // You can replace with actual image URLs
      type: "custom",
    },
    {
      id: "goal",
      name: ":goal:",
      category: "sports",
      url: "⚽",
      type: "custom",
    },
    {
      id: "dunk",
      name: ":dunk:",
      category: "sports",
      url: "🏀",
      type: "custom",
    },
    {
      id: "slapshot",
      name: ":slapshot:",
      category: "sports",
      url: "🏒",
      type: "custom",
    },
  ];

  /**
   * Get all available emotes (cached + custom)
   */
  static async getAllEmotes() {
    try {
      // Try to get cached emotes first
      let streamedEmotes = await this.getCachedEmotes();

      // If cache is empty or expired, fetch fresh data
      if (!streamedEmotes || streamedEmotes.length === 0) {
        console.log("🎭 Cache miss - fetching fresh emotes");
        streamedEmotes = await this.fetchAndCacheStreamedEmotes();
      } else {
        console.log("🎭 Cache hit - using cached emotes");
      }

      // Combine with custom emotes
      const allEmotes = [...streamedEmotes, ...this.CUSTOM_EMOTES];

      return this.categorizeEmotes(allEmotes);
    } catch (error) {
      console.error("Error getting emotes:", error);
      // Return just custom emotes if external API fails
      return this.categorizeEmotes(this.CUSTOM_EMOTES);
    }
  }

  /**
   * Fetch emotes from streamed.pk and cache them
   */
  static async fetchAndCacheStreamedEmotes() {
    try {
      const response = await fetch(this.STREAMED_PK_API);
      const emotes = await response.json();

      // Transform to our format
      const formattedEmotes = emotes.map((emote) => ({
        id: emote.id,
        name: emote.name,
        category: emote.cat?.[0] || "misc",
        url: `${this.STREAMED_PK_IMAGE_BASE}${emote.id}.webp`,
        type: "streamed",
        cached_at: Date.now(),
      }));

      // Cache in Firestore (but don't fail if permissions are missing)
      try {
        await this.cacheEmotes(formattedEmotes);
      } catch (cacheError) {
        // Only log caching errors in development
        if (__DEV__) {
          console.warn(
            "Could not cache emotes to Firestore:",
            cacheError.message
          );
        }
      }

      return formattedEmotes;
    } catch (error) {
      console.error("Error fetching streamed.pk emotes:", error);
      return [];
    }
  }

  /**
   * Cache emotes in Firestore
   */
  static async cacheEmotes(emotes) {
    try {
      const batch = [];
      const emotesRef = collection(db, "emotes");

      for (const emote of emotes) {
        await setDoc(doc(emotesRef, emote.id), emote);
      }

      console.log(`Cached ${emotes.length} emotes`);
    } catch (error) {
      // Only log caching errors in development
      if (__DEV__) {
        console.warn("Could not cache emotes to Firestore:", error.message);
      }
    }
  }

  /**
   * Get cached emotes from Firestore
   */
  static async getCachedEmotes() {
    try {
      const emotesRef = collection(db, "emotes");
      const q = query(emotesRef, where("type", "==", "streamed"));
      const snapshot = await getDocs(q);

      const cachedEmotes = snapshot.docs.map((doc) => doc.data());

      // Check if cache is still valid (24 hours)
      if (cachedEmotes.length > 0) {
        const latestCache = Math.max(
          ...cachedEmotes.map((e) => e.cached_at || 0)
        );
        const isExpired = Date.now() - latestCache > this.CACHE_DURATION;

        if (isExpired) {
          console.log("Emote cache expired");
          return [];
        }
      }

      return cachedEmotes;
    } catch (error) {
      // Only log cache retrieval errors in development
      if (__DEV__) {
        console.warn("Error getting cached emotes:", error.message);
      }
      return [];
    }
  }

  /**
   * Organize emotes by category
   */
  static categorizeEmotes(emotes) {
    const categories = {
      all: emotes,
      top: emotes.filter((e) => e.category === "top"),
      sports: emotes.filter((e) => e.category === "sports"),
      trending: emotes.filter((e) => e.category === "trending"),
      reactions: emotes.filter((e) => e.category === "reactions"),
      misc: emotes.filter(
        (e) => !["top", "sports", "trending", "reactions"].includes(e.category)
      ),
    };

    return categories;
  }

  /**
   * Search emotes by name
   */
  static searchEmotes(emotes, searchTerm) {
    if (!searchTerm) return emotes;

    const term = searchTerm.toLowerCase();
    return emotes.filter((emote) => emote.name.toLowerCase().includes(term));
  }

  /**
   * Get cached image URI for emote
   */
  static async getCachedImageUri(emote) {
    if (
      emote.type === "streamed" &&
      emote.url &&
      emote.url.startsWith("http")
    ) {
      return await ImageCache.getCachedImageUri(emote.url, emote.name);
    }
    return emote.url;
  }

  /**
   * Get all emotes with cached images
   */
  static async getAllEmotesWithCache() {
    try {
      const allEmotes = await this.getAllEmotes();

      // Cache all streamed emotes in background
      if (allEmotes.streamed?.length > 0) {
        console.log(
          `🖼️ Starting to pre-cache ${allEmotes.streamed.length} streamed emotes...`
        );
        ImageCache.precacheEmotes(allEmotes.streamed);
      }

      return allEmotes;
    } catch (error) {
      console.error("Error getting emotes with cache:", error);
      throw error;
    }
  }

  /**
   * Parse message text and replace emote names with emote objects
   * Example: "Hello :GIGACHAD: world" -> ["Hello ", {emote: emoteObj}, " world"]
   */
  static parseMessageForEmotes(messageText, availableEmotes) {
    if (!messageText || !availableEmotes?.all)
      return [{ type: "text", content: messageText }];

    const parts = [];
    let currentText = messageText;

    // Find all emote patterns :emoteName:
    const emotePattern = /:([^:\s]+):/g;
    let lastIndex = 0;
    let match;

    while ((match = emotePattern.exec(messageText)) !== null) {
      const emoteName = `:${match[1]}:`;
      const emote = availableEmotes.all.find((e) => e.name === emoteName);

      if (emote) {
        // Add text before emote
        if (match.index > lastIndex) {
          parts.push({
            type: "text",
            content: messageText.substring(lastIndex, match.index),
          });
        }

        // Add emote
        parts.push({
          type: "emote",
          content: emote,
        });

        lastIndex = match.index + match[0].length;
      }
    }

    // Add remaining text
    if (lastIndex < messageText.length) {
      parts.push({
        type: "text",
        content: messageText.substring(lastIndex),
      });
    }

    return parts.length > 0 ? parts : [{ type: "text", content: messageText }];
  }

  /**
   * Parse message for emotes with cached image URIs
   */
  static async parseMessageForEmotesWithCache(messageText, availableEmotes) {
    const parts = this.parseMessageForEmotes(messageText, availableEmotes);

    // Process emote parts to get cached URIs
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.type === "emote" && part.content) {
        // Get cached URI for the emote
        const cachedUri = await this.getCachedImageUri(part.content);
        parts[i] = {
          ...part,
          content: {
            ...part.content,
            cachedUrl: cachedUri,
          },
        };
      }
    }

    return parts;
  }

  /**
   * Add custom emote to Firestore
   */
  static async addCustomEmote(emote) {
    try {
      const emoteData = {
        ...emote,
        type: "custom",
        created_at: Date.now(),
      };

      await setDoc(doc(db, "emotes", emote.id), emoteData);
      return emoteData;
    } catch (error) {
      console.error("Error adding custom emote:", error);
      throw error;
    }
  }
}

export default EmoteService;
