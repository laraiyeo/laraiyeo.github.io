import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const API_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions';

const TransactionsScreen = ({ navigation }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({}); // cache pages

  const fetchPage = async (p = 1) => {
    if (cache[p]) return; // already cached
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?limit=100&page=${p}`);
      const json = await res.json();
      setCache((c) => ({ ...c, [p]: json }));
      if (json.pageCount) setPageCount(json.pageCount);
    } catch (e) {
      console.error('Transactions fetch error', e);
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  const data = cache[page]?.transactions || [];

  const renderItem = ({ item }) => {
    const d = new Date(item.date);
    const dateStr = `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()} - ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    return (
      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <View style={styles.left}>
          <Text style={[styles.date, { color: theme.textSecondary }]} allowFontScaling={false}>{dateStr}</Text>
          <Text style={[styles.desc, { color: theme.text }]} allowFontScaling={false}>{item.description}</Text>
        </View>
        {item.team && item.team.id && (
          <Image source={{ uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500${isDarkMode ? '-dark' : ''}/${item.team.abbreviation.toLowerCase()}.png&w=200&h=200` }} style={styles.logo} />
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.pager, { borderTopColor: theme.border }] }>
        <TouchableOpacity disabled={page <= 1} style={[styles.pagerBtn, page <= 1 && { opacity: 0.4 }]} onPress={() => setPage((s) => Math.max(1, s - 1))}>
          <Text style={{ color: theme.text }}>Prev</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.text }}>{`Page ${page} of ${pageCount}`}</Text>
        <TouchableOpacity disabled={page >= pageCount} style={[styles.pagerBtn, page >= pageCount && { opacity: 0.4 }]} onPress={() => setPage((s) => Math.min(pageCount, s + 1))}>
          <Text style={{ color: theme.text }}>Next</Text>
        </TouchableOpacity>
      </View>

      {loading && !data.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={{ color: colors.primary, padding: 12 }}>{error}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it, idx) => `${page}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  left: { flex: 1, paddingRight: 8 },
  date: { fontSize: 12 },
  desc: { marginTop: 6, fontSize: 14 },
  logo: { width: 48, height: 48, marginLeft: 8, borderRadius: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  pagerBtn: { padding: 8 },
});

export default TransactionsScreen;
