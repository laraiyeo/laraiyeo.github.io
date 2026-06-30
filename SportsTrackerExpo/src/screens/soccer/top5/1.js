// Add this near the top with other constants
const DEBUG_LOGGING = true;

const logDebug = (...args) => {
  if (DEBUG_LOGGING) {
    console.log('[Top5Scoreboard]', ...args);
  }
};

// In the loadData function, add comprehensive logging:
const loadData = useCallback(
  async (filter, silent = false, background = false, force = false) => {
    const now = Date.now();
    logDebug('loadData called', { filter, silent, background, force, now });
    
    const cached = fetchCacheRef.current[filter];
    if (!force && cached) {
      const policy = getScoreboardPolicy(cached.groups ?? []);
      const cacheMs = policy.cacheMs ?? 0;
      const cacheAge = now - cached.ts;
      const canUseCache =
        cacheMs > 0 &&
        cacheAge < cacheMs &&
        !(background && policy.mode === "live");

      logDebug('Cache check', {
        filter,
        hasCache: !!cached,
        cacheAge,
        cacheMs,
        policyMode: policy.mode,
        canUseCache,
        background,
        force
      });

      if (canUseCache) {
        logDebug('Using cached data for filter:', filter);
        setGroups(cached.groups);
        setSnapshotTsMs(cached.ts);
        lastLoadedFilterRef.current = filter;
        return cached.groups;
      } else {
        logDebug('Cache expired or invalid for filter:', filter, {
          cacheAge,
          cacheMs,
          policyMode: policy.mode,
          background
        });
      }
    } else if (force) {
      logDebug('Force refresh requested, bypassing cache for filter:', filter);
    } else {
      logDebug('No cached data available for filter:', filter);
    }

    if (inFlightRef.current[filter]) {
      logDebug('Request already in flight for filter:', filter);
      return inFlightRef.current[filter];
    }

    const promise = (async () => {
      logDebug('Starting data fetch for filter:', filter);
      if (!silent) setLoading(true);
      else if (!background) setFetching(true);
      
      try {
        logDebug('Calling Top5ServiceEnhanced.getScoreboard with filter:', filter);
        const raw = await Top5ServiceEnhanced.getScoreboard(filter);
        logDebug('Raw data received from service for filter:', filter, {
          groupsCount: raw?.data?.groups?.length || 0
        });
        
        const rawGroups = Top5ServiceEnhanced.toGroups(raw);
        logDebug('Processed groups count:', rawGroups.length);
        
        const nextGroups = applyTickingSnapshot(rawGroups);
        logDebug('Applied ticking snapshot, groups:', nextGroups.length);
        
        // Apply forced league ordering
        if (Array.isArray(nextGroups) && nextGroups.length > 0) {
          const orderMap = new Map(
            FORCE_LEAGUE_ORDER.map((k, i) => [String(k), i]),
          );
          const withIdx = nextGroups.map((g, idx) => ({ g, idx }));
          const ordered = withIdx
            .slice()
            .sort((a, b) => {
              const aKey = String(a.g.leagueKey ?? a.g.league_id ?? "");
              const bKey = String(b.g.leagueKey ?? b.g.league_id ?? "");
              const ai = orderMap.has(aKey)
                ? orderMap.get(aKey)
                : 1000 + a.idx;
              const bi = orderMap.has(bKey)
                ? orderMap.get(bKey)
                : 1000 + b.idx;
              return ai - bi;
            })
            .map((x) => x.g);
          
          var orderedGroups = ordered;
          logDebug('Applied league ordering, groups:', orderedGroups.length);
        }
        
        const ts = Date.now();

        // Sort matches within groups
        const sortMatchesWithinGroup = (groupsArr) => {
          const statusWeight = (m) => {
            const code = String(m?.state?.state || "").toUpperCase();
            const short = String(m?.state?.short_name || "").toUpperCase();
            if (LIVE_SHORT_NAMES.has(short)) return 0; // live
            if (!code || ["NS", "TBA", "DELAYED", "SCHEDULED"].includes(code))
              return 1; // scheduled
            return 2; // finished/other
          };

          return groupsArr.map((g) => ({
            ...g,
            matches: (g.matches ?? []).slice().sort((a, b) => {
              const wa = statusWeight(a);
              const wb = statusWeight(b);
              if (wa !== wb) return wa - wb;
              const sa = startMsOf(a) || 0;
              const sb = startMsOf(b) || 0;
              return sa - sb || 0;
            }),
          }));
        };

        const baseGroups =
          typeof orderedGroups !== "undefined" ? orderedGroups : nextGroups;
        const sortedGroups = sortMatchesWithinGroup(baseGroups);
        logDebug('Sorted groups by match status, groups:', sortedGroups.length);

        setGroups(sortedGroups);
        setSnapshotTsMs(ts);
        lastLoadedFilterRef.current = filter;
        
        // Cache the data
        fetchCacheRef.current[filter] = {
          groups: sortedGroups,
          ts,
        };
        logDebug('Data cached for filter:', filter);

        if (filter > getTodayDateStr()) {
          setCollapsedGroups((prev) => {
            const map = { ...prev };
            nextGroups.forEach((g) => {
              if (map[g.leagueKey] === undefined) map[g.leagueKey] = true;
            });
            return map;
          });
        }

        return nextGroups;
      } catch (err) {
        logDebug('Data fetch error for filter:', filter, err);
        console.error("Top5 scoreboard fetch error:", err);
        setGroups([]);
        setSnapshotTsMs(Date.now());
        return [];
      } finally {
        setLoading(false);
        if (!background) setFetching(false);
        logDebug('loadData completed for filter:', filter);
      }
    })();

    inFlightRef.current[filter] = promise;
    try {
      return await promise;
    } finally {
      delete inFlightRef.current[filter];
    }
  },
  [applyTickingSnapshot],
);

