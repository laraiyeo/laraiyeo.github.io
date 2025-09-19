import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  Alert,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GermanyServiceEnhanced } from '../../../services/soccer/GermanyServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const GermanyTransferScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState([]);
  const [filteredTransfers, setFilteredTransfers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'in', 'out', 'loan'
  const [currentPage, setCurrentPage] = useState(1);
  const [teamsData, setTeamsData] = useState({});
  const transfersPerPage = 10;

  useEffect(() => {
    loadTransferData();
  }, []);

  useEffect(() => {
    filterTransfers();
  }, [transfers, searchQuery, filterType]);

  const TeamLogoImage = ({ teamId, style }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [failedUrls, setFailedUrls] = useState(new Set());
    
    useEffect(() => {
      setFailedUrls(new Set());
      const logos = getTeamLogo(teamId, isDarkMode);
      setLogoSource({ uri: logos.primaryUrl });
    }, [teamId, isDarkMode]);

    const handleImageError = () => {
      const logos = getTeamLogo(teamId, isDarkMode);
      const currentUrl = logoSource?.uri;
      
      if (currentUrl) {
        const newFailedUrls = new Set(failedUrls);
        newFailedUrls.add(currentUrl);
        setFailedUrls(newFailedUrls);
        
        if (!newFailedUrls.has(logos.fallbackUrl)) {
          setLogoSource({ uri: logos.fallbackUrl });
        } else {
          // Final fallback - use soccer.png asset for all cases
          setLogoSource(require('../../../../assets/soccer.png'));
        }
      }
    };

    return (
      <Image 
        source={logoSource || (teamId ? { uri: getTeamLogo(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png'))}
        style={style}
        onError={handleImageError}
      />
    );
  };

  const getTeamLogo = (teamId, isDarkMode) => {
    // Try dark logo first if in dark mode, otherwise try light logo
    const primaryUrl = isDarkMode 
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    // Fallback to opposite theme logo
    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
    
    // Final fallback to local soccer ball image
    const finalFallback = '../../../assets/soccer.png';
    
    return { primaryUrl, fallbackUrl, finalFallback };
  };

  const loadTransferData = async () => {
    try {
      setLoading(true);
      
      // Fetch transfers from ESPN API
      const response = await fetch(convertToHttps('https://sports.core.api.espn.com/v2/sports/soccer/leagues/ger.1/transactions?limit=1000'));
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        // Process each transfer to get detailed information
        const processedTransfers = await Promise.all(
          data.items.map(async (transfer) => {
            try {
              // Fetch athlete information
              const athleteResponse = await fetch(convertToHttps(transfer.athlete.$ref));
              const athleteData = await athleteResponse.json();
              
              // Fetch from team information
              let fromTeamData = null;
              if (transfer.from) {
                const fromTeamResponse = await fetch(convertToHttps(transfer.from.$ref));
                fromTeamData = await fromTeamResponse.json();
              }
              
              // Fetch to team information
              let toTeamData = null;
              if (transfer.to) {
                const toTeamResponse = await fetch(convertToHttps(transfer.to.$ref));
                toTeamData = await toTeamResponse.json();
              }
              
              return {
                id: `${athleteData.id}-${new Date(transfer.date).getTime()}`,
                date: transfer.date,
                type: transfer.type,
                amount: transfer.amount,
                displayAmount: transfer.displayAmount,
                athlete: {
                  id: athleteData.id,
                  name: athleteData.displayName || athleteData.name,
                  firstName: athleteData.firstName,
                  lastName: athleteData.lastName,
                  position: athleteData.position?.abbreviation || athleteData.position?.name || 'N/A',
                  age: athleteData.age,
                  jersey: athleteData.jersey
                },
                fromTeam: fromTeamData ? {
                  id: fromTeamData.id,
                  name: fromTeamData.displayName || fromTeamData.name,
                  abbreviation: fromTeamData.abbreviation,
                  teamId: fromTeamData.id
                } : null,
                toTeam: toTeamData ? {
                  id: toTeamData.id,
                  name: toTeamData.displayName || toTeamData.name,
                  abbreviation: toTeamData.abbreviation,
                  teamId: toTeamData.id
                } : null
              };
            } catch (error) {
              console.error('Error processing transfer:', error);
              return null;
            }
          })
        );
        
        // Filter out failed transfers and sort by date (newest first)
        const validTransfers = processedTransfers
          .filter(transfer => transfer !== null)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        setTransfers(validTransfers);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading transfer data:', error);
      Alert.alert('Error', 'Failed to load transfer data');
      setLoading(false);
    }
  };

  const filterTransfers = () => {
    let filtered = transfers;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(transfer => 
        transfer.athlete.name.toLowerCase().includes(query) ||
        transfer.fromTeam?.name.toLowerCase().includes(query) ||
        transfer.toTeam?.name.toLowerCase().includes(query) ||
        transfer.type.toLowerCase().includes(query)
      );
    }
    
    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(transfer => {
        switch (filterType) {
          case 'loan':
            return transfer.type.toLowerCase().includes('loan');
          case 'permanent':
            return transfer.type.toLowerCase() === 'permanent' || 
                   transfer.type.toLowerCase() === 'undisclosed';
          case 'free':
            return transfer.amount === 0 && 
                   !transfer.type.toLowerCase().includes('loan') &&
                   transfer.type.toLowerCase() !== 'undisclosed';
          default:
            return true;
        }
      });
    }
    
    setFilteredTransfers(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const renderTransferItem = ({ item }) => {
    const transferDate = new Date(item.date);
    const formattedDate = transferDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const getTransferTypeColor = (type) => {
      switch (type.toLowerCase()) {
        case 'loan':
          return theme.error;
        case 'permanent':
          return theme.success;
        case 'undisclosed':
          return colors.primary;
        default:
          return theme.textSecondary;
      }
    };

    const getAmountDisplay = (amount, displayAmount, type) => {
      if (type.toLowerCase().includes('loan')) {
        return 'Loan';
      }
      if (amount === 0 && type.toLowerCase() === 'undisclosed') {
        return 'Undisclosed';
      }
      if (amount === 0) {
        return 'Free';
      }
      return displayAmount || 'Undisclosed';
    };

    const shouldShowAmountBubble = (amount, type) => {
      // Show bubble for all amounts except actual monetary values
      return type.toLowerCase().includes('loan') || 
             amount === 0 || 
             type.toLowerCase() === 'undisclosed';
    };

    return (
      <View style={[styles.transferItem, { backgroundColor: theme.surface }]}>
        <View style={styles.transferHeader}>
          <View style={styles.playerInfo}>
            <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
              {item.athlete.name}
            </Text>
            <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
              {item.athlete.position}
              {item.athlete.age && ` • ${item.athlete.age} years`}
              {item.athlete.jersey && ` • #${item.athlete.jersey}`}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.transferDate, { color: theme.textSecondary }]}>
            {formattedDate}
          </Text>
        </View>
        
        <View style={styles.transferRoute}>
          {item.fromTeam && (
            <View style={styles.fromTeamContainer}>
              <TeamLogoImage 
                teamId={item.fromTeam.teamId}
                style={styles.teamLogo}
              />
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
                {item.fromTeam.abbreviation || item.fromTeam.name}
              </Text>
            </View>
          )}
          
          <View style={styles.arrowContainer}>
            <Ionicons name="arrow-forward" size={20} color={theme.textSecondary} />
          </View>
          
          {item.toTeam && (
            <View style={styles.toTeamContainer}>
              <TeamLogoImage 
                teamId={item.toTeam.teamId}
                style={styles.teamLogo}
              />
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
                {item.toTeam.abbreviation || item.toTeam.name}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.transferDetails}>
          <View style={[styles.transferType, { backgroundColor: getTransferTypeColor(item.type) + '20' }]}>
            <Text allowFontScaling={false} style={[styles.transferTypeText, { color: getTransferTypeColor(item.type) }]}>
              {item.type}
            </Text>
          </View>
          {shouldShowAmountBubble(item.amount, item.type) ? (
            <View style={[styles.transferAmountBubble, { backgroundColor: colors.primary + '20' }]}>
              <Text allowFontScaling={false} style={[styles.transferAmountText, { color: colors.primary }]}>
                {getAmountDisplay(item.amount, item.displayAmount, item.type)}
              </Text>
            </View>
          ) : (
            <Text allowFontScaling={false} style={[styles.transferAmount, { color: colors.primary }]}>
              {getAmountDisplay(item.amount, item.displayAmount, item.type)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderPagination = () => {
    const totalPages = Math.ceil(filteredTransfers.length / transfersPerPage);
    
    if (totalPages <= 1) return null;
    
    return (
      <View style={styles.paginationContainer}>
        <TouchableOpacity
          style={[
            styles.paginationBtn,
            { backgroundColor: currentPage > 1 ? colors.primary : theme.border }
          ]}
          disabled={currentPage <= 1}
          onPress={() => setCurrentPage(currentPage - 1)}
        >
          <Text allowFontScaling={false} style={[styles.paginationBtnText, { 
            color: currentPage > 1 ? '#fff' : theme.textSecondary 
          }]}>
            Prev
          </Text>
        </TouchableOpacity>
        
        <Text allowFontScaling={false} style={[styles.pageInfo, { color: theme.text }]}>
          Page {currentPage} of {totalPages}
        </Text>
        
        <TouchableOpacity
          style={[
            styles.paginationBtn,
            { backgroundColor: currentPage < totalPages ? colors.primary : theme.border }
          ]}
          disabled={currentPage >= totalPages}
          onPress={() => setCurrentPage(currentPage + 1)}
        >
          <Text allowFontScaling={false} style={[styles.paginationBtnText, { 
            color: currentPage < totalPages ? '#fff' : theme.textSecondary 
          }]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const getPaginatedTransfers = () => {
    const startIndex = (currentPage - 1) * transfersPerPage;
    const endIndex = startIndex + transfersPerPage;
    return filteredTransfers.slice(startIndex, endIndex);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading Ligue 1 transfers...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search and Filters */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search players, teams, or transfer type..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {[
            { key: 'all', label: 'All' },
            { key: 'permanent', label: 'Permanent' },
            { key: 'loan', label: 'Loans' },
            { key: 'free', label: 'Free' }
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: filterType === filter.key ? colors.primary : theme.border,
                  borderColor: filterType === filter.key ? colors.primary : theme.border,
                }
              ]}
              onPress={() => setFilterType(filter.key)}
            >
              <Text allowFontScaling={false}
                style={[
                  styles.filterBtnText,
                  {
                    color: filterType === filter.key ? '#fff' : theme.text,
                  }
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results Info */}
      <View style={styles.resultsInfo}>
        <Text allowFontScaling={false} style={[styles.resultsText, { color: theme.textSecondary }]}>
          Showing {filteredTransfers.length} transfers
        </Text>
      </View>

      {/* Transfers List */}
      <FlatList
        data={getPaginatedTransfers()}
        renderItem={renderTransferItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-horizontal" size={64} color={theme.textSecondary} />
            <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
              No transfers found
            </Text>
          </View>
        }
      />

      {/* Pagination */}
      {renderPagination()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultsInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultsText: {
    fontSize: 14,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  transferItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  transferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
  },
  transferDate: {
    fontSize: 12,
  },
  transferRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fromTeamContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toTeamContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  teamLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  arrowContainer: {
    paddingHorizontal: 12,
  },
  transferDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferType: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  transferTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transferAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  transferAmountBubble: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  transferAmountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  paginationBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  paginationBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pageInfo: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default GermanyTransferScreen;
