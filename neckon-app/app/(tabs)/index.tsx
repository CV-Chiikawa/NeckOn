// app/(tabs)/index.tsx
// 하단 탭 중 "홈" 탭에 해당하는 대시보드 화면입니다.
// 이 화면에는 아래 요소들이 순서대로 들어갑니다.
// 1. 상단 로고
// 2. 오늘의 총 이용 시간 이미지 카드
// 3. 거북목 감지 횟수
// 4. 바른 자세 유지율
// 5. 주간 리포트
// 6. 단계별 스트레칭 추천 카드

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { api, type TodayDashboard } from '@/services/api';

// 앱에서 반복해서 사용하는 메인 올리브 색상입니다.
// 단계 버튼 선택 색, 원형 그래프 색 등에 사용됩니다.
const OLIVE = '#889B6C';

// 주간 리포트 막대그래프에 사용하는 조금 더 진한 올리브 색입니다.
const OLIVE_DARK = '#66784B';

// 스트레칭 단계는 1, 2, 3 중 하나만 선택할 수 있게 타입으로 제한합니다.
type StretchStage = 1 | 2 | 3;

// 스트레칭 카드 데이터 타입입니다.
// 현재는 완성형 이미지 카드만 보여줄 예정이므로 id와 image만 사용합니다.
// title, description, helper 같은 텍스트는 일부러 제거했습니다.
type StretchItem = {
  // map으로 반복 렌더링할 때 key로 사용할 고유값입니다.
  id: string;

  // React Native Image에서 사용할 이미지 파일입니다.
  image: ImageSourcePropType;
};

// 단계별 스트레칭 이미지 목록입니다.
// 1단계 버튼을 누르면 1번 배열,
// 2단계 버튼을 누르면 2번 배열,
// 3단계 버튼을 누르면 3번 배열이 화면에 표시됩니다.
//
// 이미지 파일 위치:
// assets/images/Stretching/파일명.png
//
// 파일명이나 폴더명이 실제와 한 글자라도 다르면 오류가 납니다.
// 특히 Stretching의 S 대문자 주의하세요.
const stretchingByStage: Record<StretchStage, StretchItem[]> = {
  1: [
    {
      id: 'stage1-1',
      image: require('@/assets/images/Stretching/stage1_1_chin_tuck.png'),
    },
    {
      id: 'stage1-2',
      image: require('@/assets/images/Stretching/stage1_2_neck_tilt.png'),
    },
    {
      id: 'stage1-3',
      image: require('@/assets/images/Stretching/stage1_3_shoulder_roll.png'),
    },
    {
      id: 'stage1-4',
      image: require('@/assets/images/Stretching/stage1_4_chest_open.png'),
    },
  ],
  2: [
    {
      id: 'stage2-1',
      image: require('@/assets/images/Stretching/stage2_1_trapezius_stretch.png'),
    },
    {
      id: 'stage2-2',
      image: require('@/assets/images/Stretching/stage2_2_scapular_squeeze.png'),
    },
    {
      id: 'stage2-3',
      image: require('@/assets/images/Stretching/stage2_3_wall_angel.png'),
    },
    {
      id: 'stage2-4',
      image: require('@/assets/images/Stretching/stage2_4_neck_back_stretch.png'),
    },
  ],
  3: [
    {
      id: 'stage3-1',
      image: require('@/assets/images/Stretching/stage3_1_advanced_chin_tuck.png'),
    },
    {
      id: 'stage3-2',
      image: require('@/assets/images/Stretching/stage3_2_doorway_chest_stretch.png'),
    },
    {
      id: 'stage3-3',
      image: require('@/assets/images/Stretching/stage3_3_thoracic_extension.png'),
    },
    {
      id: 'stage3-4',
      image: require('@/assets/images/Stretching/stage3_4_upper_back_strength.png'),
    },
  ],
};

// 주간 리포트 막대그래프용 더미 데이터입니다.
// value 값이 클수록 막대가 높아집니다.
const weekData = [
  { day: '월', value: 26 },
  { day: '화', value: 78 },
  { day: '수', value: 14 },
  { day: '목', value: 100 },
  { day: '금', value: 52 },
  { day: '토', value: 88 },
  { day: '일', value: 72 },
];

