// CS2 API Service for React Native
const API_BASE_URL = 'https://api-op.grid.gg';
const API_KEY = 'GmVoleDBy8WQlvMnMyj1vWdA0Iyzbq8oA4HfwAKr';
const CS2_TITLE_ID = '28';

// GraphQL query helper
export const graphqlQuery = async (endpoint, query, variables = {}) => {
    try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            throw new Error(data.errors[0].message);
        }

        return data.data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

// Get tournaments with pagination support
export const getTournaments = async (after = null, before = null, first = 50) => {
    const paginationParams = [];
    if (first) paginationParams.push(`first: ${first}`);
    if (after) paginationParams.push(`after: "${after}"`);
    if (before) paginationParams.push(`before: "${before}"`);
    
    const query = `
        query GetCS2Tournaments {
            tournaments(
                ${paginationParams.join(', ')},
                filter: {
                    titleId: ${CS2_TITLE_ID}
                }
            ) {
                totalCount
                pageInfo {
                    hasPreviousPage
                    hasNextPage
                    startCursor
                    endCursor
                }
                edges {
                    cursor
                    node {
                        id
                        name
                        nameShortened
                        externalLinks {
                            dataProvider {
                                name
                            }
                            externalEntity {
                                id
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query);
        return data.tournaments;
    } catch (error) {
        console.error('Error fetching tournaments:', error);
        return { totalCount: 0, edges: [], pageInfo: { hasPreviousPage: false, hasNextPage: false } };
    }
};

// Get tournament series
export const getTournamentSeries = async (tournamentId, after = null, first = 20) => {
    const paginationParams = [`first: ${first}`];
    if (after) paginationParams.push(`after: "${after}"`);
    
    const query = `
        query GetTournamentSeries($tournamentId: ID!) {
            allSeries(
                ${paginationParams.join(', ')},
                filter: {
                    titleId: ${CS2_TITLE_ID}
                    tournamentId: $tournamentId
                }
                orderBy: StartTimeScheduled
                orderDirection: DESC
            ) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    cursor
                    node {
                        id
                        startTimeScheduled
                        format {
                            name
                            nameShortened
                        }
                        teams {
                            baseInfo {
                                id
                                name
                                logoUrl
                                colorPrimary
                                colorSecondary
                            }
                            scoreAdvantage
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query, { tournamentId });
        return data.allSeries;
    } catch (error) {
        console.error('Error fetching tournament series:', error);
        return { totalCount: 0, edges: [], pageInfo: { hasNextPage: false } };
    }
};

// Get live series (matches that started recently and may still be ongoing)
export const getLiveSeries = async (first = 10) => {
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const query = `
        query GetLiveSeries {
            allSeries(
                first: ${first},
                filter: {
                    titleId: ${CS2_TITLE_ID}
                    types: ESPORTS
                    startTimeScheduled: {
                        gte: "${sixHoursAgo.toISOString()}"
                        lte: "${twoHoursLater.toISOString()}"
                    }
                }
                orderBy: StartTimeScheduled
                orderDirection: DESC
            ) {
                totalCount
                edges {
                    node {
                        id
                        startTimeScheduled
                        format {
                            name
                            nameShortened
                        }
                        tournament {
                            id
                            name
                            nameShortened
                        }
                        teams {
                            baseInfo {
                                id
                                name
                                logoUrl
                                colorPrimary
                                colorSecondary
                            }
                            scoreAdvantage
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query);
        return data.allSeries;
    } catch (error) {
        console.error('Error fetching live series:', error);
        return { totalCount: 0, edges: [] };
    }
};

// Get upcoming series (matches scheduled for the future)
export const getUpcomingSeries = async (first = 10) => {
    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const query = `
        query GetUpcomingSeries {
            allSeries(
                first: ${first},
                filter: {
                    titleId: ${CS2_TITLE_ID}
                    types: ESPORTS
                    startTimeScheduled: {
                        gte: "${now.toISOString()}"
                        lte: "${twoWeeksLater.toISOString()}"
                    }
                }
                orderBy: StartTimeScheduled
                orderDirection: ASC
            ) {
                totalCount
                edges {
                    node {
                        id
                        startTimeScheduled
                        format {
                            name
                            nameShortened
                        }
                        tournament {
                            id
                            name
                            nameShortened
                        }
                        teams {
                            baseInfo {
                                id
                                name
                                logoUrl
                                colorPrimary
                                colorSecondary
                            }
                            scoreAdvantage
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query);
        return data.allSeries;
    } catch (error) {
        console.error('Error fetching upcoming series:', error);
        return { totalCount: 0, edges: [] };
    }
};

// Get recent series (completed matches from the past)
export const getRecentSeries = async (first = 10) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const query = `
        query GetRecentSeries {
            allSeries(
                first: ${first},
                filter: {
                    titleId: ${CS2_TITLE_ID}
                    types: ESPORTS
                    startTimeScheduled: {
                        gte: "${oneWeekAgo.toISOString()}"
                        lte: "${sixHoursAgo.toISOString()}"
                    }
                }
                orderBy: StartTimeScheduled
                orderDirection: DESC
            ) {
                totalCount
                edges {
                    node {
                        id
                        startTimeScheduled
                        format {
                            name
                            nameShortened
                        }
                        tournament {
                            id
                            name
                            nameShortened
                        }
                        teams {
                            baseInfo {
                                id
                                name
                                logoUrl
                                colorPrimary
                                colorSecondary
                            }
                            scoreAdvantage
                        }
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query);
        return data.allSeries;
    } catch (error) {
        console.error('Error fetching recent series:', error);
        return { totalCount: 0, edges: [] };
    }
};

// Get match details
export const getMatchDetails = async (seriesId) => {
    const query = `
        query GetMatchDetails($seriesId: ID!) {
            series(id: $seriesId) {
                id
                startTimeScheduled
                format {
                    name
                    nameShortened
                }
                tournament {
                    id
                    name
                    nameShortened
                }
                teams {
                    baseInfo {
                        id
                        name
                        logoUrl
                        colorPrimary
                        colorSecondary
                    }
                    scoreAdvantage
                }
                externalLinks {
                    dataProvider {
                        name
                    }
                    externalEntity {
                        id
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('central-data', query, { seriesId });
        return data.series;
    } catch (error) {
        console.error('Error fetching match details:', error);
        return null;
    }
};

// Get live series state (for detailed match data)
export const getLiveSeriesState = async (seriesId) => {
    const query = `
        query GetLiveSeriesState($seriesId: ID!) {
            seriesState(id: $seriesId) {
                valid
                updatedAt
                format
                started
                finished
                teams {
                    name
                    won
                    score
                    players {
                        ... on SeriesPlayerStateCs2 {
                            id
                            name
                            participationStatus
                            kills
                            deaths
                            killAssistsGiven
                            killAssistsReceived
                            headshots
                            teamkills
                            selfkills
                            structuresDestroyed
                            structuresCaptured
                            firstKill
                        }
                        ... on SeriesPlayerStateDefault {
                            id
                            name
                            participationStatus
                            kills
                            deaths
                            killAssistsGiven
                            killAssistsReceived
                            teamkills
                            selfkills
                            structuresDestroyed
                            structuresCaptured
                            firstKill
                        }
                    }
                }
                games {
                    sequenceNumber
                    started
                    finished
                    map {
                        id
                        name
                    }
                    teams {
                        name
                        score
                        won
                    }
                }
            }
        }
    `;

    try {
        const data = await graphqlQuery('live-data-feed/series-state', query, { seriesId });
        return data.seriesState;
    } catch (error) {
        console.log('Live data not available for this series');
        return null;
    }
};