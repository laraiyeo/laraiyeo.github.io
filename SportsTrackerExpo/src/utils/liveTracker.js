// Utility to build live-tracker widget URLs
const DEFAULT_PROFILE = "1gheey76n2szh3n14w1g";

function buildLiveTrackerUrl(
  uuid,
  profile = DEFAULT_PROFILE,
  lang = "en",
  mode = "3d",
  sport = "football"
) {
  if (!uuid) return null;
  const safeProfile = encodeURIComponent(profile);
  const safeUuid = encodeURIComponent(uuid);
  const base = `https://widgets.thesports01.com/${lang}/${mode}/${sport}`;
  return `${base}?profile=${safeProfile}&uuid=${safeUuid}&audio=1&sideline_color=rgba%280%2C0%2C0%2C1%29`;
}

function buildWrapperUrl(
  uuid,
  wrapperBase = "https://sportsheart.ca/widgets/livetracker.html",
  profile = DEFAULT_PROFILE,
  lang = "en",
  mode = "3d"
) {
  if (!uuid) return wrapperBase;
  const u = encodeURIComponent(uuid);
  const p = encodeURIComponent(profile);
  return `${wrapperBase}?id=${u}&profile=${p}&lang=${encodeURIComponent(
    lang
  )}&mode=${encodeURIComponent(mode)}`;
}

export { buildLiveTrackerUrl, buildWrapperUrl, DEFAULT_PROFILE };
