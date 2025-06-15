document.addEventListener("DOMContentLoaded", () => {
  const navbarContainer = document.getElementById("navbar-container");

  if (!navbarContainer) {
    console.error("Navbar container not found.");
    return;
  }

  // Wait for the navbar content to load
  const observer = new MutationObserver(() => {
    const navToggle = document.querySelector(".nav-toggle");
    const dropdownMenu = document.querySelector(".dropdown-menu");
    const navLinks = document.querySelectorAll(".nav-link, .dropdown-link");

    if (!navToggle || !dropdownMenu) {
      console.error("Navbar toggle or dropdown menu not found.");
      return;
    }

    // Highlight the active link
    const currentPath = window.location.pathname.split("/").pop();
    navLinks.forEach(link => {
      if (link.getAttribute("href") === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    navToggle.addEventListener("click", () => {
      const isActive = dropdownMenu.classList.toggle("active");
      dropdownMenu.setAttribute("aria-hidden", !isActive);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (!navToggle.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove("active");
        dropdownMenu.setAttribute("aria-hidden", "true");
      }
    });

    // Stop observing once the elements are found
    observer.disconnect();
  });

  observer.observe(navbarContainer, { childList: true, subtree: true });
});