const dayLabelMap: Record<string, string> = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
};

const formatUsageMinutes = (minutes: number) => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    return restMinutes > 0 ? `${hours}시간 ${restMinutes}분` : `${hours}시간`;
  }

  return `${minutes}분`;
};

export default function DashboardScreen() {
  // 현재 선택된 스트레칭 단계입니다.
  // 기본값이 1이라서 화면 처음 들어오면 1단계 카드가 보입니다.
  // 2단계 버튼을 누르면 2, 3단계 버튼을 누르면 3으로 바뀝니다.
  const [selectedStage, setSelectedStage] = useState<StretchStage>(1);
  const [todayDashboard, setTodayDashboard] = useState<TodayDashboard | null>(null);
  const [weeklyData, setWeeklyData] = useState(weekData);

  // 단계별 스트레칭 카드 가로 스크롤 위치를 직접 조정하기 위한 ref입니다.
  // 1단계 카드를 끝까지 넘긴 뒤 2단계를 눌러도 첫 카드부터 보이게 만들 때 사용합니다.
  const stretchScrollRef = useRef<ScrollView>(null);

  // 단계 버튼을 누르면 선택 단계를 바꾸고, 카드 스크롤 위치를 맨 앞으로 돌립니다.
  const handleStagePress = (stage: StretchStage) => {
    setSelectedStage(stage);

    requestAnimationFrame(() => {
      stretchScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  };

  // 현재 선택된 단계에 맞는 스트레칭 이미지 배열입니다.
  // selectedStage가 1이면 stretchingByStage[1],
  // selectedStage가 2이면 stretchingByStage[2],
  // selectedStage가 3이면 stretchingByStage[3]이 들어갑니다.
  const selectedStretchItems = stretchingByStage[selectedStage];

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [todayResponse, weeklyResponse] = await Promise.all([
          api.getTodayDashboard(),
          api.getWeeklyDashboard(),
        ]);

        setTodayDashboard(todayResponse.data);

        const chart = weeklyResponse.data.chart;
        const maxMinutes = Math.max(...chart.map((item) => item.total_usage_minutes), 1);

        setWeeklyData(
          chart.map((item) => ({
            day: dayLabelMap[item.day_label] ?? item.day_label,
            value: Math.max(14, Math.round((item.total_usage_minutes / maxMinutes) * 100)),
          }))
        );
      } catch (error) {
        console.warn('Failed to fetch dashboard data', error);
      }
    };

    fetchDashboard();
  }, []);

  const totalUsageMinutes = todayDashboard?.total_usage_minutes ?? 180;
  const dangerCount = todayDashboard?.danger_count ?? 12;
  const goodPostureRate = Math.round(todayDashboard?.good_posture_rate ?? 45);

  return (
    // 전체 화면을 세로로 스크롤 가능하게 만듭니다.
    // 대시보드는 내용이 길기 때문에 ScrollView가 필요합니다.
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 
        상단 로고 영역입니다.
        두 번째 시안처럼 로고와 이미지 카드 사이 흰색 여백을 조절하려면
        styles.header의 paddingTop / paddingBottom을 수정하면 됩니다.
      */}
      <View style={styles.header}>
        <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
      </View>

      {/* 
        오늘의 총 이용 시간 이미지 카드입니다.
        첫 번째 실제 화면에서 너무 크게 보이는 부분은 보통 styles.hero의 height 때문입니다.
        두 번째 시안처럼 줄이고 싶으면 hero.height 값을 줄이면 됩니다.
      */}
      <ImageBackground
        source={require('@/assets/images/DashboardImage.png')}
        style={styles.hero}
        imageStyle={styles.heroImage}
        resizeMode="cover">
        {/* 
          이미지 위에 어두운 필터를 덮는 영역입니다.
          이미지가 너무 어두우면 styles.heroOverlay의 rgba 마지막 숫자를 줄이세요.
          예: 0.34 -> 0.25
        */}
        <View style={styles.heroOverlay} />

        {/* 
          이미지 카드 왼쪽 위 제목입니다.
          글자 크기: styles.heroTitle.fontSize
          글자 위치: styles.hero.paddingTop / paddingHorizontal
        */}
        <Text style={styles.heroTitle}>오늘의{'\n'}총 이용 시간</Text>

        {/* 
          3시간 초록색 카드입니다.
          위치는 styles.timeCard의 alignSelf, marginTop으로 조정합니다.
          크기는 width, height로 조정합니다.
        */}
        <View style={styles.timeCard}>
          <Text style={styles.timeText}>{formatUsageMinutes(totalUsageMinutes)}</Text>
        </View>
      </ImageBackground>

      {/* 거북목 감지 횟수 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>거북목 감지 횟수</Text>
        <Text style={styles.sectionCaption}>앱이 실시간으로 분석한 오늘 나의 자세 경고 데이터예요.</Text>

        <View style={styles.detectCard}>
          <Image
            source={require('@/assets/images/icon-posture-detect.png')}
            style={styles.detectIcon}
            resizeMode="contain"
          />

          <View>
            <Text style={styles.detectTitle}>거북목 감지</Text>
            <Text style={styles.detectCount}>{dangerCount}회</Text>
          </View>
        </View>
      </View>

      {/* 바른 자세 유지율 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>바른 자세 유지율</Text>
        <Text style={styles.sectionCaption}>실시간 경고를 통해 개선된 나의 자세 점수예요.</Text>

        <View style={styles.progressWrap}>
          <View style={styles.progressRing}>
            <View style={styles.progressMask} />

            <View style={styles.progressCore}>
              <Text style={styles.progressText}>{goodPostureRate}%</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 주간 리포트 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>주간 리포트</Text>
        <Text style={styles.sectionCaption}>이번 주 올바른 자세 유지 시간을 비교해 보세요.</Text>

        <View style={styles.reportCard}>
          <View style={styles.gridLines}>
            <View style={styles.gridLine} />
            <View style={styles.gridLine} />
            <View style={styles.gridLine} />
            <View style={styles.gridLine} />
          </View>

          <View style={styles.bars}>
            {weeklyData.map((item) => (
              <View key={item.day} style={styles.barItem}>
                <View style={[styles.bar, { height: item.value }]} />
                <Text style={styles.dayLabel}>{item.day}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 
        스냅샷 갤러리 섹션입니다.
        웹에서 저장한 자세 스냅샷을 확인하는 화면으로 이동하는 진입 버튼입니다.
      */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>스냅샷 갤러리</Text>
        <Text style={styles.sectionCaption}>웹에서 저장한 자세 스냅샷을 확인해보세요.</Text>

        <Pressable
          onPress={() => router.push('/snapshot' as never)}
          style={({ pressed }) => [styles.snapshotButton, pressed ? styles.snapshotButtonPressed : null]}>
          <Text style={styles.snapshotButtonText}>확인하러 가기</Text>
        </Pressable>
      </View>

      {/* 
        단계별 스트레칭 추천 섹션입니다.
        1/2/3단계 버튼 + 가로 스크롤 이미지 카드로 구성됩니다.
      */}
      <View style={styles.stretchSection}>
        <Text style={styles.sectionTitle}>단계별 스트레칭 추천</Text>
        <Text style={styles.sectionCaption}>거북목 단계에 따라 필요한 스트레칭을 추천해드려요.</Text>

        {/* 
          1단계 / 2단계 / 3단계 버튼입니다.
          선택된 버튼은 초록색,
          선택되지 않은 버튼은 회색으로 표시됩니다.
        */}
        <View style={styles.stageTabs}>
          {([1, 2, 3] as StretchStage[]).map((stage) => {
            // 현재 버튼이 선택된 단계인지 확인합니다.
            const isSelected = selectedStage === stage;

            return (
              <Pressable
                key={stage}
                // 버튼을 누르면 단계가 바뀌고, 가로 스크롤이 첫 번째 카드로 돌아갑니다.
                onPress={() => handleStagePress(stage)}
                style={[styles.stageButton, isSelected ? styles.stageButtonActive : styles.stageButtonInactive]}>
                <Text style={styles.stageButtonText}>{stage}단계</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 
          스트레칭 이미지 카드 목록입니다.
          horizontal이 있어서 옆으로 넘길 수 있습니다.
          ref를 연결해서 단계가 바뀔 때 첫 번째 카드로 이동시킵니다.
        */}
        <ScrollView
          ref={stretchScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stretchList}>
          {selectedStretchItems.map((item) => (
            <View key={item.id} style={styles.stretchCard}>
              <Image source={item.image} style={styles.stretchImage} resizeMode="cover" />
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ==============================
  // 전체 화면
  // ==============================

  screen: {
    // 전체 화면 배경색입니다.
    backgroundColor: '#FFFFFF',

    // 화면 전체를 차지하게 합니다.
    flex: 1,
  },

  content: {
    // 스크롤 안쪽 아래 여백입니다.
    // 하단 탭바가 floating 형태라 마지막 카드가 가려질 수 있어서 크게 둡니다.
    // 스트레칭 카드가 탭바에 가려지면 210 -> 230, 250으로 키우세요.
    // 여백이 너무 크면 210 -> 180으로 줄이세요.
    paddingBottom: 210,
  },

  // ==============================
  // 상단 헤더 / 로고 영역
  // ==============================

  header: {
    // 로고의 좌우 위치입니다.
    // 값이 클수록 로고가 오른쪽으로 들어갑니다.
    // 값이 작을수록 왼쪽으로 붙습니다.
    paddingHorizontal: 22,

    // 화면 맨 위에서 로고까지의 거리입니다.
    // 첫 번째 실제 폰 화면에서 로고 위 여백이 너무 크면 줄이세요.
    // 예: 54 -> 45 -> 40
    // 로고를 더 아래로 내리고 싶으면 키우세요.
    paddingTop: 54,

    // 로고 아래 흰색 영역 높이입니다.
    // 두 번째 시안처럼 로고 아래 공간을 줄이고 싶으면 10 -> 6
    // 이미지와 로고 사이를 더 띄우고 싶으면 10 -> 18
    paddingBottom: 10,
  },

  logo: {
    // 로고 높이입니다.
    // 로고가 너무 크면 30 -> 26
    // 너무 작으면 30 -> 34
    height: 30,

    // 로고 가로 크기입니다.
    // 로고가 너무 크면 100 -> 90
    // 너무 작으면 100 -> 110
    width: 100,
  },

  // ==============================
  // 오늘의 총 이용 시간 이미지 카드
  // ==============================

  hero: {
    // 이미지 카드 전체 높이입니다.
    // 첫 번째 실제 화면처럼 이미지가 너무 크게 보이면 이 값을 줄이세요.
    // 예: 315 -> 280 -> 260
    // 두 번째 시안처럼 보이려면 260~285 정도를 먼저 시도해보세요.
    height: 315,

    // 이미지 카드 좌우 여백입니다.
    // 0이면 화면 좌우에 꽉 붙습니다.
    // 두 번째 시안처럼 화면에 꽉 찬 느낌이면 0 유지.
    // 카드처럼 좌우 여백을 주고 싶으면 20~22로 바꾸세요.
    marginHorizontal: 0,

    // 로고 영역과 이미지 카드 사이 간격입니다.
    // 이미지가 너무 아래로 내려가 있으면 8 -> 0
    // 로고와 이미지 사이를 띄우고 싶으면 8 -> 14
    marginTop: 8,

    // 둥근 모서리 밖으로 이미지가 삐져나가지 않게 잘라줍니다.
    // 둥근 이미지 카드에는 거의 필수입니다.
    overflow: 'hidden',

    // 이미지 카드 내부 좌우 여백입니다.
    // 제목과 3시간 카드가 좌우에서 얼마나 떨어질지 정합니다.
    // 글자를 더 왼쪽으로 붙이고 싶으면 22 -> 16
    // 더 오른쪽으로 넣고 싶으면 22 -> 28
    paddingHorizontal: 22,

    // 이미지 카드 내부 위쪽 여백입니다.
    // "오늘의 총 이용 시간" 글자가 아래로 내려가 있으면 줄이세요.
    // 예: 40 -> 30
    // 더 아래로 내리고 싶으면 키우세요.
    paddingTop: 40,
  },

  heroImage: {
    // 이미지 카드 아래쪽 둥근 모서리입니다.
    // 더 둥글게 하고 싶으면 18 -> 24
    // 덜 둥글게 하고 싶으면 18 -> 12
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },

  heroOverlay: {
    // ImageBackground 전체를 덮는 설정입니다.
    ...StyleSheet.absoluteFillObject,

    // 이미지 위에 씌우는 어두운 필터입니다.
    // 숫자가 클수록 더 어두워집니다.
    // 첫 번째 실제 화면이 너무 어두우면 0.34 -> 0.25
    // 흰 글씨가 잘 안 보이면 0.34 -> 0.4
    backgroundColor: 'rgba(0, 0, 0, 0.34)',

    // 오버레이도 이미지 카드와 같은 둥근 모서리를 가져야 자연스럽습니다.
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },

  heroTitle: {
    // 제목 글자색입니다.
    color: '#FFFFFF',

    // 제목 크기입니다.
    // 실제 폰에서 너무 크면 25 -> 22
    // 시안처럼 큼직하게 보이려면 25 유지.
    fontSize: 25,

    fontWeight: '900',

    // 줄 간격입니다.
    // "오늘의"와 "총 이용 시간" 사이가 너무 벌어지면 35 -> 31
    // 답답하면 35 -> 38
    lineHeight: 35,
  },

  timeCard: {
    // 카드 안의 3시간 텍스트를 가로 가운데 정렬합니다.
    alignItems: 'center',

    // 초록 시간 카드의 가로 위치입니다.
    // center: 가운데 정렬
    // flex-end: 오른쪽 정렬
    // flex-start: 왼쪽 정렬
    alignSelf: 'center',

    // 초록 카드 배경색입니다.
    // 마지막 0.88은 투명도입니다.
    // 더 연하게: 0.88 -> 0.72
    // 더 진하게: 0.88 -> 1
    backgroundColor: 'rgba(136, 155, 108, 0.88)',

    // 초록 카드 둥근 정도입니다.
    borderRadius: 20,

    // 초록 카드 높이입니다.
    // 첫 번째 화면에서 너무 크면 102 -> 86
    // 더 크게 보이고 싶으면 102 -> 112
    height: 102,

    // 3시간 텍스트를 세로 가운데 정렬합니다.
    justifyContent: 'center',

    // 제목과 초록 카드 사이의 간격입니다.
    // 초록 카드가 너무 아래에 있으면 45 -> 25
    // 더 아래로 내리고 싶으면 45 -> 55
    marginTop: 45,

    // 초록 카드 가로 길이입니다.
    // 너무 넓으면 190 -> 170
    // 더 넓게 하고 싶으면 190 -> 210
    width: 190,
  },

  timeText: {
    color: '#FFFFFF',

    // 3시간 글자 크기입니다.
    // 너무 크면 32 -> 28
    // 더 크게 하려면 32 -> 36
    fontSize: 32,

    fontWeight: '900',
  },

  // ==============================
  // 공통 섹션 스타일
  // ==============================

  section: {
    // 섹션 좌우 여백입니다.
    // 대시보드 전체 텍스트와 카드들이 이 여백에 맞춰 정렬됩니다.
    paddingHorizontal: 22,

    // 이전 요소와 현재 섹션 사이의 위쪽 간격입니다.
    // 섹션 간격이 너무 넓으면 22 -> 16
    // 더 띄우고 싶으면 22 -> 30
    paddingTop: 40,
  },

  sectionTitle: {
    color: '#111111',

    // 섹션 제목 크기입니다.
    // 제목이 너무 크면 18 -> 16
    // 더 강조하고 싶으면 18 -> 20
    fontSize: 18,

    fontWeight: '900',
  },

  sectionCaption: {
    color: '#888888',

    // 회색 설명 문구 크기입니다.
    fontSize: 11,

    fontWeight: '600',

    // 제목과 회색 설명 문구 사이 간격입니다.
    marginTop: 4,
  },

  // ==============================
  // 거북목 감지 횟수 카드
  // ==============================

  detectCard: {
    alignItems: 'center',

    // 카드 자체를 가운데 정렬합니다.
    alignSelf: 'center',

    borderColor: '#B9B9B9',
    borderRadius: 14,
    borderWidth: 1,

    // 아이콘과 텍스트를 가로로 배치합니다.
    flexDirection: 'row',

    // 아이콘과 텍스트 사이 간격입니다.
    gap: 24,

    justifyContent: 'center',

    // 설명 문구와 카드 사이 간격입니다.
    marginTop: 23,

    // 카드 최소 높이입니다.
    // 카드가 너무 높으면 86 -> 74
    // 더 높게 하고 싶으면 86 -> 96
    minHeight: 90,

    // 카드 가로 길이입니다.
    // 78%면 화면보다 조금 좁은 카드입니다.
    // 더 넓게: 78% -> 86%
    // 더 좁게: 78% -> 70%
    width: '70%',
  },

  detectIcon: {
    // 거북목 감지 아이콘 크기입니다.
    height: 38,
    width: 38,
  },

  detectTitle: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '900',
  },

  detectCount: {
    color: '#D05B5B',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },

  // ==============================
  // 바른 자세 유지율 원형 그래프
  // ==============================

  progressWrap: {
    // 원형 그래프를 가운데 정렬합니다.
    alignItems: 'center',

    // 설명 문구와 원형 그래프 사이 간격입니다.
    paddingTop: 30,
  },

  progressRing: {
    alignItems: 'center',
    backgroundColor: OLIVE,

    // 바깥 원 크기입니다.
    // height/width가 136이고 borderRadius가 68이라 원이 됩니다.
    // 원이 너무 크면 136 -> 120, borderRadius 60
    // 더 크게 하고 싶으면 136 -> 150, borderRadius 75
    borderRadius: 100,
    height: 150,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 150,
  },

  progressMask: {
    // 회색 영역입니다.
    // 실제 정확한 차트가 아니라 View를 겹쳐서 만든 더미 그래프입니다.
    backgroundColor: '#A2A2A2',
    bottom: -9,
    left: 4,
    position: 'absolute',
    top: 58,

    // 회색 영역 기울기입니다.
    transform: [{ rotate: '-17deg' }],

    width: 88,
  },

  progressCore: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',

    // 안쪽 흰 원 크기입니다.
    // 바깥 원을 줄이면 이것도 같이 줄이는 게 자연스럽습니다.
    borderRadius: 50,
    height: 90,
    justifyContent: 'center',
    width: 90,
  },

  progressText: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
  },

  // ==============================
  // 주간 리포트 막대그래프
  // ==============================

  reportCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B7B7B7',
    borderRadius: 8,
    borderWidth: 1,

    // 그래프 카드 높이입니다.
    // 너무 작으면 150 -> 170
    // 너무 크면 150 -> 130
    height: 150,

    // 설명문과 그래프 사이 간격입니다.
    marginTop: 20,

    overflow: 'hidden',

    // 그래프 내부 아래 여백입니다.
    paddingBottom: 20,

    // 그래프 내부 좌우 여백입니다.
    paddingHorizontal: 18,

    // 그래프 내부 위 여백입니다.
    paddingTop: 14,
  },

  gridLines: {
    // 점선 영역입니다.
    // 그래프 카드 안쪽에서 점선들이 들어갈 범위를 지정합니다.
    bottom: 34,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 16,

    // 점선 4개를 세로로 균등하게 배치합니다.
    justifyContent: 'space-between',
  },

  gridLine: {
    borderColor: '#CFCFCF',
    borderStyle: 'dotted',
    borderTopWidth: 1,
  },

  bars: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',

    // 막대들을 가로로 균등하게 배치합니다.
    justifyContent: 'space-between',
  },

  barItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',

    // 막대 하나가 차지하는 가로 폭입니다.
    width: 24,
  },

  bar: {
    backgroundColor: OLIVE_DARK,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,

    // 막대 최대 높이입니다.
    // 그래프 밖으로 튀어나오지 않게 제한합니다.
    maxHeight: 112,

    // 막대 굵기입니다.
    width: 18,
  },

  dayLabel: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '800',

    // 막대와 요일 사이 간격입니다.
    marginTop: 5,
  },

  // ==============================
  // 스냅샷 갤러리 섹션
  // ==============================

  snapshotButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: OLIVE,
    borderRadius: 13,
    elevation: 3,
    height: 38,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 141,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  snapshotButtonPressed: {
    opacity: 0.82,
  },

  snapshotButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  // ==============================
  // 단계별 스트레칭 추천 섹션
  // ==============================

  stretchSection: {
    // 스트레칭 섹션 좌우 여백입니다.
    // 다른 섹션과 같은 22를 사용해서 정렬을 맞춥니다.
    paddingHorizontal: 22,

    // 주간 리포트와 스트레칭 추천 제목 사이 간격입니다.
    // 너무 멀면 26 -> 18
    // 더 띄우고 싶으면 26 -> 34
    paddingTop: 33,
  },

  stageTabs: {
    // 1단계 / 2단계 / 3단계 버튼을 가로 배치합니다.
    flexDirection: 'row',

    // 버튼 사이 간격입니다.
    // 버튼이 너무 붙으면 10 -> 14
    // 너무 멀면 10 -> 6
    gap: 13,

    // 회색 설명 문구와 단계 버튼 사이 간격입니다.
    marginTop: 15,
  },

  stageButton: {
    alignItems: 'center',

    // 버튼 모서리를 둥글게 해서 pill 모양으로 만듭니다.
    borderRadius: 18,

    // 버튼 높이입니다.
    // 너무 크면 36 -> 30
    // 더 크게 하고 싶으면 36 -> 40
    height: 34,

    justifyContent: 'center',

    // 버튼 안쪽 좌우 여백입니다.
    // 버튼 가로 크기를 늘리고 싶으면 18 -> 24
    // 줄이고 싶으면 18 -> 14
    paddingHorizontal: 18,
  },

  stageButtonActive: {
    // 현재 선택된 단계 버튼 색입니다.
    // 2단계를 누르면 2단계 버튼이 이 색으로 바뀝니다.
    backgroundColor: OLIVE,
  },

  stageButtonInactive: {
    // 선택되지 않은 단계 버튼 색입니다.
    backgroundColor: '#A8A8A8',
  },

  stageButtonText: {
    color: '#FFFFFF',

    // 단계 버튼 글자 크기입니다.
    fontSize: 13,

    fontWeight: '900',
  },

  stretchList: {
    // 마지막 카드 오른쪽 여백입니다.
    // 마지막 카드가 화면 끝에 너무 붙으면 키우세요.
    paddingRight: 5,

    // 단계 버튼과 스트레칭 카드 사이 간격입니다.
    // 카드가 버튼과 너무 붙으면 16 -> 22
    // 너무 멀면 16 -> 10
    paddingTop: 18,
  },

  stretchCard: {
    // 완성형 이미지 자체에 카드 디자인이 들어 있으므로
    // 바깥 View는 크기와 간격만 담당합니다.
    backgroundColor: 'transparent',

    // 카드끼리의 오른쪽 간격입니다.
    // 옆 카드가 너무 붙으면 14 -> 18
    // 너무 멀면 14 -> 10
    marginRight: 6,

    // 카드 가로 크기입니다.
    // 화면에 카드 1개와 다음 카드 일부가 보이게 하려면 220~240 추천입니다.
    // 더 크게: 230 -> 250
    // 더 작게: 230 -> 210
    width: 230,

    // 카드 세로 크기입니다.
    // 완성형 이미지가 잘리거나 눌려 보이면 여기 조정하세요.
    // 이미지가 정사각형이면 width와 height를 같게 해도 됩니다.
    // 지금 완성형 카드가 세로로 긴 형태라 330 정도로 둡니다.
    // 너무 길면 330 -> 300
    // 더 길게 보이고 싶으면 330 -> 360
    height: 330,
  },

  stretchImage: {
    // 카드 전체를 이미지가 채우게 합니다.
    height: '100%',
    width: '100%',

    // resizeMode는 JSX에서 cover로 주고 있습니다.
    // 이미지가 잘리면 JSX의 resizeMode를 contain으로 바꿔보세요.
  },
});
