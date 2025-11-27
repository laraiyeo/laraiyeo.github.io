// Utility function to ensure image URLs use HTTPS
export const ensureHttpsImageUrl = (url) => {
  if (!url || typeof url !== "string") return url;

  // Convert HTTP to HTTPS
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }

  return url;
};

// Safe image URI helper for React Native Image components
export const getSafeImageUri = (
  imageUrl,
  fallbackUrl = "https://i.imgur.com/BIC4pnO.webp"
) => {
  const safeUrl = ensureHttpsImageUrl(imageUrl) || fallbackUrl;
  return safeUrl;
};

// Build a combiner URL for ESPN images when possible. Falls back to the original href.
export const combinerUrl = (href, w = 200, h = 200) => {
  if (!href || typeof href !== "string") return href;

  try {
    if (/combiner\/i/i.test(href)) return href;

    const idx = href.indexOf("/i/");
    if (idx >= 0) {
      const imgPart = href.substring(idx); // includes leading /i/
      return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(
        imgPart
      )}&w=${w}&h=${h}`;
    }

    try {
      const u = new URL(href);
      const imgPart = u.pathname + (u.search || "");
      return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(
        imgPart
      )}&w=${w}&h=${h}`;
    } catch (e) {
      return href;
    }
  } catch (e) {
    return href;
  }
};
