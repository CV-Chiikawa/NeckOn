import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthScreen, CheckRow, LogoImage } from '@/components/neckon-auth';

// 약관동의 화면에 보여줄 필수 약관 더미 데이터입니다.
// 실제 서버/API 연결 전까지 화면 확인용으로 사용하는 고정 데이터입니다.
// title: 약관 제목
// description: 약관 아래에 작게 보여줄 설명 문구
const requiredTerms = [
  {
    id: 'privacy',
    title: '[필수] 이용약관 및 개인정보 수집 이용 동의',
    description: undefined,
  },
  {
    id: 'sync',
    title: '[필수] 웹 데이터 동기화 및 기록 저장 동의',
    description: 'PC 앱을 통해 측정된 나의 자세 기록을 앱에서도 실시간으로 확인하고 관리할 수 있어요.',
  },
  {
    id: 'push',
    title: '[필수] 실시간 자세 교정 알림 수신 동의',
    description: 'PC에서 장시간 거북목 위험 신호를 앱 푸시로 즉시 알려드리기 위해 필요해요.',
  },
] as const;

// 선택 약관은 가입에 꼭 필요하지 않은 항목입니다.
// 체크하지 않아도 필수 약관 3개만 동의하면 다음 단계로 이동할 수 있습니다.
const optionalTerms = [
  {
    id: 'snapshotGallery',
    title: '[선택] 스냅샷 갤러리 연동 및 조회 동의',
    description:
      '웹에서 저장된 자세 스냅샷을 모바일 앱에서 확인할 수 있습니다. 동의하지 않아도 기본 자세 분석 기록은 이용할 수 있습니다.',
  },
] as const;

// requiredTerms 배열에 있는 id 값만 TermId 타입으로 사용할 수 있게 만듭니다.
// 예: 'privacy' | 'sync' | 'push'
type TermId = (typeof requiredTerms)[number]['id'];
type OptionalTermId = (typeof optionalTerms)[number]['id'];

