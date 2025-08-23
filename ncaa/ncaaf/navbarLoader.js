// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

document.addEventListener("DOMContentLoaded", async () => {
  const navbarContainer = document.getElementById("navbar-container");
  if (navbarContainer) {
    try {
      const response = await fetch(convertToHttps("navbar.html"));
      const navbarHtml = await response.text();
      navbarContainer.innerHTML = navbarHtml;

      // Dynamically load the navbar script after injecting the HTML
      const script = document.createElement("script");
      script.src = "navbar.js";
      document.body.appendChild(script);
    } catch (error) {
      console.error("Failed to load navbar:", error);
    }
  }
});
