/* Apple Music catalogue wrapper. All catalog calls go through the server-side
 * proxy because the Apple developer private key must never be shipped to browsers. */
(function (global) {
  "use strict";

  var CACHE_PREFIX = "st_apple_v1:";
  var CACHE_TTL = 24 * 60 * 60 * 1000;
  var inflight = {};

  function proxyBase() {
    var cfg = global.STConfig || {};
    var value = cfg.API_BASE;
    return typeof value === "string" && value.trim()
      ? value.trim().replace(/\/+$/, "")
      : "";
  }

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || Date.now() > entry.expiresAt) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return entry.value;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(key, value) {
    try {
      localStorage.setItem(
        CACHE_PREFIX + key,
        JSON.stringify({
          value: value,
          expiresAt: Date.now() + CACHE_TTL,
        }),
      );
    } catch (e) {}
  }

  function q(params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== "") {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
      }
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function artworkUrl(template, size) {
    if (!template) return "";
    return template
      .replace(/\{w\}|\{h\}/g, function (token) {
        return token === "{w}" ? String(size) : String(size);
      })
      .replace(/\/100x100/, "/" + size + "x" + size);
  }

  function normalizeArtist(resource) {
    var attributes = resource.attributes || {};
    var url = artworkUrl(attributes.artwork && attributes.artwork.url, 100);
    return {
      id: String(resource.id),
      name: attributes.name || "",
      images: url ? [{ url: url }, { url: url }, { url: url }] : [],
      genres: attributes.genreNames || [],
    };
  }

  function normalizeAlbum(resource) {
    var attributes = resource.attributes || {};
    var url = artworkUrl(attributes.artwork && attributes.artwork.url, 300);
    return {
      id: String(resource.id),
      name: attributes.name || "",
      images: url ? [{ url: url }, { url: url }, { url: url }] : [],
      release_date: attributes.releaseDate || "",
      album_type: attributes.isCompilation
        ? "compilation"
        : attributes.isSingle
          ? "single"
          : "album",
      /* "explicit" or "clean". Apple ships both editions of a release as
       * separate albums, so the picker needs this to show only one of them. */
      content_rating: attributes.contentRating || "",
      track_count: attributes.trackCount || 0,
    };
  }

  function normalizeTrack(resource) {
    var attributes = resource.attributes || {};
    var artwork = attributes.artwork || {};
    var url = artworkUrl(artwork.url, 300);
    var artistRelationships =
      (resource.relationships &&
        resource.relationships.artists &&
        resource.relationships.artists.data) ||
      [];
    var previewUrl =
      attributes.previews && attributes.previews[0]
        ? attributes.previews[0].url
        : "";
    /* The full credit string, e.g. "Drake, Future". This — not the relational
     * artists array, which Apple usually omits on song objects — is what tells
     * us whether the selected artist is a primary credit or only a feature. */
    var artistName = attributes.artistName || "";
    var primaryId =
      artistRelationships.length && artistRelationships[0].id
        ? String(artistRelationships[0].id)
        : "";
    return {
      id: String(resource.id),
      name: attributes.name || "",
      artistName: artistName,
      artistId: primaryId,
      artists: [{ id: primaryId, name: artistName }],
      album: {
        id: String(
          resource.relationships &&
            resource.relationships.albums &&
            resource.relationships.albums.data &&
            resource.relationships.albums.data[0]
            ? resource.relationships.albums.data[0].id
            : "",
        ),
        name: attributes.albumName || "",
        images: url ? [{ url: url }, { url: url }, { url: url }] : [],
      },
      preview_url: previewUrl,
      content_rating: attributes.contentRating || "clean",
      is_explicit: attributes.contentRating === "explicit",
      /* Artwork palette + release metadata, so the preview card can take on the
       * album's own colour instead of a generic dark panel. */
      bg_color: artwork.bgColor || "",
      text_colors: [
        artwork.textColor1,
        artwork.textColor2,
        artwork.textColor3,
        artwork.textColor4,
      ].filter(Boolean),
      release_date: attributes.releaseDate || "",
      /* "Music" is a container label rather than a genre, so it is dropped. */
      genres: (attributes.genreNames || []).filter(function (genre) {
        return genre && String(genre).toLowerCase() !== "music";
      }),
      duration_ms: attributes.durationInMillis || 0,
      external_urls: attributes.url ? { appleMusic: attributes.url } : {},
    };
  }

  function request(path) {
    var base = proxyBase();
    if (!base)
      return Promise.reject(new Error("Apple Music proxy is not configured."));
    var cached = cacheGet(path);
    if (cached) return Promise.resolve(cached);
    if (inflight[path]) return inflight[path];

    inflight[path] = fetch(base + path)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (!res.ok)
              throw new Error(
                body && body.error ? body.error : "Apple Music request failed.",
              );
            cacheSet(path, body);
            return body;
          });
      })
      .finally(function () {
        delete inflight[path];
      });
    return inflight[path];
  }

  function searchArtists(query, limit) {
    return request(
      "/search" + q({ term: query, types: "artists", limit: limit || 5 }),
    ).then(function (body) {
      var resources =
        body.results && body.results.artists
          ? body.results.artists.data || []
          : body.data || [];
      return { artists: { items: resources.map(normalizeArtist) } };
    });
  }

  function getArtist(artistId) {
    return request("/artists/" + encodeURIComponent(artistId)).then(
      function (body) {
        var resource = body.data && body.data[0];
        return resource ? normalizeArtist(resource) : null;
      },
    );
  }

  function getTopSongs(artistId, limit) {
    return request(
      "/artists/" +
        encodeURIComponent(artistId) +
        "/top-songs" +
        q({ limit: limit || 25 }),
    ).then(function (body) {
      var resources = body.data || [];
      return {
        tracks: {
          items: resources.map(function (resource) {
            var track = normalizeTrack(resource);
            /* This endpoint is queried per-artist, so the requested id is the
             * authoritative primary artist even when Apple omits relationships. */
            track.artistId = String(artistId);
            track.artists = [{ id: String(artistId), name: track.artistName }];
            return track;
          }),
        },
      };
    });
  }

  function searchTracks(query, limit, offset) {
    var clean = String(query)
      .replace(/^artist:"|"$|^artist:/g, "")
      .replace(/"/g, "");
    return request(
      "/search" +
        q({
          term: clean,
          types: "songs",
          limit: limit || 25,
        }),
    ).then(function (body) {
      var resources =
        body.results && body.results.songs
          ? body.results.songs.data || []
          : body.data || [];
      return { tracks: { items: resources.map(normalizeTrack) } };
    });
  }

  function searchArtistsByGenre(genres, limit) {
    var list = []
      .concat(genres || [])
      .filter(Boolean)
      .slice(0, 2);
    if (!list.length) return Promise.resolve({ artists: { items: [] } });
    return searchArtists(list.join(" "), limit || 5);
  }

  /* Apple ships the explicit and clean editions of a release as two separate
   * albums with the same name and release date. Both must survive the page
   * dedupe so the caller can choose which edition to show — collapsing them
   * here would pick one arbitrarily. */
  function albumEditionKey(album) {
    return (
      String(album.name).trim().toLowerCase() +
      "|" +
      String(album.release_date).slice(0, 10) +
      "|" +
      String(album.content_rating || "").toLowerCase()
    );
  }

  /* One edition per release, matching `contentMode` ("explicit", "clean" or
   * "any"). A missing rating counts as clean, which is how Apple reports an
   * unrated release. When nothing matches the requested mode the release is
   * dropped, so "explicit only" really means explicit only. */
  function pickEditions(albums, contentMode) {
    var mode =
      contentMode === "explicit" || contentMode === "clean"
        ? contentMode
        : "any";
    var byRelease = {};
    var order = [];

    function rating(album) {
      return String(album.content_rating || "").toLowerCase() === "explicit"
        ? "explicit"
        : "clean";
    }

    (albums || []).forEach(function (album) {
      if (!album) return;
      var key =
        String(album.name).trim().toLowerCase() +
        "|" +
        String(album.release_date).slice(0, 10);
      var existing = byRelease[key];
      if (!existing) {
        byRelease[key] = album;
        order.push(key);
        return;
      }
      if (mode === "any") {
        /* Prefer the explicit edition so the picker is deterministic. */
        if (rating(album) === "explicit" && rating(existing) !== "explicit") {
          byRelease[key] = album;
        }
        return;
      }
      var existingMatches = rating(existing) === mode;
      if (!existingMatches && rating(album) === mode) byRelease[key] = album;
    });

    return order
      .map(function (key) {
        return byRelease[key];
      })
      .filter(function (album) {
        return mode === "any" || rating(album) === mode;
      });
  }

  function getArtistAlbums(artistId, includeGroups, offset, limit, contentMode) {
    return request(
      "/artists/" +
        encodeURIComponent(artistId) +
        "/albums" +
        q({ limit: limit || 100, offset: offset || 0 }),
    ).then(function (body) {
      var resources = body.data || [];
      var items = resources.map(normalizeAlbum).filter(function (album) {
        if (!includeGroups) return true;
        var groups = String(includeGroups).split(",");
        if (groups.indexOf("album") !== -1 && album.album_type === "album")
          return true;
        if (groups.indexOf("single") !== -1 && album.album_type === "single")
          return true;
        if (
          groups.indexOf("compilation") !== -1 &&
          album.album_type === "compilation"
        )
          return true;
        return false;
      });
      var seen = {};
      var deduplicated = [];
      items.forEach(function (album) {
        var key = albumEditionKey(album);
        if (seen[key]) return;
        seen[key] = true;
        deduplicated.push(album);
      });
      /* `hasMore` must describe the RAW page size, not the deduplicated one.
       * Apple returns clean and explicit editions of the same release, so a
       * full page can shrink well below `limit` after dedup — and a pager that
       * treats that as "last page" would silently truncate the discography. */
      var rawCount = resources.length;
      var size = limit || 100;
      return {
        items: contentMode ? pickEditions(deduplicated, contentMode) : deduplicated,
        limit: size,
        total: deduplicated.length,
        hasMore: rawCount >= size,
      };
    });
  }

  function getAllArtistAlbums(artistId, includeGroups, maxPages, contentMode) {
    var pageSize = 25;
    var all = [];
    var nextOffset = 0;

    function page() {
      return getArtistAlbums(
        artistId,
        includeGroups,
        nextOffset,
        pageSize,
        contentMode,
      )
        .then(function (res) {
          var items = res.items || [];
          all = all.concat(items);
          /* Keep paging while Apple says the raw page was full, even if dedup
           * shrank it — otherwise a page of duplicate editions ends the scan. */
          var more = res.hasMore === true;
          if (!more || all.length >= pageSize * (maxPages || 10)) return all;
          nextOffset += pageSize;
          return page();
        })
        .catch(function () {
          return all;
        });
    }

    return page();
  }

  function getAlbumTracks(albumId) {
    return request("/albums/" + encodeURIComponent(albumId) + "/tracks").then(
      function (body) {
        return { items: (body.data || []).map(normalizeTrack) };
      },
    );
  }

  function getAlbum(albumId) {
    return request("/artists/-/albums/" + encodeURIComponent(albumId)).catch(
      function () {
        return null;
      },
    );
  }

  function getMe() {
    return Promise.resolve(null);
  }

  function get(path) {
    return request(path);
  }

  global.STSpotify = {
    searchArtists: searchArtists,
    searchArtistsByGenre: searchArtistsByGenre,
    searchTracks: searchTracks,
    getTopSongs: getTopSongs,
    getMe: getMe,
    getArtist: getArtist,
    getArtistAlbums: getArtistAlbums,
    getAllArtistAlbums: getAllArtistAlbums,
    pickEditions: pickEditions,
    getAlbum: getAlbum,
    getAlbumTracks: getAlbumTracks,
    get: get,
    isPublic: function () {
      return !!proxyBase();
    },
    proxyBase: proxyBase,
  };
})(window);
