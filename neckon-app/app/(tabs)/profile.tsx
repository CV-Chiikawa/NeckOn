// app/(tabs)/profile.tsx
// 하단 탭 중 "사용자" 탭에 해당하는 마이페이지 화면입니다.
// 프로필 카드, 요약 카드, 메뉴 리스트, 스냅샷 갤러리 연동 토글, 회원탈퇴 버튼을 보여줍니다.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LogoImage } from '@/components/neckon-auth';
import { api, clearAuthToken, type ApiUser, type TodayDashboard } from '@/services/api';

// 마이페이지에서 사용하는 메인 올리브 색상입니다.
// 프로필 카드 배경, 요약 카드 숫자 색, 토글 ON 색상 등에 사용됩니다.
const OLIVE = '#889B6C';

// ==============================
// 스냅샷 갤러리 연동 상태 임시 저장 키
// ==============================

// 백엔드 연결 전까지 앱 안에서 스냅샷 갤러리 연동 상태를 임시로 공유하기 위한 키입니다.
// profile.tsx에서 OFF로 바꾸면 snapshot.tsx에서도 이 값을 읽어서
// “스냅샷을 불러올 수 없어요” 화면을 보여줄 수 있습니다.
const SNAPSHOT_GALLERY_KEY = '__neckonSnapshotGalleryEnabled';

// 현재 저장된 스냅샷 갤러리 연동 상태를 읽어오는 함수입니다.
// 저장된 값이 없으면 기본값은 true, 즉 ON 상태입니다.
const getSnapshotGalleryEnabled = () => {
  const value = (globalThis as Record<string, unknown>)[SNAPSHOT_GALLERY_KEY];

  return typeof value === 'boolean' ? value : true;
};

// 스냅샷 갤러리 연동 상태를 저장하는 함수입니다.
// true면 연동 ON, false면 연동 OFF입니다.
const saveSnapshotGalleryEnabled = (enabled: boolean) => {
  (globalThis as Record<string, unknown>)[SNAPSHOT_GALLERY_KEY] = enabled;
};

// ==============================
// 마이페이지 메뉴 목록
// ==============================
//
// href가 있는 항목은 해당 화면으로 이동합니다.
// action이 logout인 항목은 로그아웃 동작을 실행합니다.
//
// 메뉴를 추가하고 싶으면 여기에 항목을 추가하면 됩니다.
// 예:
// { title: '알림 설정', href: '/notification-settings' },
const menuItems = [
  { title: '회원정보 수정', href: '/edit-profile' },
  { title: '문의하기', href: '/inquiry' },
  { title: '로그아웃', action: 'logout' },
] as const;

