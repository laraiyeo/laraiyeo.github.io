// Valorant API Service using rib.gg API
import { BaseCacheService } from './BaseCacheService';

const RIB_API_BASE_URL = 'https://corsproxy.io/?url=https://be-prod.rib.gg/v1';
const RIB_NEXT_BASE_URL = 'https://corsproxy.io/?url=https://www.rib.gg/_next/data/BjlbvsvhOs341OfXajJWv/en';

class ValorantService extends BaseCacheService {
  // Smart live event detection for Valorant
  static hasLiveEvents(data) {
    try {
      const events = data?.data || [];
      return events.some(event => {
        const status = event?.status?.toLowerCase();
        return status === 'live' || 
               status === 'ongoing' || 
               event?.live === true;
      });
    } catch (error) {
      console.error('ValorantService: Error detecting live events', error);
      return false;
    }
  }

  static getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data)) {
        return 'live';
      }
      
      if (context?.includes('tournament') || context?.includes('teams') || context?.includes('team')) {
        return 'static';
      }
      
      // Check if events are scheduled or finished
      const events = data?.data || [];
      const hasScheduled = events.some(event => 
        event?.status?.toLowerCase() === 'scheduled' || 
        event?.status?.toLowerCase() === 'upcoming'
      );
      const hasFinished = events.some(event => 
        event?.status?.toLowerCase() === 'completed' ||
        event?.status?.toLowerCase() === 'finished'
      );
      
      if (hasScheduled && !hasFinished) return 'scheduled';
      if (hasFinished && !hasScheduled) return 'finished';
      
      return 'scheduled'; // Default for mixed or unknown
    } catch (error) {
      console.error('ValorantService: Error determining data type', error);
      return 'scheduled';
    }
  }
}

