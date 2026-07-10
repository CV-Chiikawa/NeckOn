import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LogoImage } from '@/components/neckon-auth';

const OLIVE = '#889B6C';
const intervals = Array.from({ length: 60 }, (_, index) => index + 1);

function Toggle({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, active ? styles.toggleActive : styles.toggleInactive]}>
      <View style={styles.knob} />
    </Pressable>
  );
}

export default function NotificationSettingsScreen() {
  const [postureWarningEnabled, setPostureWarningEnabled] = useState(true);
  const [goodPostureEnabled, setGoodPostureEnabled] = useState(true);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState(5);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <LogoImage style={styles.logo} />
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>알림설정</Text>

      <View style={[styles.settingBlock, styles.intervalBlock]}>
        <View style={styles.settingPill}>
          <Text style={styles.settingTitle}>실시간 자세 경고 알림</Text>
          <Toggle
            active={postureWarningEnabled}
            onPress={() => setPostureWarningEnabled((current) => !current)}
          />
        </View>
        <Text style={styles.description}>내 자세가 감지되면 즉시 알림이 가요.</Text>
      </View>

      <View style={styles.settingBlock}>
        <View style={[styles.settingPill, styles.intervalPill]}>
          <Text style={styles.settingTitle}>알림 주기</Text>
          <Pressable
            onPress={() => setDropdownOpen((current) => !current)}
            style={styles.intervalSelect}>
            <Text style={styles.intervalSelectText}>{selectedInterval}초 ▼</Text>
          </Pressable>
        </View>

        {dropdownOpen ? (
          <View style={styles.dropdown}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.dropdownList}>
              {intervals.map((minute) => {
                const isSelected = selectedInterval === minute;

                return (
                  <Pressable
                    key={minute}
                    onPress={() => {
                      setSelectedInterval(minute);
                      setDropdownOpen(false);
                    }}
                    style={[styles.dropdownItem, isSelected ? styles.dropdownItemActive : null]}>
                    <Text style={[styles.dropdownText, isSelected ? styles.dropdownTextActive : null]}>
                      {minute}초
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.description}>내 자세가 설정한 시간 동안 지속될 경우 주기적으로 알림을 보냅니다.</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.settingBlock}>
        <View style={styles.settingPill}>
          <Text style={styles.settingTitle}>바른 자세 알림</Text>
          <Toggle active={goodPostureEnabled} onPress={() => setGoodPostureEnabled((current) => !current)} />
        </View>
        <Text style={styles.description}>바른 자세를 일정 시간 유지했을 때 칭찬 알림을 보내드려요.</Text>
      </View>

      <View style={styles.settingBlock}>
        <View style={styles.settingPill}>
          <Text style={styles.settingTitle}>리포트 발행 알림</Text>
          <Toggle active={reportEnabled} onPress={() => setReportEnabled((current) => !current)} />
        </View>
        <Text style={styles.description}>주간 분석 리포트가 생성되었을 때 알림으로 알려드립니다.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    paddingBottom: 28,
    paddingHorizontal: 22,
  },
  header: {
    borderBottomColor: '#EFEFEF',
    borderBottomWidth: 1,
    marginHorizontal: -22,
    paddingHorizontal: 22,
    paddingTop: 54,
  },
  logo: {
    height: 30,
    width: 100,
  },
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    marginLeft: -8,
    marginTop: 8,
    width: 38,
  },
  backText: {
    color: '#111111',
    fontSize: 32,
    lineHeight: 34,
  },
  title: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 18,
  },
  settingBlock: {
    marginTop: 18,
  },
  intervalBlock: {
    position: 'relative',
    zIndex: 20,
  },
  settingPill: {
    alignItems: 'center',
    backgroundColor: '#D8D8D8',
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 5,
  },
  settingTitle: {
    color: '#111111',
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '900',
  },
  intervalPill: {
    gap: 10,
    paddingRight: 10,
  },
  intervalSelect: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    minWidth: 78,
    paddingHorizontal: 12,
  },
  intervalSelectText: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '900',
  },
  dropdown: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D8D8',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 12,
    maxHeight: 180,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    top: 47,
    width: 98,
    zIndex: 30,
  },
  dropdownList: {
    maxHeight: 180,
  },
  dropdownItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  dropdownItemActive: {
    backgroundColor: OLIVE,
  },
  dropdownText: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '800',
  },
  dropdownTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  description: {
    color: '#8B8B8B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 7,
  },
  divider: {
    backgroundColor: '#DADADA',
    height: 1,
    marginTop: 22,
  },
  toggle: {
    borderRadius: 16,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  toggleActive: {
    alignItems: 'flex-end',
    backgroundColor: OLIVE,
  },
  toggleInactive: {
    alignItems: 'flex-start',
    backgroundColor: '#A8A8A8',
  },
  knob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    width: 24,
  },
});