export default function TermsScreen() {
  // 각 필수 약관이 체크되었는지 저장합니다.
  // false = 체크 안 됨
  // true = 체크됨
  const [checkedTerms, setCheckedTerms] = useState<Record<TermId, boolean>>({
    privacy: false,
    sync: false,
    push: false,
  });
  // 선택 약관은 필수 약관과 별도로 체크 상태만 관리합니다.
  const [checkedOptionalTerms, setCheckedOptionalTerms] = useState<Record<OptionalTermId, boolean>>({
    snapshotGallery: false,
  });

  // 필수 약관을 체크하지 않고 "다음으로" 버튼을 눌렀을 때
  // 빨간 안내 문구를 보여줄지 말지 관리하는 상태입니다.
  const [showError, setShowError] = useState(false);

  // 필수 약관이 모두 체크되었는지 계산합니다.
  // 하나라도 false면 allChecked는 false입니다.
  // 모든 약관이 true면 allChecked는 true입니다.
  const allChecked = useMemo(
    () => requiredTerms.every((term) => checkedTerms[term.id]),
    [checkedTerms]
  );

  // 전체 동의 체크 표시는 필수 약관과 선택 약관이 모두 체크되었을 때 켜집니다.
  const allTermsChecked = useMemo(
    () => allChecked && optionalTerms.every((term) => checkedOptionalTerms[term.id]),
    [allChecked, checkedOptionalTerms]
  );

  // 약관 한 줄을 누르면 해당 항목만 체크/해제합니다.
  // 체크박스 아이콘뿐 아니라 Pressable로 감싼 문구 영역 전체가 눌립니다.
  const toggleTerm = (id: TermId) => {
    setCheckedTerms((current) => {
      const next = {
        ...current,
        [id]: !current[id],
      };

      // 약관을 모두 체크한 상태가 되면
      // 기존에 떠 있던 빨간 오류 문구를 숨깁니다.
      if (requiredTerms.every((term) => next[term.id])) {
        setShowError(false);
      }

      return next;
    });
  };

  // 선택 약관 문구 영역을 누르면 선택 약관만 체크/해제합니다.
  const toggleOptionalTerm = (id: OptionalTermId) => {
    setCheckedOptionalTerms((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  // 전체 동의를 누르면 필수 약관 전체를 한 번에 체크/해제합니다.
  const toggleAll = () => {
    const nextValue = !allTermsChecked;

    setCheckedTerms({
      privacy: nextValue,
      sync: nextValue,
      push: nextValue,
    });
    setCheckedOptionalTerms({
      snapshotGallery: nextValue,
    });

    // 전체 동의를 체크한 경우에는 오류 문구를 숨깁니다.
    if (nextValue) {
      setShowError(false);
    }
  };

  // 모든 필수 약관에 동의한 경우에만 회원가입 입력 화면으로 이동합니다.
  // 동의하지 않은 약관이 있으면 이동하지 않고 빨간 안내 문구를 보여줍니다.
  const handleNext = () => {
    if (!allChecked) {
      setShowError(true);
      return;
    }

    router.push('/signup');
  };

  return (
    <AuthScreen>
      {/* 
        상단 로고 영역입니다.
        로고 위치를 아래로 내리고 싶으면 styles.logoWrap의 marginTop 값을 키우면 됩니다.
      */}
      <View style={styles.logoWrap}>
        <LogoImage />
      </View>

      {/* 
        "회원가입" 제목입니다.

        회원가입 글자 위치를 오른쪽으로 살짝 옮기고 싶으면
        아래 styles.title에 marginLeft를 추가하면 됩니다.
        예:
        title: {
          ...
          marginLeft: 10,
        }

        또는 더 많이 오른쪽으로 보내고 싶으면 marginLeft 값을 15, 20처럼 키우면 됩니다.
      */}
      <Text style={styles.title}>회원가입</Text>

      {/* 
        약관 카드 영역입니다.
        회색 테두리 네모칸 전체를 담당합니다.

        네모칸 안의 약관 글자 크기는 여기 card 스타일이 아니라,
        CheckRow 컴포넌트 안에서 정해져 있을 가능성이 큽니다.

        즉, 약관 글자 크기를 키우려면:
        components/neckon-auth.tsx 파일 안에 있는 CheckRow 관련 스타일을 찾아야 합니다.

        찾을 이름 예시:
        checkTitle
        checkText
        checkDescription
        rowTitle
        description

        거기에서 fontSize 값을 키우면 됩니다.
        예:
        fontSize: 13 -> 14 또는 15
      */}
      <View style={styles.card}>
        {/* 
          "약관 전체 동의" 줄입니다.
          Pressable로 감싸서 줄 전체를 눌러도 체크/해제됩니다.
        */}
        <Pressable onPress={toggleAll}>
          <CheckRow title="약관 전체 동의" checked={allTermsChecked} strong />
        </Pressable>

        {/* 
          필수 약관들을 반복해서 보여주는 부분입니다.
          requiredTerms 배열에 있는 항목 개수만큼 CheckRow가 생성됩니다.

          각 줄도 Pressable로 감싸져 있어서
          체크박스뿐 아니라 문구를 눌러도 체크/해제됩니다.
        */}
        {requiredTerms.map((term) => (
          <Pressable key={term.id} onPress={() => toggleTerm(term.id)}>
            <CheckRow title={term.title} description={term.description} checked={checkedTerms[term.id]} />
          </Pressable>
        ))}

        {/* 선택 약관입니다. 체크하지 않아도 필수 약관 3개만 동의하면 다음 단계로 이동할 수 있습니다. */}
        {optionalTerms.map((term) => (
          <Pressable key={term.id} onPress={() => toggleOptionalTerm(term.id)}>
            <CheckRow title={term.title} description={term.description} checked={checkedOptionalTerms[term.id]} />
          </Pressable>
        ))}
      </View>

      {/* 
        spacer는 남는 공간을 밀어내는 역할입니다.
        현재 flex: 1이라서 "다음으로" 버튼을 화면 아래쪽으로 밀고 있습니다.

        다음으로 버튼을 위로 올리고 싶으면
        styles.spacer의 flex 값을 줄이거나,
        spacer를 없애거나,
        AuthButton 주변에 marginBottom/marginTop을 따로 조정하면 됩니다.

        가장 쉬운 수정 방법:
        spacer: {
          flex: 1,
        }

        이 값을 아래처럼 줄여보면 버튼이 위로 올라갑니다.
        예:
        spacer: {
          flex: 0.5,
        }

        더 많이 올리고 싶으면:
        flex: 0.3
      */}
      <View style={styles.spacer} />

      {/* 
        다음으로 버튼입니다.
        누르면 handleNext가 실행됩니다.

        필수 약관이 모두 체크되어 있으면 /signup으로 이동하고,
        체크가 부족하면 아래 errorText가 표시됩니다.
      */}
      <AuthButton onPress={handleNext}>다음으로</AuthButton>

      {/* 
        필수 약관을 체크하지 않고 다음으로 버튼을 눌렀을 때 뜨는 빨간 안내 문구입니다.
        문구 위치는 styles.errorText의 marginTop으로 조정할 수 있습니다.
      */}
      <Text style={[styles.errorText, !showError && styles.errorTextHidden]}>필수 약관에 동의해주세요.</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  // 로고를 감싸는 영역입니다.
  logoWrap: {
    alignItems: 'center',

    // 로고를 아래로 내리고 싶으면 이 값을 키우면 됩니다.
    // 예: 50 -> 60 -> 70
    marginTop: 30,
  },

  // "회원가입" 제목 스타일입니다.
  title: {
    color: '#111111',
    fontSize: 26,
    fontWeight: '900',

    // 제목과 약관 카드 사이의 아래 여백입니다.
    // 값을 키우면 약관 카드가 더 아래로 내려갑니다.
    marginBottom: 15,

    // 로고와 제목 사이의 위 여백입니다.
    // 값을 키우면 회원가입 글자가 아래로 내려갑니다.
    marginTop: 62,

    alignSelf: 'flex-start',
    marginLeft: 5,
  },

  // 약관들이 들어있는 회색 테두리 네모칸입니다.
  card: {
    borderColor: '#8F8F8F',
    borderRadius: 15,
    borderWidth: 1,

    // 네모칸 안쪽 좌우 여백입니다.
    // 값을 키우면 약관 글자들이 안쪽으로 더 들어갑니다.
    paddingHorizontal: 14,

    // 네모칸 안쪽 위아래 여백입니다.
    // 값을 키우면 네모칸 높이가 커지고 줄 간격이 넓어 보입니다.
    paddingVertical: 11,
  },

  // 약관 카드와 다음으로 버튼 사이의 남는 공간을 차지하는 영역입니다.
  spacer: {
    // 이 값 때문에 다음으로 버튼이 아래쪽으로 밀립니다.
    // 버튼을 위로 올리고 싶으면 1보다 작은 값으로 줄이면 됩니다.
    // 예: flex: 0.5
    flex:0.5,
  },

  // 필수 약관 미동의 시 보여주는 빨간 안내 문구입니다.
  errorText: {
    color: '#D85D5D',
    fontSize: 12,
    fontWeight: '800',

    // 다음으로 버튼과 빨간 안내 문구 사이 간격입니다.
    marginTop: 8,

    textAlign: 'center',
    
  },
  errorTextHidden: {
  opacity: 0,
},
});