// Add logging to the refresh function:
const onRefresh = async () => {
  logDebug('onRefresh triggered for active filter:', activeFilter);
  setRefreshing(true);
  
  // Log current cache state before clearing
  logDebug('Current cache state before refresh:', {
    hasCacheForFilter: !!fetchCacheRef.current[activeFilter],
    cacheKeys: Object.keys(fetchCacheRef.current)
  });
  
  // Explicit user refresh should bypass any short-term cache
  if (fetchCacheRef.current && fetchCacheRef.current[activeFilter]) {
    logDebug('Deleting cache for filter:', activeFilter);
    delete fetchCacheRef.current[activeFilter];
  }
  
  // Also clear AsyncStorage cache for this filter
  try {
    const cacheKey = `@top5_scoreboard_${activeFilter}`;
    logDebug('Clearing AsyncStorage cache with key:', cacheKey);
    await AsyncStorage.removeItem(cacheKey);
  } catch (e) {
    logDebug('Failed to clear AsyncStorage cache:', e);
    console.warn("Failed to clear AsyncStorage cache:", e);
  }
  
  logDebug('Calling loadData with force refresh for filter:', activeFilter);
  const fresh = await loadData(activeFilter, true, false, true);
  schedulePolling(activeFilter, fresh);
  setRefreshing(false);
  logDebug('Refresh completed for filter:', activeFilter);
};

// Add logging to the polling scheduler:
const schedulePolling = useCallback(
  (filter, latestGroups) => {
    logDebug('schedulePolling called', { filter, groupsCount: latestGroups?.length });
    
    if (!isFocusedRef.current) {
      logDebug('Not focused, skipping polling setup');
      return;
    }

    if (filter !== getTodayDateStr()) {
      logDebug('Non-today filter, clearing interval');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        currentIntervalMs.current = null;
      }
      return;
    }

    const desired = getPollingInterval(latestGroups);
    logDebug('Calculated polling interval:', desired, {
      groupsCount: latestGroups?.length
    });
    
    if (!desired) {
      logDebug('No polling interval, clearing existing');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        currentIntervalMs.current = null;
      }
      return;
    }

    if (currentIntervalMs.current === desired && intervalRef.current) {
      logDebug('Polling interval unchanged, keeping existing:', desired);
      return;
    }

    if (intervalRef.current) {
      logDebug('Clearing existing interval');
      clearInterval(intervalRef.current);
    }
    
    currentIntervalMs.current = desired;
    logDebug('Setting new polling interval:', desired);
    
    intervalRef.current = setInterval(async () => {
      logDebug('Polling interval triggered');
      const fresh = await loadData(filter, true, true);
      schedulePolling(filter, fresh);
    }, desired);
  },
  [loadData],
);

// Add logging to useFocusEffect:
useFocusEffect(
  useCallback(() => {
    logDebug('Screen focused, activeFilter:', activeFilter);
    isFocusedRef.current = true;
    
    // Always refresh when this screen regains focus
    logDebug('Forcing refresh on focus');
    loadData(activeFilter, true, true, true).then((fresh) =>
      schedulePolling(activeFilter, fresh),
    );
    
    return () => {
      logDebug('Screen losing focus');
      isFocusedRef.current = false;
      if (intervalRef.current) {
        logDebug('Clearing polling interval on unfocus');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        currentIntervalMs.current = null;
      }
    };
  }, [activeFilter, loadData, schedulePolling]),
);