// Generic API call helper
export const ribApiCall = async (endpoint, options = {}) => {
    try {
        const url = `${RIB_API_BASE_URL}${endpoint}`;
        const headers = {
            ...ValorantService.getBrowserHeaders(),
            'Content-Type': 'application/json',
            // Add any required headers for rib.gg API here
        };
        
        const response = await fetch(url, {
            method: 'GET',
            headers,
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Rib.gg API Error:', error);
        throw error;
    }
};

// Generic API call helper for Next.js data endpoints
export const ribNextApiCall = async (endpoint, params = {}, options = {}) => {
    try {
        const queryString = Object.keys(params).length > 0 
            ? '?' + Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')
            : '';
        const url = `${RIB_NEXT_BASE_URL}${endpoint}.json${queryString}`;
        
        const headers = {
            ...ValorantService.getBrowserHeaders(),
            'Content-Type': 'application/json',
        };
        
        const response = await fetch(url, {
            method: 'GET',
            headers,
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Rib.gg Next API Error:', error);
        throw error;
    }
};

// Get events with filtering
export const getEvents = async (minStartDate = null, maxStartDate = null, take = 100) => {
    try {
        let endpoint = `/events?take=${take}`;
        
        if (minStartDate) {
            endpoint += `&minStartDate=${encodeURIComponent(minStartDate)}`;
        }
        
        if (maxStartDate) {
            endpoint += `&maxStartDate=${encodeURIComponent(maxStartDate)}`;
        }

        const data = await ribApiCall(endpoint);
        return data;
    } catch (error) {
        console.error('Error fetching events:', error);
        throw error;
    }
};

// Get live events
export const getLiveEvents = async (take = 20) => {
    const cacheKey = `valorant_live_events_${take}`;
    return ValorantService.getCachedData(cacheKey, async () => {
        // Get current events and filter for live ones
        const now = new Date();
        const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
        const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day ahead
        
        const data = await ribApiCall(
            `/events?minStartDate=${encodeURIComponent(pastDate.toISOString())}&maxStartDate=${encodeURIComponent(futureDate.toISOString())}&take=${take * 3}`
        );
        
        // Filter for live events on the client side
        if (data.data) {
            const liveEvents = data.data.filter(event => event.live === true);
            return {
                ...data,
                data: liveEvents.slice(0, take)
            };
        }
        
        return data;
    }, 'live');
};

// Get recent events (completed)
export const getRecentEvents = async (take = 20) => {
    try {
        const now = new Date();
        const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        
        const data = await ribApiCall(
            `/events?maxEndDate=${encodeURIComponent(now.toISOString())}&minEndDate=${encodeURIComponent(pastDate.toISOString())}&take=${take}`
        );
        
        // Filter for completed events (not live)
        if (data.data) {
            const completedEvents = data.data.filter(event => {
                const endDate = new Date(event.endDate);
                return endDate < now && event.live === false;
            });
            return {
                ...data,
                data: completedEvents.slice(0, take)
            };
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching recent events:', error);
        throw error;
    }
};

// Get upcoming events
export const getUpcomingEvents = async (take = 20) => {
    try {
        const now = new Date();
        const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
        
        const data = await ribApiCall(
            `/events?minStartDate=${encodeURIComponent(now.toISOString())}&maxStartDate=${encodeURIComponent(futureDate.toISOString())}&take=${take}`
        );
        
        // Filter for upcoming events (not live, start date in future)
        if (data.data) {
            const upcomingEvents = data.data.filter(event => {
                const startDate = new Date(event.startDate);
                return startDate > now && event.live === false;
            });
            return {
                ...data,
                data: upcomingEvents.slice(0, take)
            };
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching upcoming events:', error);
        throw error;
    }
};

// Get specific event details
export const getEventDetails = async (eventId) => {
    try {
        const data = await ribNextApiCall(`/events/${eventId}`, { eventId });
        // The Next.js API returns data in pageProps.event structure
        if (data.pageProps && data.pageProps.event) {
            return data.pageProps.event;
        }
        return data;
    } catch (error) {
        console.error('Error fetching event details:', error);
        throw error;
    }
};

// Get event matches/series
export const getEventMatches = async (eventId) => {
    try {
        const data = await ribApiCall(`/series?eventId=${eventId}`);
        return data;
    } catch (error) {
        console.error('Error fetching event matches:', error);
        throw error;
    }
};

// Get teams for an event
export const getEventTeams = async (eventId) => {
    try {
        const data = await ribApiCall(`/events/teams-and-players?eventId=${eventId}`);
        return data;
    } catch (error) {
        console.error('Error fetching event teams:', error);
        throw error;
    }
};

// Get series details
export const getSeriesDetails = async (seriesId) => {
    try {
        const data = await ribNextApiCall(`/series/${seriesId}`, { seriesId });
        // The Next.js API returns data in pageProps.series structure
        if (data.pageProps && data.pageProps.series) {
            return data.pageProps.series;
        }
        return data;
    } catch (error) {
        console.error('Error fetching series details:', error);
        throw error;
    }
};

// Search functionality
export const searchEvents = async (query, take = 20) => {
    try {
        const data = await ribApiCall(`/search?query=${encodeURIComponent(query)}`);
        return data;
    } catch (error) {
        console.error('Error searching events:', error);
        throw error;
    }
};

// Get teams
export const getTeams = async (take = 100) => {
    try {
        const data = await ribApiCall(`/teams?take=${take}`);
        return data;
    } catch (error) {
        console.error('Error fetching teams:', error);
        throw error;
    }
};

// Get team details
export const getTeamDetails = async (teamId) => {
    try {
        const data = await ribApiCall(`/teams/${teamId}`);
        return data;
    } catch (error) {
        console.error('Error fetching team details:', error);
        throw error;
    }
};

// Get head-to-head between teams
export const getTeamHeadToHead = async (team1Id, team2Id) => {
    try {
        const data = await ribApiCall(`/teams/${team1Id}/head-to-head/${team2Id}`);
        return data;
    } catch (error) {
        console.error('Error fetching head-to-head:', error);
        throw error;
    }
};

// Helper function to format dates for API calls
export const formatDateForAPI = (date) => {
    return date.toISOString();
};

// Helper function to get today's date range
export const getTodayDateRange = () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    return {
        start: formatDateForAPI(startOfDay),
        end: formatDateForAPI(endOfDay)
    };
};

// Helper function to get this week's date range
export const getWeekDateRange = () => {
    const now = new Date();
    const startOfWeek = new Date(now.getTime() - (now.getDay() * 24 * 60 * 60 * 1000));
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    
    return {
        start: formatDateForAPI(startOfWeek),
        end: formatDateForAPI(endOfWeek)
    };
};

// Helper function to format date range (e.g., "Sep 12 - Oct 5")
export const formatEventDateRange = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const formatOptions = { month: 'short', day: 'numeric' };
    const startFormatted = start.toLocaleDateString('en-US', formatOptions);
    const endFormatted = end.toLocaleDateString('en-US', formatOptions);
    
    // If same month and day, just show one date
    if (startFormatted === endFormatted) {
        return startFormatted;
    }
    
    return `${startFormatted} - ${endFormatted}`;
};

// Helper function to format prize pool with suffix (e.g., "$2.25M")
export const formatPrizePool = (amount, currency = 'USD') => {
    if (!amount || amount === 0) return null;
    
    // Map currency codes to symbols
    const currencySymbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'KRW': '₩',
        'INR': '₹',
        'CAD': 'C$',
        'AUD': 'A$',
        'CHF': '₣',
        'SEK': 'kr',
        'NOK': 'kr',
        'DKK': 'kr',
        'PLN': 'zł',
        'CZK': 'Kč',
        'HUF': 'Ft',
        'RUB': '₽',
        'BRL': 'R$',
        'MXN': 'MX$',
        'SGD': 'S$',
        'HKD': 'HK$',
        'TWD': 'NT$',
        'THB': '฿',
        'TRY': '₺'
    };
    
    const currencySymbol = currencySymbols[currency] || currency;
    
    if (amount >= 1000000) {
        const millions = (amount / 1000000).toFixed(2).replace(/\.?0+$/, '');
        return `${currencySymbol}${millions}M`;
    } else if (amount >= 1000) {
        const thousands = (amount / 1000).toFixed(1).replace(/\.?0+$/, '');
        return `${currencySymbol}${thousands}K`;
    } else {
        return `${currencySymbol}${amount}`;
    }
};

// Get discover events filtered by specific criteria
export const getDiscoverEvents = async (take = 1000) => {
    try {
        // Get all events to work with
        const data = await ribApiCall(`/events?minStartDate=2025-01-01T00%3A00%3A00.000Z&take=${take}`);
        
        if (!data.data) {
            return {
                completed: [],
                upcoming: [],
                allCompleted: [],
                allUpcoming: [],
                meta: data.meta || { start: 0, results: 0, total: 0 }
            };
        }
        
        // Filter events based on new criteria:
        // 1. Only events with parent: true
        // 2. Divisions array doesn't include "UNI" or "T3"
        // 3. Start to end date isn't more than 6 months in length
        const filteredEvents = data.data.filter(event => {
            // Must be a parent event
            if (!event.parent) return false;
            
            // Check divisions - exclude if contains UNI or T3
            if (event.divisions && Array.isArray(event.divisions)) {
                if (event.divisions.includes('UNI') || event.divisions.includes('T3')) {
                    return false;
                }
            }

            if (event.childLabel !== null) return false;
            
            // Check duration - must not exceed 6 months
            if (event.startDate && event.endDate) {
                const startDate = new Date(event.startDate);
                const endDate = new Date(event.endDate);
                const diffInMs = endDate - startDate;
                const sixMonthsInMs = 6 * 30 * 24 * 60 * 60 * 1000; // Approximate 6 months
                
                if (diffInMs > sixMonthsInMs) {
                    return false;
                }
            }
            
            return true;
        });
        
        const now = new Date();
        
        // Separate into live, completed, and upcoming
        const live = filteredEvents.filter(event => {
            if (!event.startDate || !event.endDate) return false;
            const startDate = new Date(event.startDate);
            const endDate = new Date(event.endDate);
            return startDate <= now && endDate >= now;
        }).sort((a, b) => (a.rank || 999) - (b.rank || 999)); // Sort by rank (lower is better)
        
        const completed = filteredEvents.filter(event => {
            if (!event.endDate) return false;
            const endDate = new Date(event.endDate);
            return endDate < now;
        }).sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
        
        const upcoming = filteredEvents.filter(event => {
            if (!event.startDate) return false;
            const startDate = new Date(event.startDate);
            return startDate > now;
        }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        return {
            live: live,
            completed: completed.slice(0, 5), // Show only 5 on main screen
            upcoming: upcoming.slice(0, 5), // Show only 5 on main screen
            allCompleted: completed, // Full list for modal
            allUpcoming: upcoming, // Full list for modal
            meta: {
                ...data.meta,
                filteredResults: filteredEvents.length,
                liveCount: live.length,
                completedCount: completed.length,
                upcomingCount: upcoming.length
            }
        };
    } catch (error) {
        console.error('Error fetching discover events:', error);
        return {
            live: [],
            completed: [],
            upcoming: [],
            allCompleted: [],
            allUpcoming: [],
            meta: { start: 0, results: 0, total: 0 }
        };
    }
};

// Get series data for specific date range
export const getSeriesData = async (completed = null, minStartDate = null, maxStartDate = null, take = 25) => {
    try {
        let endpoint = '/series?';
        const params = [];
        
        if (minStartDate) {
            params.push(`minStartDate=${encodeURIComponent(minStartDate)}`);
        }
        
        // Note: maxStartDate is not supported by the API, so we ignore it here
        // Client-side filtering should be done in the calling functions if needed
        
        if (completed !== null) {
            params.push(`completed=${completed}`);
        }
        
        if (take) {
            params.push(`take=${take}`);
        }
        
        endpoint += params.join('&');
        
        const data = await ribApiCall(endpoint);
        return data;
    } catch (error) {
        console.error('Error fetching series data:', error);
        return { data: [], meta: { start: 0, results: 0, total: 0 } };
    }
};

// Helper function to get live series
export const getLiveSeries = async () => {
    try {
        // Get current time to fetch series that could be live
        const now = new Date();
        const minStartDate = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours ago
        
        // Fetch upcoming/ongoing series
        const data = await ribApiCall(`/series?minStartDate=${encodeURIComponent(minStartDate.toISOString())}&completed=false&take=75`);
        
        // Filter for series that are actually live
        if (data.data) {
            const liveSeries = data.data.filter(series => series.live === true);
            return {
                ...data,
                data: liveSeries
            };
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching live series:', error);
        return { data: [], meta: { start: 0, results: 0, total: 0 } };
    }
};

// Helper function to get completed series for a specific date
export const getCompletedSeries = async (date, take = 25) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    try {
        // Since API only supports minStartDate, we need to filter client-side
        const data = await getSeriesData(
            true,
            startOfDay.toISOString(),
            null, // No maxStartDate since API doesn't support it
            take * 3 // Get more results to account for filtering
        );
        
        // Filter results to only include series that start within the target day
        if (data.data) {
            const filteredSeries = data.data.filter(series => {
                const seriesDate = new Date(series.startDate);
                return seriesDate >= startOfDay && seriesDate <= endOfDay;
            });
            
            return {
                ...data,
                data: filteredSeries.slice(0, take)
            };
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching completed series:', error);
        return { data: [], meta: { start: 0, results: 0, total: 0 } };
    }
};

// Helper function to get upcoming series for a specific date
export const getUpcomingSeries = async (date, take = 25) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    try {
        // Since API only supports minStartDate, we need to filter client-side
        const data = await getSeriesData(
            false,
            startOfDay.toISOString(),
            null, // No maxStartDate since API doesn't support it
            take * 3 // Get more results to account for filtering
        );
        
        // Filter results to only include series that start within the target day and are not live
        if (data.data) {
            const filteredSeries = data.data.filter(series => {
                const seriesDate = new Date(series.startDate);
                return seriesDate >= startOfDay && seriesDate <= endOfDay && series.live === false;
            });
            
            return {
                ...data,
                data: filteredSeries.slice(0, take)
            };
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching upcoming series:', error);
        return { data: [], meta: { start: 0, results: 0, total: 0 } };
    }
};

// Export ValorantService for cache management
export { ValorantService };

// Add clearCache as standalone export for compatibility
export const clearCache = () => ValorantService.clearCache();