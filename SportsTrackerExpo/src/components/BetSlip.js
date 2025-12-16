import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useBetSlip } from '../context/BetSlipContext';

const { height } = Dimensions.get('window');

const BetSlip = ({ isGameDetail = false }) => {
  const { colors, theme } = useTheme();
  const {
    bets,
    removeBet,
    clearBets,
    calculateParlayOdds,
    calculatePayout,
    groupedBets,
    isSlipOpen,
    setIsSlipOpen,
  } = useBetSlip();

  const [betAmount, setBetAmount] = useState('');
  const [slideAnim] = useState(new Animated.Value(height));

  const openSlip = () => {
    setIsSlipOpen(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
    }).start();
  };

  const closeSlip = () => {
    setIsSlipOpen(false);
    Animated.spring(slideAnim, {
      toValue: height,
      useNativeDriver: true,
      damping: 20,
    }).start();
  };

  console.log('BetSlip render - bets:', bets);
  console.log('BetSlip render - bets length:', bets.length);

  if (bets.length === 0) {
    console.log('BetSlip returning null - no bets');
    return null;
  }

  console.log('BetSlip rendering with bets');

  const parlayOdds = calculateParlayOdds();
  const payout = calculatePayout(parseFloat(betAmount) || 0);
  const grouped = groupedBets();

  return (
    <>
      {/* Bottom Bar */}
      <TouchableOpacity
        style={[
          styles.bottomBar,
          { backgroundColor: colors.primary },
          isGameDetail && { height: 90 },
        ]}
        onPress={openSlip}
        activeOpacity={0.9}
      >
        <View style={[styles.bottomBarLeft, isGameDetail && { marginBottom: 30 }]}>
          <View style={styles.betCountBadge}>
            <Text style={styles.betCountText}>{bets.length}</Text>
          </View>
          <Text style={styles.bottomBarText}>Betslip</Text>
        </View>
        <View style={[styles.bottomBarRight, isGameDetail && { marginBottom: 30 }]}>
          {bets.length > 1 && (
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayText}>PARLAY</Text>
            </View>
          )}
          <Ionicons name="chevron-up" size={24} color="white" />
        </View>
      </TouchableOpacity>

      {/* Full Screen Modal */}
      <Modal
        visible={isSlipOpen}
        transparent={true}
        animationType="none"
        onRequestClose={closeSlip}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeSlip}
          />
          <Animated.View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.background,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.betCountBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.betCountText}>{bets.length}</Text>
                </View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Betslip</Text>
              </View>
              <View style={styles.modalHeaderRight}>
                <TouchableOpacity onPress={clearBets} style={styles.clearButton}>
                  <Text style={[styles.clearButtonText, { color: theme.error }]}>
                    Clear All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeSlip} style={styles.closeButton}>
                  <Ionicons name="close" size={28} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Tabs */}
            <View style={[styles.tabsContainer, { backgroundColor: theme.surface }]}>
              <TouchableOpacity
                style={[styles.tab, styles.activeTab, { borderBottomColor: colors.primary }]}
              >
                <Text style={[styles.tabText, { color: colors.primary }]}>
                  {bets.length === 1 ? 'STRAIGHT' : 'PARLAY'}
                </Text>
              </TouchableOpacity>
              {bets.length > 1 && (
                <TouchableOpacity style={styles.tab}>
                  <Text style={[styles.tabText, { color: theme.textSecondary }]}>TEASER</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Bets List */}
            <ScrollView style={styles.betsList} showsVerticalScrollIndicator={false}>
              {Object.entries(grouped).map(([gameId, group]) => (
                <View key={gameId} style={styles.gameGroup}>
                  {/* Game Header */}
                  {group.gameInfo && (
                    <View style={[styles.gameHeader, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gameHeaderText, { color: theme.textSecondary }]}>
                        {group.gameInfo.time} · {group.gameInfo.teams}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                    </View>
                  )}

                  {/* Bets in this game */}
                  {group.bets.map((bet, index) => (
                    <View
                      key={bet.id}
                      style={[
                        styles.betItem,
                        { backgroundColor: theme.surfaceSecondary },
                        index === group.bets.length - 1 && styles.lastBetItem,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.removeBetButton}
                        onPress={() => removeBet(bet.id)}
                      >
                        <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                      </TouchableOpacity>

                      <View style={styles.betItemContent}>
                        <Text style={[styles.betType, { color: theme.textSecondary }]}>
                          {bet.type}
                        </Text>
                        <Text style={[styles.betDescription, { color: theme.text }]}>
                          {bet.description}
                        </Text>
                        <View style={styles.betOddsContainer}>
                          <Text style={[styles.betLine, { color: theme.text }]}>
                            {bet.line}
                          </Text>
                          <Text style={[styles.betOdds, { color: colors.primary }]}>
                            {bet.odds}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ))}

              {/* Parlay Info */}
              {bets.length > 1 && (
                <View style={[styles.parlayInfo, { backgroundColor: theme.surface }]}>
                  <View style={styles.parlayInfoRow}>
                    <View style={styles.parlayInfoLeft}>
                      <Ionicons name="information-circle" size={18} color={colors.primary} />
                      <Text style={[styles.parlayInfoTitle, { color: theme.text }]}>PARLAY</Text>
                    </View>
                    <Text style={[styles.parlayInfoOdds, { color: colors.primary }]}>
                      {parlayOdds}
                    </Text>
                  </View>
                  <Text style={[styles.parlayInfoSubtext, { color: theme.textSecondary }]}>
                    {bets.length} legs - All legs must win
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Bottom Section - Bet Input */}
            <View style={[styles.bottomSection, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              {/* Quick bet amounts */}
              <View style={styles.quickAmounts}>
                {['$20', '$50', '$100', '$200'].map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.quickAmountButton, { backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => setBetAmount(amount.replace('$', ''))}
                  >
                    <Text style={[styles.quickAmountText, { color: colors.primary }]}>
                      +{amount}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bet Amount Input */}
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Bet</Text>
                  <View style={[styles.inputContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={[styles.currencySymbol, { color: theme.text }]}>$</Text>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={betAmount}
                      onChangeText={setBetAmount}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>To Win</Text>
                  <View style={[styles.inputContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={[styles.currencySymbol, { color: theme.text }]}>$</Text>
                    <Text style={[styles.toWinText, { color: theme.text }]}>
                      {payout || '0.00'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Place Bet Button */}
              <TouchableOpacity
                style={[
                  styles.placeBetButton,
                  { backgroundColor: betAmount ? colors.primary : theme.textTertiary },
                ]}
                disabled={!betAmount}
              >
                <Text style={styles.placeBetButtonText}>Bet</Text>
              </TouchableOpacity>

              {/* Payout Display */}
              <View style={[styles.payoutRow, isGameDetail && { marginBottom: 30 }]}>
                <Text style={[styles.payoutLabel, { color: theme.textSecondary }]}>PAYOUT</Text>
                <Text style={[styles.payoutAmount, { color: theme.text }]}>
                  ${payout || '0.00'}
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  betCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betCountText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bottomBarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  parlayBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  parlayText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  clearButton: {
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  betsList: {
    flex: 1,
  },
  gameGroup: {
    marginBottom: 16,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  gameHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  betItem: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    position: 'relative',
  },
  lastBetItem: {
    marginBottom: 8,
  },
  removeBetButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  betItemContent: {
    paddingRight: 28,
  },
  betType: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  betDescription: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  betOddsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  betLine: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  betOdds: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  parlayInfo: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  parlayInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  parlayInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parlayInfoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  parlayInfoOdds: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  parlayInfoSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  bottomSection: {
    padding: 16,
    borderTopWidth: 1,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 50,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  toWinText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  placeBetButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  placeBetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payoutLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  payoutAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default BetSlip;
