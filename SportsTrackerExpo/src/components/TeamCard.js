import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet
} from 'react-native';

const TeamCard = ({ 
  team, 
  onPress, 
  showRecord = true, 
  size = 'medium',
  style 
}) => {
  const cardStyle = size === 'small' ? styles.smallCard : styles.mediumCard;
  const logoStyle = size === 'small' ? styles.smallLogo : styles.mediumLogo;
  const nameStyle = size === 'small' ? styles.smallName : styles.mediumName;

  return (
    <TouchableOpacity 
      style={[cardStyle, style]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image 
        source={{ uri: team.logo }} 
        style={logoStyle}
        resizeMode="contain"
      />
      <View style={styles.teamInfo}>
        <Text style={nameStyle} numberOfLines={2}>
          {team.displayName}
        </Text>
        {showRecord && team.record && (
          <Text style={styles.record}>{team.record}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  mediumCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    minHeight: 120,
    justifyContent: 'center',
  },
  smallCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
    minHeight: 80,
    justifyContent: 'center',
  },
  teamInfo: {
    alignItems: 'center',
    marginTop: 8,
  },
  mediumLogo: {
    width: 50,
    height: 50,
  },
  smallLogo: {
    width: 35,
    height: 35,
  },
  mediumName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  smallName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  record: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
});

export default TeamCard;
