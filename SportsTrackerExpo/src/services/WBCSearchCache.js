// Shared module-level cache for WBC search data (teams + players).
// Both SearchScreen and CompareScreen import this so the fetch happens at most once
// per app session, regardless of which screen the user opens first.

import WBCService from "./WBCService";

let _cache = null; // { teams: [], players: [] }
let _pending = null; // in-flight Promise – prevents parallel duplicate fetches

/**
 * Returns a { teams, players } object from the /wbc/search endpoint.
 * The result is cached in memory after the first successful call.
 */
export async function loadWBCSearchData() {
  if (_cache) return _cache;
  if (_pending) return _pending; // re-use the in-flight request

  _pending = WBCService.getSearch()
    .then((res) => {
      _cache = {
        teams: res?.data?.teams || [],
        players: res?.data?.players || [],
      };
      _pending = null;
      return _cache;
    })
    .catch((e) => {
      _pending = null; // allow retry on next call
      throw e;
    });

  return _pending;
}

/** Call this if you ever want to force a fresh fetch. */
export function clearWBCSearchCache() {
  _cache = null;
  _pending = null;
}
