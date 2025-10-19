import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { NHLService } from '../../services/NHLService';

// Helper to normalize API team info to what UI expects
const normalizeTeam = (t) => {
  // Helper to read either direct value or object with .default
  const pick = (obj) => {
    if (obj == null) return undefined;
    if (typeof obj === 'object' && obj.default) return obj.default;
    return obj;
  };

  return {
    id: (t.teamId ?? t.id ?? (t.team && t.team.id))?.toString?.() || undefined,
    abbreviation: pick(t.teamAbbrev) || pick(t.abbreviation) || pick(t.tricode) || pick(t.team && t.team.abbreviation),
    displayName: pick(t.teamCommonName) || pick(t.teamName) || pick(t.team && t.team.commonName) || pick(t.team && t.team.displayName) || pick(t.team && t.team.shortDisplayName),
    logo: t.teamLogo || (t.team && (t.team.teamLogo || t.team.logo)) || undefined,
    seed: t.conferenceSequence || t.divisionSequence || t.sequence || (t.team && t.team.seed) || undefined,
    wins: t.wins ?? (t.teamRecord && t.teamRecord.wins) ?? 0,
    losses: t.losses ?? (t.teamRecord && t.teamRecord.losses) ?? 0,
    otl: t.otLosses ?? (t.teamRecord && t.teamRecord.ot) ?? 0,
    points: t.points ?? (t.teamRecord && t.teamRecord.points) ?? 0,
    gf: t.goalFor ?? t.goalsFor ?? 0,
    ga: t.goalAgainst ?? t.goalsAgainst ?? 0,
    clinchIndicator: t.clinchIndicator || (t.team && t.team.clinchIndicator) || null,
    conferenceName: pick(t.conferenceName) || t.conferenceName || (t.team && t.team.conferenceName) || undefined,
    divisionName: pick(t.divisionName) || t.divisionName || (t.team && t.team.divisionName) || undefined,
  };
};

