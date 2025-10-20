// Utility function to ensure image URLs use HTTPS
export const ensureHttpsImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  
  // Convert HTTP to HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  
  return url;
};

// Safe image URI helper for React Native Image components
export const getSafeImageUri = (imageUrl, fallbackUrl = 'https://i.imgur.com/BIC4pnO.webp') => {
  const safeUrl = ensureHttpsImageUrl(imageUrl) || fallbackUrl;
  return safeUrl;
};