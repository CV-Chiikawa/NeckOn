import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { LogoImage } from '@/components/neckon-auth';

// ==============================
// 색상 상수
// ==============================

const DANGER = '#C15555';
const OLIVE = '#889B6C';
const PLACEHOLDER_GRAY = '#D8D8D8';

const SCREEN_PADDING = 22;
const GRID_GAP = 12;

// 프로필 화면의 스냅샷 갤러리 연동 토글 상태를 임시로 저장하는 키입니다.
// 백엔드 연결 전까지 앱 내부에서만 상태를 공유하기 위해 사용합니다.
const SNAPSHOT_GALLERY_KEY = '__neckonSnapshotGalleryEnabled';

// 프로필에서 저장한 연동 상태를 읽어옵니다.
// 값이 아직 없으면 기본값은 true입니다.
const getSnapshotGalleryEnabled = () => {
  const value = (globalThis as Record<string, unknown>)[SNAPSHOT_GALLERY_KEY];

  return typeof value === 'boolean' ? value : true;
};

type Snapshot = {
  id: string;
  imageUrl: string | null;
};

// 백엔드 연결 전 임시 스냅샷 데이터입니다.
// 나중에 서버에서 받아온 이미지 목록으로 바꾸면 됩니다.
const initialSnapshots: Snapshot[] = Array.from({ length: 15 }, (_, index) => ({
  id: `snapshot-${index + 1}`,
  imageUrl: null,
}));

