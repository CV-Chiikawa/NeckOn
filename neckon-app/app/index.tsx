import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LogoImage } from '@/components/neckon-auth';
import { getAuthToken } from '@/services/api';

const OLIVE = '#889B6C';

// 화면 크기를 가져옵니다.
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 하단 카드 전체 높이입니다.
// 값이 클수록 카드가 펼쳐졌을 때 더 높게 올라옵니다.
const CARD_FULL_HEIGHT = SCREEN_HEIGHT * 0.46;

// 처음 화면에서 보이는 카드 높이입니다.
// 로고랑 문구만 보이게 하려면 120~150 정도가 좋아요.
const CARD_VISIBLE_HEIGHT = 140;

// 접힌 상태에서 카드가 아래로 내려가는 거리입니다.
// 전체 카드 높이에서 보이는 높이만큼만 남기고 나머지를 아래로 숨깁니다.
const CARD_COLLAPSED_Y = CARD_FULL_HEIGHT - CARD_VISIBLE_HEIGHT;

// 펼쳐진 상태의 위치입니다.
const CARD_EXPANDED_Y = 0;

export default function StartScreen() {
  const router = useRouter();

  // 처음에는 접힌 상태로 시작합니다.
  const cardTranslateY = useRef(new Animated.Value(CARD_COLLAPSED_Y)).current;

  // 현재 카드 위치를 기억합니다.
  const currentCardY = useRef(CARD_COLLAPSED_Y);

  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      const token = await getAuthToken();

      if (token) {
        router.replace('/(tabs)/' as never);
      }
    };

    redirectIfLoggedIn();
  }, [router]);

  // 카드를 특정 위치로 부드럽게 이동시키는 함수입니다.
  const animateCardTo = (toValue: number) => {
    currentCardY.current = toValue;

    Animated.spring(cardTranslateY, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 70,
    }).start();
  };

  // 하단 카드를 위아래로 드래그할 수 있게 만드는 설정입니다.
  const panResponder = useRef(
    PanResponder.create({
      // 처음 터치만으로는 드래그를 시작하지 않습니다.
      // 버튼 터치랑 충돌을 줄이기 위해서입니다.
      onStartShouldSetPanResponder: () => false,

      // 손가락을 위아래로 충분히 움직였을 때만 드래그로 인식합니다.
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVerticalMove = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const movedEnough = Math.abs(gestureState.dy) > 8;

        return isVerticalMove && movedEnough;
      },

      // 드래그 중 카드가 손가락을 따라 움직입니다.
      onPanResponderMove: (_, gestureState) => {
        const nextY = currentCardY.current + gestureState.dy;

        // 카드가 너무 위/아래로 벗어나지 않게 제한합니다.
        const limitedY = Math.max(
          CARD_EXPANDED_Y,
          Math.min(CARD_COLLAPSED_Y, nextY)
        );

        cardTranslateY.setValue(limitedY);
      },

      // 손을 떼면 가까운 쪽으로 자동 정렬됩니다.
      onPanResponderRelease: (_, gestureState) => {
        const nextY = currentCardY.current + gestureState.dy;

        // 위로 충분히 끌었거나 카드가 절반 이상 올라갔으면 펼칩니다.
        const shouldOpen = gestureState.dy < -35 || nextY < CARD_COLLAPSED_Y / 2;

        animateCardTo(shouldOpen ? CARD_EXPANDED_Y : CARD_COLLAPSED_Y);
      },

      // 드래그가 취소돼도 현재 위치 기준으로 정리합니다.
      onPanResponderTerminate: () => {
        animateCardTo(currentCardY.current);
      },
    })
  ).current;

  return (
    <View style={styles.screen}>
      {/* 상단 이미지 영역 */}
      <View style={styles.heroWrap}>
        <ImageBackground
          source={require('@/assets/images/FirstScreen.png')}
          style={styles.hero}
          imageStyle={styles.heroImage}
          resizeMode="cover"
        />
      </View>

      {/* 
        하단 카드입니다.
        position: absolute로 화면 아래에 붙어 있고,
        처음에는 아래로 숨어 있다가 위로 드래그하면 올라옵니다.
      */}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* 드래그 손잡이 */}
        <View style={styles.dragHandle} />

        {/* 로고 */}
        <LogoImage style={styles.logo} />

        {/* 문구 */}
        <Text style={styles.tagline}>오늘부터 시작하는 바른자세 습관</Text>

        {/* 로그인/회원가입 버튼 */}
        <View style={styles.buttonGroup}>
          <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>로그인</Text>
          </Pressable>

          <Pressable style={styles.signupButton} onPress={() => router.push('/terms')}>
            <Text style={styles.signupButtonText}>회원가입</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 전체 화면
  screen: {
    flex: 1,
    backgroundColor: '#F7EFE9',
    overflow: 'hidden',
  },

  // ==============================
  // 상단 이미지 영역
  // ==============================

  heroWrap: {
    height: '100%',
    width: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },

  hero: {
    flex: 1,

    // 이미지를 화면보다 살짝 크게 만들어 꽉 차 보이게 합니다.
    width: SCREEN_WIDTH * 1.2,
    marginLeft: -(SCREEN_WIDTH * 0.09),
  },

  heroImage: {
    width: SCREEN_WIDTH * 1.12,

    // 이미지 위치 조절입니다.
    // 더 크게 보이고 싶으면 scale을 1.12 정도로,
    // 더 아래로 내리고 싶으면 translateY를 50 정도로 바꾸세요.
    transform: [{ scale: 1.12 }, { translateY: 45 }],
  },

  // ==============================
  // 하단 드래그 카드
  // ==============================

  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,

    height: CARD_FULL_HEIGHT,

    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',

    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,

    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },

  // 카드 위 작은 손잡이 바
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(166, 166, 166, 0.28)',
    marginBottom: 12,
  },

  // 로고 크기
  logo: {
    width: 115,
    height: 40,
    marginTop: 15,
  },

  // 로고 아래 문구
  tagline: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 34,
    textAlign: 'center',
  },

  // ==============================
  // 버튼 영역
  // ==============================

  buttonGroup: {
    alignItems: 'center',
    width: '100%',
    gap: 20,
    marginTop: 20,
  },

  loginButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '91%',
    height: 52,
    borderRadius: 26,
    backgroundColor: OLIVE,

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },

  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  signupButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '91%',
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#999',

    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  signupButtonText: {
    color: '#555',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});
