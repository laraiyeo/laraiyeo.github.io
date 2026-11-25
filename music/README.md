# SportsHeart Song Wars

A music tournament that searches Apple Music, shows artist and album artwork,
and plays Apple Music 30-second previews.

## Requirements

The page requires the `spotify-proxy` service to be running with Apple
Developer credentials configured. Visitors do not need Apple or Spotify
accounts and never log in.

Set `API_BASE` in `js/config.js` to the proxy URL. For local use, the default
is `http://localhost:3000`.

## Run locally

```bash
cd spotify-proxy
npm install
npm start

cd ../spotify-tournament
python -m http.server 8080
```

Open `http://localhost:8080`.

## Features

- Apple Music artist search with artist artwork
- Apple top-songs, with a search-based fallback
- Paginated discography browsing, de-duplicated across clean/explicit editions
- Explicit-only, clean-only, or any-version track selection
- Native 30-second preview cards: album art, title, artist with an explicit
  marker, scrubber, countdown and a play/pause button
- Card background takes the album's own `bgColor`, with text switched between
  black and white for contrast
- Previews are downloaded once and reused, so scrubbing never re-fetches
- Featured detection is credit-based: an artist named in the song title but not
  in the track's artist field is a feature; in both means a primary credit
- Knockout brackets and group stages
- Up to 16 artists, 2–16 for a bracket
- Fixed songs per artist: 10 for a knockout bracket, 8 for Group + Knockout
- Group + Knockout supports 2, 4 or 8 groups, with the top 4 of every group
  qualifying for the knockout
- Every song in a group plays the same number of matches, each against a
  different artist, and no pairing is ever repeated
- When songs are level on points across a qualification line, the tournament
  pauses and offers three ways to settle it: pick the qualifiers yourself, draw
  them at random, or play it out as 2-way and 3-way matches
- Both joint-third songs are shown on the podium

## Notes

- Catalogue responses are cached in the browser for 24 hours and on the proxy
  for 1 hour.
- Album art is used for the preview card. If a track has no preview, the card
  shows a clear "No preview available" state instead.
- The "10 random songs" scan skips single and EP releases by default, because a
  single's track lookup returns one or two songs where an album returns ten or
  more. An artist with no full releases falls back to a scan that includes
  singles, so a singles-only artist still gets songs.
- In section 3b the album list is ordered albums first, then singles, each
  newest first.
