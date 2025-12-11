import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const API_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/draft';

const DraftScreen = () => {
  const { theme, colors, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedRound, setSelectedRound] = useState(null);

  const season = new Date().getFullYear();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?season=${season}`);
      const json = await res.json();
      setData(json);
      // default to first round if available
      const rounds = (json.rounds && json.rounds.length) ? json.rounds.map(r => r.round) : null;
      if (rounds && rounds.length) setSelectedRound(rounds[0]);
      else if (json.picks && json.picks.length) setSelectedRound(json.picks[0].round);
    } catch (e) {
      console.error('Draft fetch error', e);
      setError('Failed to load draft');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const rounds = useMemo(() => {
    if (!data) return [];
    if (data.rounds && data.rounds.length) return data.rounds.map(r => r.round);
    if (data.picks) return Array.from(new Set(data.picks.map(p => p.round))).sort((a,b) => a-b);
    return [];
  }, [data]);

  const picksForRound = useMemo(() => {
    if (!data || !selectedRound) return [];
    const picks = data.picks || [];
    return picks.filter(p => Number(p.round) === Number(selectedRound)).sort((a,b) => Number(a.overall) - Number(b.overall));
  }, [data, selectedRound]);
  // hooks must be unconditional — declare them before any early returns
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (overall) => {
    setExpanded((s) => ({ ...s, [overall]: !s[overall] }));
  };

  // helper lookups
  const positionsMap = useMemo(() => {
    const m = {};
    (data?.positions || []).forEach((p) => { m[String(p.id)] = p; });
    return m;
  }, [data]);

  const teamsMap = useMemo(() => {
    const m = {};
    (data?.teams || []).forEach((t) => { m[String(t.id)] = t; });
    return m;
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={[styles.roundsRow, { justifyContent: 'center' }]}>
        {rounds.map((r) => (
          <TouchableOpacity key={r} onPress={() => setSelectedRound(r)} style={[styles.roundBtn, selectedRound === r && { backgroundColor: colors.secondary }]}> 
            <Text style={{ color: selectedRound === r ? '#fff' : theme.text }}>{`Round ${r}`}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={picksForRound}
        keyExtractor={(it, idx) => `${it.overall}-${idx}`}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          const overall = item.overall;
          const athlete = item.athlete || {};
          const posId = athlete.position?.id;
          const pos = positionsMap[String(posId)]?.displayName || '';
          const team = teamsMap[String(item.teamId)];
          const getTeamLogo = (t) => {
            if (!t) return null;
            return (isDarkMode ? (`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500-dark/${t.abbreviation.toLowerCase()}.png&w=200&h=200`) : (`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${t.abbreviation.toLowerCase()}.png&w=200&h=200`)) || null;
          };
          const teamLogoUri = getTeamLogo(team);
          const headshotUrl = athlete.headshot?.href;
          let headshot = null;
          if (headshotUrl) {
          // Extract the ID + filename from the original URL
          const path = headshotUrl.split('/i/')[1]; // "headshots/nba/players/full/3934719.png"
          // Build the combiner URL
          headshot = `https://a.espncdn.com/combiner/i?img=/i/${path}&w=200`;
          }
          const attr = (athlete.attributes || []);
          const posRank = (attr.find(a => a.name === 'posRank' || a.name === 'rank') || {}).displayValue || '';
          const ovrRank = (attr.find(a => a.name === 'overall' || a.name === 'ovr') || {}).displayValue || '';
          const weight = athlete.displayWeight || '';
          const height = athlete.displayHeight || '';
          const tradeNote = item.tradeNote || item.note || (item.notes && item.notes.items && item.notes.items[0] && item.notes.items[0].shortText) || null;

          return (
            <View style={{ marginBottom: 8 }}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => toggleExpand(overall)} style={[styles.pickRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.pickLeft}>
                  <Text style={[styles.pickNum, { color: theme.text }]}> 
                    {item.pick || item.roundPick || overall}
                    <Text style={{ color: theme.textSecondary }}>{' ('}{overall}{')'}</Text>
                  </Text>
                </View>

                <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
                  {headshot ? (
                    <Image source={{ uri: headshot }} style={styles.headshotSmall} />
                  ) : (
                    <View style={[styles.headshotSmall, { backgroundColor: theme.border }]} />
                  )}
                </View>

                <View style={styles.pickMain}>
                  <View style={styles.nameRow}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{athlete.displayName || athlete.shortName || ''}</Text>
                    <Text style={{ color: theme.textSecondary, marginLeft: 8, fontSize: 13 }}>{pos}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    {team && team.displayName && (
                      <>
                        {teamLogoUri ? <Image source={{ uri: teamLogoUri }} style={styles.teamLogoLarge} /> : null}
                        <Text style={{ color: theme.textSecondary, marginLeft: 8 }}>{team.displayName}</Text>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {expanded[overall] && (() => {
                const showTrade = Boolean(tradeNote);
                const boxes = [
                  { value: posRank || '—', label: 'POS RK' },
                  { value: ovrRank || '—', label: 'OVR RK' },
                  { value: weight || '—', label: 'WT' },
                  { value: height || '—', label: 'HT' },
                ];

                return (
                  <View style={[styles.expandContainer, { backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderTopWidth: 0, borderColor: theme.border }]}> 
                    <View style={styles.expandArrowRow}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{athlete.team?.abbreviation || athlete.team?.shortDisplayName || ''}</Text>
                      <Text style={{ color: theme.text, marginHorizontal: 12, fontSize: 16 }}>{'→'}</Text>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{team?.abbreviation || ''}</Text>
                    </View>

                    {showTrade ? (
                      <View style={styles.expandBottomRow}>
                        <View style={styles.leftBoxes}>
                          {boxes.map((b, idx) => (
                            <View key={idx} style={[styles.boxCell, idx === 0 || idx === 2 ? { marginHorizontal: 6 } : { marginHorizontal: 0 }]}>
                              <Text style={[styles.boxValue, { color: theme.text }]}>{b.value}</Text>
                              <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>{b.label}</Text>
                            </View>
                          ))}
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.border, alignSelf: 'stretch' }]} />

                        <View style={styles.tradeColumn}>
                          <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 25, fontWeight: '700' }}>{(tradeNote ?? '').charAt(0).toUpperCase() + (tradeNote ?? '').slice(1)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.expandBottomRowNoTrade}>
                        {boxes.map((b, idx) => (
                          <View key={idx} style={styles.boxInline}>
                            <Text style={[styles.boxValue, { color: theme.text }]}>{b.value}</Text>
                            <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>{b.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          );
        }}
        ListEmptyComponent={() => <Text style={{ color: theme.textSecondary, padding: 12 }}>No picks for this round.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  roundsRow: { flexDirection: 'row', padding: 12, flexWrap: 'wrap' },
  roundBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, marginBottom: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.04)' },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  pickLeft: { width: 64, alignItems: 'center', justifyContent: 'center' },
  pickNum: { fontWeight: '700', fontSize: 14 },
  rankRow: { flexDirection: 'row', marginTop: 6 },
  smallBox: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' },
  smallBoxText: { fontSize: 12, fontWeight: '700' },
  headshotSmall: { width: 40, height: 40, borderRadius: 20 },
  pickMain: { flex: 1, paddingLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  teamLogoLarge: { width: 20, height: 20, borderRadius: 3 },

  expandContainer: { marginTop: 6, borderRadius: 8, overflow: 'hidden' },
  expandArrowRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 8 },
  expandInfoRow: { flexDirection: 'row', padding: 8 },
  infoColumn: { flex: 1 },
  tradeColumn: { width: 160, paddingLeft: 12, justifyContent: 'center' },
  infoBox: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)', marginRight: 8, marginBottom: 8 },
  infoText: { fontWeight: '700' },
  leftBoxes: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  boxCell: { width: '46%', padding: 10, marginBottom: 8, marginHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center' },
  boxValue: { fontWeight: '700', fontSize: 14 },
  boxLabel: { fontSize: 12, marginTop: 6 },
  divider: { width: 1, backgroundColor: 'rgba(0, 0, 0, 0.88)', marginHorizontal: 12 },
  expandBottomRow: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  expandBottomRowNoTrade: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  boxInline: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.1)', padding: 10, borderRadius: 8, marginHorizontal: 6 },
  rankText: { fontSize: 12, fontWeight: '700' },
});

export default DraftScreen;
