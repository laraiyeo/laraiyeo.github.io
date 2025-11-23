import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const API_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';

const InjuriesScreen = () => {
  const { theme, colors, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      // json.injuries is an array grouped by team; we want injuries by date
      const entries = [];
      (json.injuries || []).forEach((teamEntry) => {
        const team = teamEntry.displayName || teamEntry.team?.displayName || null;
        (teamEntry.injuries || []).forEach((inj) => {
          entries.push({
            date: inj.date || inj.updated || null,
            athlete: inj.athlete || null,
            team: teamEntry,
            shortComment: inj.shortComment || inj.longComment || '',
            details: inj.details || null,
          });
        });
      });
      // group by date
      entries.sort((a,b) => new Date(b.date) - new Date(a.date));
      setData(entries);
    } catch (e) {
      console.error('Injuries fetch error', e);
      setError('Failed to load injuries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const grouped = useMemo(() => {
    const g = {};
    data.forEach((it) => {
      const key = it.date ? new Date(it.date).toDateString() : 'Unknown';
      if (!g[key]) g[key] = [];
      g[key].push(it);
    });
    return g;
  }, [data]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );

  if (error) return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 12 }}>
      <Text style={{ color: colors.primary }}>{error}</Text>
    </View>
  );

  const dates = Object.keys(grouped);

  return (
    <View style={[{ flex: 1, backgroundColor: theme.background }]}>
      <FlatList
        data={dates}
        keyExtractor={(d) => d}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item: dateKey }) => (
          <View style={{ marginBottom: 16 }}>
            <Text allowFontScaling={false} style={[styles.dateHeader, { color: theme.text }]}>{dateKey}</Text>
            {(grouped[dateKey] || []).map((entry, i) => {
              const details = entry.details || entry.injuryDetails || null;
              const abbr = details?.fantasyStatus?.abbreviation || '';
              const abbrU = String(abbr).toUpperCase();
              let abbrColor = theme.info || '#999';
              let boxBg = theme.info + '33';
              const headshot = entry.athlete?.headshot?.href;
              let headshotUrl = null;
              if (headshot) {
              // Extract the ID + filename from the original URL
              const path = headshot.split('/i/')[1]; // "headshots/nba/players/full/3934719.png"
              // Build the combiner URL
              headshotUrl = `https://a.espncdn.com/combiner/i?img=/i/${path}&w=200`;
              }
              if (abbrU.includes('O')){ abbrColor = theme.error; boxBg = theme.error + '33';}
              else if (abbrU.includes('Q') || abbrU.includes('D')) { abbrColor = theme.warning; boxBg = theme.warning + '33'; }

              return (
                <View key={`${dateKey}-${i}`} style={[styles.row, { borderBottomColor: theme.border }]}> 
                  <View style={styles.headshotWrap}>
                    {headshotUrl ? (
                      <Image source={{ uri: headshotUrl }} style={styles.headshot} />
                    ) : (
                      <View style={[styles.headshot, { backgroundColor: theme.border }]} />
                    )}
                    {entry.athlete.team?.id && (
                      <Image source={{ uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500${isDarkMode ? '-dark' : ''}/${entry.athlete.team.abbreviation.toLowerCase()}.png&w=200&h=200` }} style={styles.teamLogo} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Text allowFontScaling={false} style={[styles.name, { color: theme.text }]}>{entry.athlete?.displayName || `${entry.athlete?.firstName || ''} ${entry.athlete?.lastName || ''}`}</Text>
                    <Text allowFontScaling={false} style={[styles.comment, { color: theme.textSecondary }]} numberOfLines={2}>{entry.shortComment}</Text>
                    {details && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: boxBg }}>
                          <Text allowFontScaling={false} style={{ color: abbrColor, fontWeight: '700' }}>{abbr}</Text>
                        </View>
                        <Text allowFontScaling={false} style={{ color: theme.textSecondary, marginLeft: 8 }}>{details.type || ''}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dateHeader: { fontSize: 14, marginBottom: 8, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  headshotWrap: { width: 72, height: 70, position: 'relative' },
  headshot: { width: 70, height: 70, borderRadius: 35 },
  teamLogo: { width: 25, height: 25, position: 'absolute', left: 0, bottom: 0, borderRadius: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  comment: { marginTop: 4, fontSize: 13 },
});

export default InjuriesScreen;
