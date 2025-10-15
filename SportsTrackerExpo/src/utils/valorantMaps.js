// Map configuration data for Valorant maps
// Contains coordinate transformation parameters to convert API coordinates to screen positions

export const VALORANT_MAPS = {
  // Lotus
  '/Game/Maps/Jam/Jam': {
    uuid: '2fe4ed3a-450a-948b-6d6b-e89a78e680a9',
    displayName: 'Lotus',
    displayIcon: 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png',
    mapUrl: '/Game/Maps/Jam/Jam',
    xMultiplier: 0.000072, // 72e-6
    yMultiplier: -0.000072, // -.000072
    xScalarToAdd: 0.454789,
    yScalarToAdd: 0.917752,
    marginTop: 570,
    marginRight: 80,
    rotate: 0,
  },

  // Abyss
  '/Game/Maps/Infinity/Infinity': {
    uuid: '224b0a95-48b9-f703-1bd8-67aca101a61f',
    displayName: 'Abyss',
    displayIcon: 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/splash.png',
    mapUrl: '/Game/Maps/Infinity/Infinity',
    xMultiplier: 0.000081, // 81e-6
    yMultiplier: -0.000081, // -.000081
    xScalarToAdd: 0.5,
    yScalarToAdd: 0.5,
    marginBottom: 30,
    marginLeft: 30,
    rotate: 90,
  },

  // Haven
  '/Game/Maps/Triad/Triad': {
    uuid: '2bee0dc9-4ffe-519b-1cbd-7fbe763a6047',
    displayName: 'Haven',
    displayIcon: 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/splash.png',
    mapUrl: '/Game/Maps/Triad/Triad',
    xMultiplier: 0.000075, // 75e-6
    yMultiplier: -0.000075, // -.000075
    xScalarToAdd: 1.09345,
    yScalarToAdd: 0.642728,
    marginTop: 830,
    marginRight: 180,
    rotate: 90,
  },

  // Bind
  '/Game/Maps/Duality/Duality': {
    uuid: '2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba',
    displayName: 'Bind',
    displayIcon: 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/splash.png',
    mapUrl: '/Game/Maps/Duality/Duality',
    xMultiplier: 0.000059, // 59e-6
    yMultiplier: -0.000059, // -.000059
    xScalarToAdd: 0.576941,
    yScalarToAdd: 0.967566,
    marginTop: 640,
    marginRight: -95,
    rotate: 0,
  },

  // Ascent
  '/Game/Maps/Ascent/Ascent': {
    uuid: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319',
    displayName: 'Ascent',
    displayIcon: 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/splash.png',
    mapUrl: '/Game/Maps/Ascent/Ascent',
    xMultiplier: 0.00007, // 7e-5
    yMultiplier: -0.00007, // -.00007
    xScalarToAdd: 0.813895,
    yScalarToAdd: 0.573242,
    marginTop: 425,
    marginRight: 80,
    rotate: 90,
  },

  // Icebox
  '/Game/Maps/Port/Port': {
    uuid: 'e2ad5c54-4114-a870-9641-8ea21279579a',
    displayName: 'Icebox',
    displayIcon: 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/splash.png',
    mapUrl: '/Game/Maps/Port/Port',
    xMultiplier: 0.000072, // 72e-6
    yMultiplier: -0.000072, // -.000072
    xScalarToAdd: 0.460214,
    yScalarToAdd: 0.304687,
    marginTop: 75,
    marginRight: 310,
    rotate: 270,
  },

  // Breeze
  '/Game/Maps/Foxtrot/Foxtrot': {
    uuid: '2fb9a4fd-47b8-4e7d-a969-74b4046ebd53',
    displayName: 'Breeze',
    displayIcon: 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/splash.png',
    mapUrl: '/Game/Maps/Foxtrot/Foxtrot',
    xMultiplier: 0.00007, // 7e-5
    yMultiplier: -0.00007, // -.00007
    xScalarToAdd: 0.465123,
    yScalarToAdd: 0.833078,
    marginTop: 460,
    marginRight: 80,
    rotate: 0,
  },

  // Split
  '/Game/Maps/Bonsai/Bonsai': {
    uuid: 'd960549e-485c-e861-8d71-aa9d1aed12a2',
    displayName: 'Split',
    displayIcon: 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/splash.png',
    mapUrl: '/Game/Maps/Bonsai/Bonsai',
    xMultiplier: 0.000078, // 78e-6
    yMultiplier: -0.000078, // -.000078
    xScalarToAdd: 0.842188,
    yScalarToAdd: 0.697578,
    marginTop: 460,
    marginRight: 260,
    rotate: 90,
  },

  // Pearl
  '/Game/Maps/Pitt/Pitt': {
    uuid: 'fd267378-4d1d-484f-ff52-77821ed10dc2',
    displayName: 'Pearl',
    displayIcon: 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/splash.png',
    mapUrl: '/Game/Maps/Pitt/Pitt',
    xMultiplier: 0.000078, // 78e-6
    yMultiplier: -0.000078, // -.000078
    xScalarToAdd: 0.480469,
    yScalarToAdd: 0.916016,
    marginTop: 575,
    marginRight: 45,
    rotate: 0,
  },

  // Fracture
  '/Game/Maps/Canyon/Canyon': {
    uuid: 'b529448b-4d60-346e-e89e-00a4c527a405',
    displayName: 'Fracture',
    displayIcon: 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/splash.png',
    mapUrl: '/Game/Maps/Canyon/Canyon',
    xMultiplier: 0.000078, // 78e-6
    yMultiplier: -0.000078, // -.000078
    xScalarToAdd: 0.556952,
    yScalarToAdd: 1.155886,
    marginTop: 920,
    marginRight: -55,
    rotate: 0,
  },

  // Sunset
  '/Game/Maps/Juliett/Juliett': {
    uuid: '92584fbe-486a-b1b2-9faa-39b0f486b498',
    displayName: 'Sunset',
    displayIcon: 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/splash.png',
    mapUrl: '/Game/Maps/Juliett/Juliett',
    xMultiplier: 0.000078, // 78e-6
    yMultiplier: -0.000078, // -.000078
    xScalarToAdd: 0.5,
    yScalarToAdd: 0.515625,
    marginTop: -5,
    marginRight: 30,
    rotate: 0,
  },

  // Corrode
  '/Game/Maps/Rook/Rook': {
    uuid: '1c18ab1f-420d-0d8b-71d0-77ad3c439115',
    displayName: 'Corrode',
    displayIcon: 'https://media.valorant-api.com/maps/1c18ab1f-420d-0d8b-71d0-77ad3c439115/displayicon.png',
    splash: 'https://media.valorant-api.com/maps/1c18ab1f-420d-0d8b-71d0-77ad3c439115/splash.png',
    mapUrl: '/Game/Maps/Rook/Rook',
    xMultiplier: 0.00007, // 7e-5
    yMultiplier: -0.00007, // -.00007
    xScalarToAdd: 0.526158,
    yScalarToAdd: 0.5,
    marginTop: 10,
    marginLeft: 20,
    rotate: 90,
  },
};

// Helper function to get map configuration
export const getMapConfig = (mapUrl) => {
  return VALORANT_MAPS[mapUrl] || null;
};

// Helper function to get map config by UUID
export const getMapConfigByUuid = (uuid) => {
  return Object.values(VALORANT_MAPS).find(map => map.uuid === uuid) || null;
};

// Helper function to get map config by display name
export const getMapConfigByName = (displayName) => {
  if (!displayName) return null;
  
  // Normalize the name for comparison (case insensitive, handle common variations)
  const normalizedName = displayName.toLowerCase().trim();
  
  return Object.values(VALORANT_MAPS).find(map => 
    map.displayName.toLowerCase() === normalizedName ||
    map.displayName.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(map.displayName.toLowerCase())
  ) || null;
};