export default function ProfileScreen() {
  // Expo Router 화면 이동 기능입니다.
  // router.push('/edit-profile')처럼 쓰면 해당 화면으로 이동합니다.
  const router = useRouter();

  // 스냅샷 갤러리 연동 선택 동의 상태입니다.
  // getSnapshotGalleryEnabled를 기본값으로 사용해서,
  // 이전에 OFF로 바꿔둔 상태가 있으면 OFF 상태로 표시됩니다.
  const [snapshotGalleryEnabled, setSnapshotGalleryEnabled] = useState(getSnapshotGalleryEnabled);
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [summary, setSummary] = useState<TodayDashboard | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const [profileResponse, dashboardResponse] = await Promise.all([
          api.getProfile(),
          api.getTodayDashboard(),
        ]);

        setProfile(profileResponse.data);
        setSummary(dashboardResponse.data);
      } catch (error) {
        console.warn('Failed to fetch profile data', error);
      }
    };

    fetchProfile();
  }, []);

  // 로그아웃 버튼을 눌렀을 때 실행되는 함수입니다.
  // dismissAll()은 쌓여 있는 화면 스택을 정리하고,
  // replace('/')는 첫 시작 화면인 app/index.tsx로 이동합니다.
  const handleLogout = async () => {
    await clearAuthToken();
    router.dismissAll();
    router.replace('/');
  };

  // 스냅샷 갤러리 연동 토글을 눌렀을 때 실행되는 함수입니다.
  // 화면 상태도 바꾸고, snapshot.tsx에서 읽을 수 있도록 globalThis에도 저장합니다.
  const handleSnapshotToggle = () => {
    setSnapshotGalleryEnabled((current) => {
      const next = !current;

      saveSnapshotGalleryEnabled(next);

      return next;
    });
  };

  return (
    // ScrollView:
    // 마이페이지 내용이 길어질 경우 세로로 스크롤 가능하게 만듭니다.
    // style={styles.screen}: 전체 배경 설정
    // contentContainerStyle={styles.content}: 내부 콘텐츠 여백 설정
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 
        상단 로고 영역입니다.
        로고 위치를 아래로 내리고 싶으면 styles.header의 paddingTop을 키우면 됩니다.
        로고 아래 여백을 늘리고 싶으면 styles.header의 paddingBottom을 키우면 됩니다.
      */}
      <View style={styles.header}>
        <LogoImage style={styles.logo} />
      </View>

      {/* 
        프로필 카드 영역입니다.
        올리브색 카드 안에 프로필 사진, 닉네임, 자세 등급, 누적 시간을 보여줍니다.

        카드 크기/위치 조정:
        - 카드 전체 높이: styles.profileCard의 minHeight
        - 카드 좌우 여백: marginHorizontal
        - 카드 위쪽 위치: marginTop
        - 카드 안쪽 여백: paddingHorizontal, paddingVertical
        - 카드 둥근 정도: borderRadius
      */}
      <View style={styles.profileCard}>
        {/* 
          프로필 이미지 자리입니다.
          현재는 실제 이미지 대신 N 이니셜을 보여주는 원형 아바타입니다.

          실제 사진으로 바꾸려면 이 View 안의 Text 대신 Image를 넣으면 됩니다.
        */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.nickname ?? profile?.email ?? 'N').charAt(0).toUpperCase()}</Text>
        </View>

        {/* 
          프로필 텍스트 묶음입니다.
          닉네임, 자세 등급, 누적 시간이 들어갑니다.
        */}
        <View style={styles.profileTextWrap}>
          <Text style={styles.name}>{profile?.nickname ?? '거북이'}</Text>
          <Text style={styles.info}>나의 바른자세 등급 1단계</Text>
          <Text style={styles.info}>바른자세 누적 시간 {summary?.total_usage_minutes ?? 489} min</Text>
        </View>
      </View>

      {/* 
        간단한 요약 카드입니다.
        마이페이지가 비어 보이지 않도록
        누적 시간 / 감지 횟수 / 유지율을 한 줄 카드로 보여줍니다.
      */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary?.total_usage_minutes ?? 489}</Text>
          <Text style={styles.summaryLabel}>누적 시간</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary?.danger_count ?? 12}</Text>
          <Text style={styles.summaryLabel}>감지 횟수</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(summary?.good_posture_rate ?? 45)}%</Text>
          <Text style={styles.summaryLabel}>유지율</Text>
        </View>
      </View>

      {/* 
        메뉴 리스트 영역입니다.
        menuItems 배열을 반복해서 메뉴 버튼을 생성합니다.

        메뉴 버튼 간격을 조정하려면 styles.menu의 gap을 수정하면 됩니다.
        메뉴 전체를 위/아래로 이동하려면 styles.menu의 paddingTop을 수정하면 됩니다.
      */}
      <View style={styles.menu}>
        {menuItems.map((item) => {
          // 각 메뉴 항목을 눌렀을 때 실행되는 함수입니다.
          const handlePress = () => {
            // href가 있는 메뉴는 해당 경로로 이동합니다.
            // 예: 회원정보 수정 -> /edit-profile
            if ('href' in item) {
              router.push(item.href as never);
              return;
            }

            // action이 logout인 메뉴는 로그아웃 함수를 실행합니다.
            if ('action' in item && item.action === 'logout') {
              handleLogout();
            }
          };

          // 현재 메뉴가 로그아웃인지 확인합니다.
          // 로그아웃 메뉴만 글자 색을 다르게 주기 위해 사용합니다.
          const isLogout = 'action' in item && item.action === 'logout';

          return (
            <View key={item.title}>
              <Pressable onPress={handlePress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
                <View style={styles.menuButton}>
                  <Text style={[styles.menuText, isLogout ? styles.logoutText : null]}>{item.title}</Text>

                  <Image
                    source={require('@/assets/images/icon-arrow-right.png')}
                    style={styles.arrowIcon}
                    resizeMode="contain"
                  />
                </View>
              </Pressable>

              {/* 
                회원정보 수정 카드 바로 아래에 보여주는 선택 연동 설정 카드입니다.
                사용자가 여기서 OFF로 바꾸면 snapshot.tsx에서 안내 화면이 보이게 됩니다.
              */}
              {'href' in item && item.href === '/edit-profile' ? (
                <View style={styles.snapshotCard}>
                  <View style={styles.snapshotTextWrap}>
                    <Text style={styles.snapshotTitle}>스냅샷 갤러리 연동</Text>
                    <Text style={styles.snapshotDescription}>
                      웹에서 저장된 자세 스냅샷을 앱에서 확인할 수 있어요.
                    </Text>
                  </View>

                  {/* 
                    ON/OFF 토글 버튼입니다.
                    snapshotGalleryEnabled가 true면 오른쪽 초록색,
                    false면 왼쪽 회색으로 보입니다.
                  */}
                  <Pressable
                    onPress={handleSnapshotToggle}
                    style={[
                      styles.snapshotToggle,
                      snapshotGalleryEnabled ? styles.snapshotToggleActive : styles.snapshotToggleInactive,
                    ]}
                  >
                    <View style={styles.snapshotToggleKnob} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* 
        회원탈퇴 버튼입니다.
        다른 메뉴 버튼처럼 크게 강조하지 않고,
        화면 아래쪽에 작은 텍스트 버튼처럼 표시합니다.
      */}
      <Pressable style={styles.withdrawButton}>
        <Text style={styles.withdrawText}>회원탈퇴</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ==============================
  // 화면 전체
  // ==============================

  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },

  content: {
    // 하단 탭바가 화면 위에 떠 있기 때문에,
    // 마지막 내용이 탭바에 가려지지 않도록 아래 여백을 크게 줍니다.
    paddingBottom: 148,
  },

  // ==============================
  // 상단 헤더 / 로고 영역
  // ==============================

  header: {
    // 로고 아래쪽 여백입니다.
    // 프로필 카드와 로고 사이가 너무 붙어 있으면 키우면 됩니다.
    paddingBottom: 10,

    // 좌우 여백입니다.
    paddingHorizontal: 22,

    // 화면 위에서 로고까지의 거리입니다.
    // 로고를 더 아래로 내리고 싶으면 이 값을 키우면 됩니다.
    paddingTop: 54,
  },

  logo: {
    height: 30,
    width: 100,
  },

  // ==============================
  // 프로필 카드 영역
  // ==============================

  profileCard: {
    alignItems: 'center',
    backgroundColor: OLIVE,
    borderRadius: 28,
    flexDirection: 'row',
    gap: 18,
    marginHorizontal: 22,
    marginTop: 10,
    minHeight: 132,
    paddingHorizontal: 22,
    paddingVertical: 24,

    // iOS 그림자 설정입니다.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 16,

    // Android 그림자 설정입니다.
    elevation: 6,
  },

  avatar: {
    alignItems: 'center',
    backgroundColor: '#D8DED0',
    borderColor: '#FFFFFF',
    borderRadius: 38,
    borderWidth: 3,
    height: 76,
    justifyContent: 'center',
    width: 76,

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },

  avatarText: {
    color: '#596944',
    fontSize: 30,
    fontWeight: '900',
  },

  profileTextWrap: {
    flex: 1,
    gap: 4,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 4,
  },

  info: {
    color: 'rgba(255, 255, 255, 0.94)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },

  // ==============================
  // 요약 카드 영역
  // ==============================

  summaryCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EFEFEF',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 22,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,

    elevation: 3,
  },

  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },

  summaryValue: {
    color: OLIVE,
    fontSize: 18,
    fontWeight: '900',
  },

  summaryLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  summaryDivider: {
    backgroundColor: '#EFEFEF',
    height: 30,
    width: 1,
  },

  // ==============================
  // 메뉴 리스트 영역
  // ==============================

  menu: {
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 18,
  },

  pressed: {
    opacity: 0.82,
  },

  menuButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#ECECEC',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 16,

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,

    elevation: 2,
  },

  menuText: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '900',
  },

  logoutText: {
    color: '#65734F',
  },

  arrowIcon: {
    height: 18,
    opacity: 0.55,
    width: 18,
  },

  // ==============================
  // 스냅샷 갤러리 연동 설정 카드
  // ==============================

  snapshotCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#ECECEC',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',

    // 회원정보 수정 카드와 스냅샷 카드 사이 간격입니다.
    marginTop: 10,

    // 설명 문구가 들어가므로 일반 메뉴 카드보다 살짝 높게 둡니다.
    minHeight: 72,

    paddingHorizontal: 16,
    paddingVertical: 12,

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,

    elevation: 2,
  },

  snapshotTextWrap: {
    flex: 1,
    justifyContent: 'center',

    // 텍스트와 토글 사이 간격입니다.
    paddingRight: 16,
  },

  snapshotTitle: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '900',
  },

  snapshotDescription: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 5,
  },

  // 토글 전체 바입니다.
  snapshotToggle: {
    borderRadius: 16,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },

  // ON 상태일 때 토글입니다.
  // 초록색 배경 + 동그라미 오른쪽 정렬입니다.
  snapshotToggleActive: {
    alignItems: 'flex-end',
    backgroundColor: OLIVE,
  },

  // OFF 상태일 때 토글입니다.
  // 회색 배경 + 동그라미 왼쪽 정렬입니다.
  snapshotToggleInactive: {
    alignItems: 'flex-start',
    backgroundColor: '#A8A8A8',
  },

  // 토글 안의 흰색 동그라미입니다.
  snapshotToggleKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    width: 24,
  },

  // ==============================
  // 회원탈퇴 텍스트 버튼
  // ==============================

  withdrawButton: {
    alignSelf: 'center',
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  withdrawText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '700',
  },
});
