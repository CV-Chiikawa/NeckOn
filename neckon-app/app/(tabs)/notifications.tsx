// notifications.tsx
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LogoImage } from '@/components/neckon-auth';
import { api, type NotificationItem } from '@/services/api';

// 알림 목록에 보여줄 날짜별 더미 데이터입니다.
// 실제 알림 API를 연결하기 전까지 화면 확인용으로 사용합니다.
const notificationGroups = [
  {
    title: '오늘',
    items: [
      { time: '14:20', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '1시간 동안 바른 자세를 유지하셨습니다.' },
    ],
  },
  {
    title: '어제',
    items: [
      { time: '14:20', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '1시간 동안 바른 자세를 유지하셨습니다.' },
      { time: '13:31', message: '1시간 동안 바른 자세를 유지하셨습니다.' },
    ],
  },
  {
    title: '그저께',
    items: [
      { time: '14:20', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '거북목 자세가 감지되었습니다.' },
      { time: '13:31', message: '1시간 동안 바른 자세를 유지하셨습니다.' },
      { time: '13:31', message: '1시간 동안 바른 자세를 유지하셨습니다.' },
    ],
  },
];

type NotificationGroup = typeof notificationGroups[number];

const hasTimezone = (value: string) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);

const toDate = (value: string) => {
  const normalized = value.trim().replace(' ', 'T');

  return new Date(hasTimezone(normalized) ? normalized : `${normalized}Z`);
};

const formatDateTitle = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return '오늘';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return '어제';
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const groupNotifications = (items: NotificationItem[]): NotificationGroup[] => {
  const groups = new Map<string, NotificationGroup['items']>();

  items.forEach((item) => {
    const date = toDate(item.created_at);
    const title = formatDateTitle(date);
    const time = Number.isNaN(date.getTime())
      ? item.created_at
      : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    groups.set(title, [
      ...(groups.get(title) ?? []),
      {
        time,
        message: item.message,
      },
    ]);
  });

  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
};

// 알림 탭 화면입니다.
// 오늘/어제/그저께 섹션으로 알림 시간과 메시지를 보여줍니다.
export default function NotificationsScreen() {
  const [groups, setGroups] = useState<NotificationGroup[]>(notificationGroups);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await api.getNotifications();
        const items = Array.isArray(response) ? response : response.data;

        if (items.length > 0) {
          setGroups(groupNotifications(items));
        }
      } catch (error) {
        console.warn('Failed to fetch notifications', error);
      }
    };

    fetchNotifications();
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <LogoImage style={styles.logo} />
        {/* 설정 아이콘을 누르면 알림 설정 화면으로 이동합니다. */}
        <Pressable style={styles.settingsButton} onPress={() => router.push('/notification-settings' as never)}>
          <Image source={require('@/assets/images/icon-settings.png')} style={styles.settingsIcon} resizeMode="contain" />
        </Pressable>
      </View>

      {/* 날짜별 알림 그룹을 반복해서 화면에 표시합니다. */}
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.items.map((item, index) => (
            <View key={`${group.title}-${item.time}-${index}`} style={styles.notificationRow}>
              <Text style={styles.time}>{item.time}</Text>
              <Text style={styles.message}>{item.message}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    paddingBottom: 148,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#F1F1F1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 15,
    paddingHorizontal: 22,
    paddingTop: 52,
  },
  logo: {
    height: 30,
    width: 100,
  },
  settingsButton: {
    alignItems: 'center',
    height: 33,
    justifyContent: 'center',
    width: 33,
  },
  settingsIcon: {
    height: 20,
    width: 20,
  },
  group: {
    borderBottomColor: '#D9D9D9',
    borderBottomWidth: 1,
    marginHorizontal: 22,
    paddingBottom: 14,
    paddingTop: 18,
  },
  groupTitle: {
    color: '#111111',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 12,
  },
  notificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minHeight: 27,
  },
  time: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '800',
    width: 42,
  },
  message: {
    color: '#454545',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
});
