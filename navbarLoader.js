fetch("navbar.html") // Ensure the path to navbar.html is correct
  .then(response => {
    if (!response.ok) {
      throw new Error(`Failed to load navbar: ${response.status}`);
    }
    return response.text();
  })
  .then(data => {
    document.getElementById("navbar-container").innerHTML = data;
  })
  .catch(err => console.error(err));