const NHLStandingsScreen = () => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [standings, setStandings] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

  // Small abbreviation -> id fallback for cases where the standings row
  // doesn't include a numeric id but does include an abbreviation like 'TOR'.
  // Expand this map as needed; TeamPage also keeps a similar map as a safety
  // but mapping earlier at navigation time avoids extra inference work.
  const abbrToIdMap = {
    'tor': '21', 'mtl': '10', 'cgy': '3', 'edm': '6', 'van': '22', 'wpg': '28',
    'bos': '1', 'nyr': '13', 'phi': '15', 'pit': '16', 'tbl': '20', 'car': '7',
    'chi': '4', 'det': '5', 'nsh': '27', 'stl': '19', 'wsh': '23',
    'ana': '25', 'lak': '8', 'sjs': '18', 'cbj': '29', 'min': '30', 'ott': '14',
    'fla': '26', 'buf': '2', 'njd': '11', 'nyi': '12', 'dal': '9', 'col': '17',
    'uta': '129764', 'sea': '124292', 'vgk': '37',
  };

  const mapAbbrToId = (abbr) => {
    if (!abbr) return null;
    return abbrToIdMap[String(abbr).toLowerCase()] || null;
  };

  useEffect(() => {
    let mounted = true;
    const load = async (silent = false) => {
      try {
        // Only show loading for non-silent updates
        if (!silent && mounted) {
          setLoading(true);
        }
        
        const data = await NHLService.getStandings();
        if (!mounted) return;
        setStandings(data);
      } catch (e) {
        console.error('Failed to load NHL standings', e);
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    };

    // Initial load only (like StatsScreen - no background updates)  
    load();

    return () => { 
      mounted = false; 
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    };
  }, []);

  if (loading) return (<View style={[styles.loadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>);
  if (!standings) return (<View style={[styles.container, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>No standings available</Text></View>);

  // The NHLService should return an object with a "standings" array matching the web API.
  // Convert to conferences and divisions
  const raw = standings.standings || standings.records || standings.conferences || standings;

  // Try to group by conferenceName then divisionName
  const conferences = [];
  if (Array.isArray(raw)) {
    // raw is likely the NHL API array of teams with conferenceName/divisionName
    const teams = raw.map(normalizeTeam);
    // group by conference then division
    teams.forEach(team => {
      const confName = team.conferenceName || 'NHL';
      const divName = team.divisionName || '';
      let conf = conferences.find(c => c.name === confName);
      if (!conf) { conf = { name: confName, divisions: [] }; conferences.push(conf); }
      let div = conf.divisions.find(d => d.name === divName);
      if (!div) { div = { name: divName, teams: [] }; conf.divisions.push(div); }
      div.teams.push(team);
    });
  } else if (standings.conferences) {
    standings.conferences.forEach(conf => {
      const confObj = { name: conf.conferenceName || conf.name, divisions: [] };
      const divisions = conf.divisions || conf.children || [];
      divisions.forEach(div => {
        const divTeams = (div.teams || div.teamRecords || div.records || []).map(normalizeTeam);
        confObj.divisions.push({ name: div.divisionName || div.name || '', teams: divTeams });
      });
      conferences.push(confObj);
    });
  } else if (standings.records) {
    // NHL API: standings.records is an array of division groups
    standings.records.forEach(rec => {
      const divName = rec.name || rec.divisionName || '';
      const confName = rec.conferenceName || rec.conference || 'NHL';
      let conf = conferences.find(c => c.name === confName);
      if (!conf) { conf = { name: confName, divisions: [] }; conferences.push(conf); }
      const teams = (rec.teamRecords || rec.teams || []).map(normalizeTeam);
      conf.divisions.push({ name: divName, teams });
    });
  } else {
    // Generic fallback
    conferences.push({ name: 'NHL', divisions: [{ name: '', teams: [] }] });
  }

  // Team navigation function with proper ID handling
  const navigateToTeam = (team) => {
    // Prefer numeric id; if missing, try abbreviation->id map; otherwise pass team object
    const safeId = team.id || mapAbbrToId(team.abbreviation) || team;
    navigation.navigate('TeamPage', { teamId: safeId, sport: 'nhl' });
  };

  // Helper function to get NHL team ID for favorites
  const getNHLTeamId = (team) => {
    return team?.id || mapAbbrToId(team?.abbreviation) || null;
  };

  // Helper to render a single team row (extracted to avoid deep JSX nesting in maps)
  const renderTeamRow = (team, ti) => {
    const clinchCode = team.clinchIndicator ? String(team.clinchIndicator).toUpperCase() : null;
    const clinchColor = clinchCode && ['P','Y','Z'].includes(clinchCode) ? theme.success : (clinchCode === 'E' ? theme.error : (clinchCode === 'X' ? theme.warning : theme.surface));
    const teamId = getNHLTeamId(team);
    const isTeamFavorite = isFavorite(teamId, 'nhl');
    
    return (
      <TouchableOpacity key={ti} style={[styles.tableRow, { backgroundColor: theme.surface, borderBottomColor: theme.border, borderLeftColor: clinchColor, borderLeftWidth: clinchCode ? 4 : 0 }]} onPress={() => navigateToTeam(team)}>
        <View style={[styles.tableCell, styles.teamColumn]}>
          <Image source={{ uri: getTeamLogoUrl('nhl', (function(a){ if (!a) return a; const m = { lak: 'la', sjs: 'sj', tbl: 'tb' }; return (m[String(a).toLowerCase()] || a).toString(); })(team.abbreviation)) || team.logo }} style={styles.teamLogo} />
          <View style={styles.teamNameContainer}>
            <View style={styles.teamNameRow}>
              {team.seed && (
                <Text allowFontScaling={false} style={[styles.teamSeed, { color: colors.primary }]}>({team.seed}) </Text>
              )}
              {isTeamFavorite && (
                <Ionicons 
                  name="star" 
                  size={12} 
                  color={colors.primary} 
                  style={styles.favoriteIcon} 
                />
              )}
              <Text allowFontScaling={false} style={[styles.teamName, { color: isTeamFavorite ? colors.primary : theme.text }]} numberOfLines={1}>
                {team.displayName}
              </Text>
            </View>
          </View>
        </View>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.wins}</Text>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.losses}</Text>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.otl}</Text>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.points}</Text>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.gf}</Text>
        <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{team.ga}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}> 
      {conferences.map((conf, ci) => (
        <View key={ci} style={[styles.conferenceContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.conferenceTitle, { color: colors.primary, borderBottomColor: theme.border }]}>{conf.name}</Text>

          {conf.divisions.map((div, di) => (
            <View key={di} style={styles.divisionContainer}>
              {div.name ? <Text allowFontScaling={false} style={[styles.divisionTitle, { color: theme.text }]}>{div.name}</Text> : null}

              <View style={[styles.tableContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
                  <Text allowFontScaling={false} style={[styles.headerCell, styles.teamColumn, { color: 'white' }]}>Team</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>W</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>L</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>OTL</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>PTS</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>GF</Text>
                  <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>GA</Text>
                </View>

                {div.teams.map((team, ti) => renderTeamRow(team, ti))}

              </View>
            </View>
          ))}

        </View>
      ))}
        {/* Legend for clinch colors (MLB-style at bottom) */}
        <View style={[styles.legendContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.legendTitle, { color: colors.primary }]}>Legend</Text>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.success }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>P / Y / Z - Clinched (Conference/Division)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.warning }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>X - Clinched Playoffs</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.error }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>E - Eliminated</Text>
            </View>
          </View>
        </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  conferenceContainer: { margin: 10, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  conferenceTitle: { fontSize: 18, fontWeight: 'bold', padding: 15, borderBottomWidth: 1 },
  divisionContainer: { margin: 10 },
  divisionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  tableContainer: { borderWidth: 1, borderRadius: 4 },
  tableHeader: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 5 },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 5, borderBottomWidth: 1, alignItems: 'center' },
  headerCell: { flex: 1, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  tableCell: { flex: 1, fontSize: 12, textAlign: 'center' },
  teamColumn: { flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  teamLogo: { width: 20, height: 20, marginRight: 8 },
  teamNameContainer: { flex: 1 },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  favoriteIcon: { marginRight: 2 },
  teamName: { fontSize: 12, fontWeight: '500', flex: 1 },
  teamSeed: { fontSize: 12, fontWeight: '500' },
  legendContainer: { marginHorizontal: 10, marginTop: 12, padding: 12, borderTopWidth: 1, borderRadius: 6, marginBottom: 25 },
  legendTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  legendItems: { flexDirection: 'column', justifyContent: 'space-between' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  legendSwatch: { width: 16, height: 16, borderRadius: 4, marginRight: 8 },
  legendLabel: { fontSize: 12 },
});

export default NHLStandingsScreen;
