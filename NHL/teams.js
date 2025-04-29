async function fetchAndDisplayTeams() {
    try {
      const res = await fetch(`https://corsproxy.io/?url=https://api.nhle.com/stats/rest/en/team`);
      if (!res.ok) {
        throw new Error(`Failed to fetch teams: ${res.status}`);
      }
  
      const data = await res.json();
      if (!data?.data) {
        throw new Error("Unexpected API response structure");
      }
  
      const teams = data.data;
      const container = document.getElementById("gamesContainer");
      container.innerHTML = ""; // Clear previous content
  
      const list = document.createElement("ul");
  
      for (const team of teams) {
        if (team.fullName) {
          const listItem = document.createElement("li");
          listItem.textContent = team.fullName;
          list.appendChild(listItem);
        }
      }
  
      container.appendChild(list);
    } catch (err) {
      console.error("Error fetching teams:", err);
      const container = document.getElementById("gamesContainer");
      container.innerHTML = `<div>Error loading teams. Please try again later.</div>`;
    }
  }
  
  fetchAndDisplayTeams();
  