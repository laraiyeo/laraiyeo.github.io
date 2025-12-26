document.addEventListener('DOMContentLoaded', function () {
  var banner = document.getElementById('siteBanner');
  var toggle = document.getElementById('bannerToggle');
  if (!banner || !toggle) return;
  toggle.addEventListener('click', function () {
    var expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', (!expanded).toString());
    banner.classList.toggle('collapsed');
  });
});
