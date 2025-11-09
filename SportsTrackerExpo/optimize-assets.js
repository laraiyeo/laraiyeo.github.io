// Build Size Optimization - Asset Compression Script
const fs = require("fs");
const path = require("path");

console.log("🎬 Analyzing splash videos (largest assets found)...");

// The analysis showed splash videos are taking up ~20MB total
// Let's create a plan to optimize them

const videoAssets = [
  "dark/red/splash_video.mp4",
  "dark/green/splash_video.mp4",
  "light/red/splash_video.mp4",
  "dark/gold/splash_video.mp4",
  "light/purple/splash_video.mp4",
  "dark/purple/splash_video.mp4",
  "light/green/splash_video.mp4",
  "light/blue/splash_video.mp4",
  "light/gold/splash_video.mp4",
];

console.log("📋 Video optimization recommendations:");
console.log("");

videoAssets.forEach((video) => {
  const videoPath = path.join("assets", video);
  if (fs.existsSync(videoPath)) {
    const stats = fs.statSync(videoPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`${video}: ${sizeMB}MB`);
  }
});

console.log("");
console.log("🎯 Optimization strategies:");
console.log("1. Compress videos to lower bitrate/resolution");
console.log("2. Convert to more efficient formats (WebM, HEVC)");
console.log("3. Consider using a single video with theme overlays");
console.log("4. Use dynamic loading - only load current theme");
console.log("5. Consider replacing with static images + CSS animations");

console.log("");
console.log("💡 Quick wins:");
console.log("- Compress videos to ~500KB each (current: ~2MB each)");
console.log("- This alone would save ~15MB from the build");

// Check the large PNG file too
const largePng = "assets/33115791.png";
if (fs.existsSync(largePng)) {
  const stats = fs.statSync(largePng);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(
    `- Optimize ${largePng}: ${sizeMB}MB (compress or convert to WebP)`
  );
}

console.log("");
console.log("🏆 Expected results after optimization:");
console.log("- Current assets: ~27MB");
console.log("- After video compression: ~12MB");
console.log("- After PNG optimization: ~10MB");
console.log("- Total build size reduction: ~17MB");
