// Quick local test to mirror sanitization applied in server.js
const sampleDrive = {
  plays: [
    {
      id: "p1",
      participants: [
        {
          athlete: {
            id: "4429096",
            uid: "s:20~l:28~a:4429096",
            guid: "cf0a37e4-de10-3077-b71b-0f06a27d0ff1",
            lastName: "Corum",
            displayName: "Blake Corum",
            links: [{ rel: ["playercard"], href: "https://..." }],
            headshot: { href: "https://..." },
            jersey: "22",
            position: { abbreviation: "RB" },
            team: { abbreviation: "LAR" },
            collegeAthlete: { $ref: "http://..." },
            status: { id: "1", name: "Active" },
          },
          type: "rusher",
          playStatistics: { $ref: "..." },
        },
        {
          athlete: {
            id: "3917016",
            uid: "s:20~l:28~a:3917016",
            guid: "d060df7e-a01e-a561-3e60-78ca3d75525f",
            lastName: "Gipson",
            displayName: "Trevis Gipson",
            links: [{ rel: ["playercard"], href: "https://..." }],
            headshot: { href: "https://..." },
            jersey: "52",
            position: { abbreviation: "LB" },
            team: { abbreviation: "CAR" },
            collegeAthlete: { $ref: "http://..." },
            status: { id: "1", name: "Active" },
          },
          type: "tackler",
          stats: [],
        },
        {
          athlete: {
            id: "4360859",
            uid: "s:20~l:28~a:4360859",
            guid: "ef971a32-184d-aa70-c7e6-f0bbfd336132",
            lastName: "Dedich",
            displayName: "Justin Dedich",
            links: [{ rel: ["playercard"], href: "https://..." }],
            headshot: { href: "https://..." },
            jersey: "67",
            position: { abbreviation: "G" },
            team: { abbreviation: "LAR" },
            collegeAthlete: { $ref: "http://..." },
            status: { id: "1", name: "Active" },
          },
          playStatistics: { $ref: "..." },
          type: "penalized",
          stats: [],
        },
      ],
      start: { yardLine: 81 },
      end: { yardLine: 71 },
    },
  ],
  type: { id: "8" },
  start: { yardLine: 81 },
};

function sanitizeDrive(lastDrive, dataCurrent) {
  const plays = lastDrive.plays || [];
  const driveOut = {};
  driveOut.plays = plays.map((pl) => {
    const {
      id,
      sequenceNumber,
      awayScore,
      homeScore,
      scoringPlay,
      priority,
      modified,
      wallClock,
      teamParticipants,
      ...rest
    } = pl || {};
    const clean = rest || {};
    if (Array.isArray(clean.participants)) {
      clean.participants = clean.participants.map((p) => {
        if (!p || typeof p !== "object") return p;
        const np = Object.assign({}, p);
        if (np.playStatistics) delete np.playStatistics;
        if (np.athlete && typeof np.athlete === "object") {
          const a = Object.assign({}, np.athlete);
          if (a.links) delete a.links;
          if (a.headshot) delete a.headshot;
          if (a.status) delete a.status;
          if (a.collegeAthlete) delete a.collegeAthlete;
          if (a.uid) delete a.uid;
          if (a.guid) delete a.guid;
          np.athlete = a;
        }
        return np;
      });
    }
    return clean;
  });

  // compute allStart
  const playsForAll = plays;
  driveOut.allStart = playsForAll
    .filter((pl) => {
      const tid = pl?.type?.id ?? null;
      const sid = tid == null ? null : String(tid);
      return sid !== "53" && sid !== "52";
    })
    .map((pl) => pl?.start?.yardLine ?? null);

  // choose start yardLine using same rule
  const currentTypeId = String(
    dataCurrent?.type?.id || lastDrive?.type?.id || ""
  );
  const firstAll =
    (driveOut.allStart &&
      driveOut.allStart.length > 0 &&
      driveOut.allStart[0]) ||
    null;
  if (currentTypeId === "53" || currentTypeId === "52") {
    const directY =
      dataCurrent?.start?.yardLine ?? lastDrive?.start?.yardLine ?? null;
    if (directY != null)
      driveOut.start = { ...(driveOut.start || {}), yardLine: directY };
  } else if (firstAll != null) {
    driveOut.start = { ...(driveOut.start || {}), yardLine: firstAll };
  }

  return driveOut;
}

const out = sanitizeDrive(sampleDrive, sampleDrive);
console.log(JSON.stringify(out, null, 2));
