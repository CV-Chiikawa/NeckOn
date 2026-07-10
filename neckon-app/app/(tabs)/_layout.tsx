import { Tabs } from 'expo-router';
import { Image, StyleSheet } from 'react-native';

// 하단 탭에서 사용할 활성/비활성 아이콘 이미지입니다.
// focused 값에 따라 올리브색 아이콘과 회색 아이콘을 바꿔 보여줍니다.
const tabIcons = {
  profile: {
    active: require('@/assets/images/icon-user-active.png'),
    inactive: require('@/assets/images/icon-user.png'),
  },
  home: {
    active: require('@/assets/images/icon-home-active.png'),
    inactive: require('@/assets/images/icon-home.png'),
  },
  notifications: {
    active: require('@/assets/images/icon-bell-active.png'),
    inactive: require('@/assets/images/icon-bell.png'),
  },
};

// 탭 아이콘을 그리는 작은 컴포넌트입니다.
function TabIcon({
  focused,
  name,
}: {
  focused: boolean;
  name: keyof typeof tabIcons;
}) {
  return (
    <Image
      source={focused ? tabIcons[name].active : tabIcons[name].inactive}
      style={styles.tabIcon}
      resizeMode="contain"
    />
  );
}

// 하단 탭바 레이아웃입니다.
// 사용자 / 홈 / 알림 3개 탭을 만들고, 라벨 없이 아이콘만 보여줍니다.
export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // 탭바를 반투명 floating pill처럼 보이게 하는 스타일입니다.
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: styles.tabBar,
      }}>
      <Tabs.Screen
        name="profile"
        options={{
          title: '사용자',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="profile" />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="home" />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '알림',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="notifications" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 28,
    borderWidth: 1,
    elevation: 10,
    height: 62,
    paddingBottom: 8,
    paddingTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    height: 25,
    width: 25,
  },
});