export default function SnapshotGalleryScreen() {
  // ==============================
  // 화면 크기 계산
  // ==============================

  const { width: screenWidth } = useWindowDimensions();

  // 3열 정사각형을 만들기 위해 한 칸의 크기를 직접 계산합니다.
  const snapshotBoxSize = (screenWidth - SCREEN_PADDING * 2 - GRID_GAP * 2) / 3;

  // ==============================
  // 상태값
  // ==============================

  const [snapshotGalleryEnabled, setSnapshotGalleryEnabled] = useState(getSnapshotGalleryEnabled);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;

  // 이 화면에 다시 들어올 때마다 프로필의 연동 상태를 다시 확인합니다.
  // 프로필에서 OFF로 바꾸고 돌아오면 바로 안내 화면이 뜨게 하기 위함입니다.
  useFocusEffect(
    useCallback(() => {
      setSnapshotGalleryEnabled(getSnapshotGalleryEnabled());
    }, [])
  );

  // ==============================
  // 토스트 메시지
  // ==============================

  const showToast = (message: string) => {
    setToastMessage(message);
    toastOpacity.stopAnimation();
    toastOpacity.setValue(0);

    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToastMessage(null);
      }
    });
  };

  // ==============================
  // 삭제 관련 함수
  // ==============================

  const handleTrashPress = () => {
    setDeleteMode(true);
    showToast('삭제하실 이미지를 선택해주세요');
  };

  const toggleSnapshot = (id: string) => {
    if (!deleteMode) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  };

  const handleDeletePress = () => {
    if (selectedIds.length === 0) {
      showToast('삭제하실 이미지를 선택해주세요');
      return;
    }

    setConfirmVisible(true);
  };

  const resetDeleteState = () => {
    setConfirmVisible(false);
    setDeleteMode(false);
    setSelectedIds([]);
  };

  const handleCancelDelete = () => {
    resetDeleteState();
  };

  const handleConfirmDelete = () => {
    setSnapshots((current) =>
      current.filter((snapshot) => !selectedIds.includes(snapshot.id))
    );

    resetDeleteState();
    showToast('삭제되었습니다');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 로고 + 뒤로가기 영역 */}
        <View style={styles.header}>
          <LogoImage style={styles.logo} />

          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>스냅샷 갤러리</Text>

        <Text style={styles.description}>
          자세 분석 중 저장된 스냅샷을 한눈에 확인할 수 있습니다.{'\n'}
          저장된 이미지는 분석 기록 확인 목적으로만 사용되며, 필요 시 삭제할 수 있습니다.
        </Text>

        {/* 
          프로필에서 스냅샷 갤러리 연동을 OFF한 경우입니다.
          이때는 스냅샷 목록과 삭제 버튼을 보여주지 않고 안내 문구만 보여줍니다.
        */}
        {!snapshotGalleryEnabled ? (
          <View style={styles.disabledCard}>
            <Text style={styles.disabledTitle}>스냅샷을 불러올 수 없어요</Text>

            <Text style={styles.disabledDescription}>
              현재 스냅샷 갤러리 연동이 꺼져 있어요.{'\n'}
              마이페이지에서 연동을 켜면 웹에서 저장된 자세 스냅샷을 확인할 수 있어요.
            </Text>

            <Pressable
              onPress={() => router.push('/profile' as never)}
              style={({ pressed }) => [
                styles.profileButton,
                pressed ? styles.profileButtonPressed : null,
              ]}
            >
              <Text style={styles.profileButtonText}>마이페이지로 이동</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 삭제하기 버튼 + 쓰레기통 버튼 */}
            <View style={styles.actionRow}>
              {deleteMode ? (
                <Pressable onPress={handleDeletePress} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>삭제하기</Text>
                </Pressable>
              ) : null}

              <Pressable onPress={handleTrashPress} style={styles.trashButton}>
                <Image
                  source={require('@/assets/images/icon-trash.png')}
                  style={styles.trashImage}
                  resizeMode="contain"
                />
              </Pressable>
            </View>

            {/* 스냅샷 3열 그리드 */}
            <View style={styles.grid}>
              {snapshots.map((snapshot) => {
                const selected = selectedIds.includes(snapshot.id);

                return (
                  <Pressable
                    key={snapshot.id}
                    onPress={() => toggleSnapshot(snapshot.id)}
                    style={[
                      styles.snapshotBox,
                      {
                        width: snapshotBoxSize,
                        height: snapshotBoxSize,
                      },
                      selected ? styles.snapshotBoxSelected : null,
                    ]}
                  >
                    {/* 
                      지금은 백엔드 연결 전이라 회색 네모칸만 보여줍니다.

                      나중에 실제 이미지 URL이 들어오면 아래처럼 사용할 수 있습니다.

                      {snapshot.imageUrl ? (
                        <Image
                          source={{ uri: snapshot.imageUrl }}
                          style={styles.snapshotImage}
                          resizeMode="cover"
                        />
                      ) : null}
                    */}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {toastMessage ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}

      <Modal
        transparent
        visible={confirmVisible}
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>삭제하겠습니까?</Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleConfirmDelete}
                style={[styles.modalButton, styles.yesButton]}
              >
                <Text style={styles.yesButtonText}>Yes</Text>
              </Pressable>

              <Pressable
                onPress={handleCancelDelete}
                style={[styles.modalButton, styles.noButton]}
              >
                <Text style={styles.noButtonText}>No</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ==============================
  // 전체 화면
  // ==============================

  safeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },

  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },

  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 38,
  },

  // ==============================
  // 상단 로고 / 뒤로가기
  // ==============================

  header: {
    borderBottomColor: '#EFEFEF',
    borderBottomWidth: 1,
    marginHorizontal: -SCREEN_PADDING,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 5,
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

  // ==============================
  // 제목 / 설명
  // ==============================

  title: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 22,
  },

  description: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 9,
  },

  // ==============================
  // 연동 OFF 안내 카드
  // ==============================

  disabledCard: {
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderColor: '#EFEFEF',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 48,
    paddingHorizontal: 22,
    paddingVertical: 34,
  },

  disabledTitle: {
    color: '#111111',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },

  disabledDescription: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center',
  },

  profileButton: {
    alignItems: 'center',
    backgroundColor: OLIVE,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 28,
  },

  profileButtonPressed: {
    opacity: 0.82,
  },

  profileButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  // ==============================
  // 삭제 버튼 영역
  // ==============================

  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 18,
  },

  deleteButton: {
    backgroundColor: DANGER,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  trashButton: {
    alignItems: 'center',
    backgroundColor: '#F3F3F3',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },

  trashImage: {
    height: 22,
    width: 22,
  },

  // ==============================
  // 스냅샷 그리드
  // ==============================

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GRID_GAP,
    rowGap: GRID_GAP,
    marginTop: 16,
  },

  snapshotBox: {
    backgroundColor: PLACEHOLDER_GRAY,
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 3,
    overflow: 'hidden',
  },

  snapshotBoxSelected: {
    borderColor: DANGER,
  },

  snapshotImage: {
    height: '100%',
    width: '100%',
  },

  // ==============================
  // 토스트 메시지
  // ==============================

  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.82)',
    borderRadius: 18,
    bottom: 34,
    paddingHorizontal: 18,
    paddingVertical: 10,
    position: 'absolute',
  },

  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ==============================
  // 삭제 확인 팝업
  // ==============================

  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    width: '100%',
  },

  modalTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },

  modalButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },

  yesButton: {
    backgroundColor: DANGER,
  },

  noButton: {
    backgroundColor: '#F2F2F2',
  },

  yesButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  noButtonText: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '900',
  },
});