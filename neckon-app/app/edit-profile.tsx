import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { AuthButton, LogoImage } from '@/components/neckon-auth';
import { api, getErrorMessage } from '@/services/api';

// 이 화면에서 사용하는 메인 올리브 색상입니다.
// 상단 프로필 배경, 프로필 사진 수정 아이콘 색, 입력칸 활성 색 등에 사용됩니다.
const OLIVE = '#889B6C';

// 수정 가능한 입력칸 종류입니다.
// editingField 상태값이 name이면 이름 칸만 수정 가능,
// email이면 아이디 칸만 수정 가능,
// password면 비밀번호 칸만 수정 가능하게 만듭니다.
type EditableField = 'name' | 'email' | 'password';

// EditableProfileInput 컴포넌트가 받을 props 타입입니다.
// TextInputProps를 확장해서 TextInput에서 쓰는 기본 props도 함께 사용할 수 있습니다.
type EditableProfileInputProps = TextInputProps & {
  // 입력칸 위에 표시되는 라벨입니다.
  // 예: 이름(닉네임), 아이디, 비밀번호
  label: string;

  // 현재 이 입력칸이 수정 가능한 상태인지 확인하는 값입니다.
  // true면 입력 가능, false면 읽기 전용입니다.
  editing: boolean;

  // 저장 버튼을 눌렀을 때 빈 값이면 아래에 표시되는 오류 문구입니다.
  error?: string;

  // 오른쪽 연필 아이콘을 눌렀을 때 실행되는 함수입니다.
  onEditPress: () => void;
};

// 이름/아이디/비밀번호 입력칸을 반복해서 만들기 위한 재사용 컴포넌트입니다.
// 같은 모양의 입력칸을 3번 직접 쓰지 않고,
// 이 컴포넌트를 이용해서 라벨, 값, 수정 상태만 바꿔 사용합니다.
function EditableProfileInput({
  label,
  editing,
  error,
  onEditPress,
  ...inputProps
}: EditableProfileInputProps) {
  return (
    // 입력칸 전체 묶음입니다.
    // 라벨 + 입력칸 박스 + 오류 문구가 들어갑니다.
    <View style={styles.inputBlock}>
      {/* 입력칸 위쪽 라벨입니다. */}
      <Text style={styles.inputLabel}>{label}</Text>

      {/* 
        실제 입력칸을 감싸는 테두리 박스입니다.

        기본 상태: styles.inputShell
        수정 중 상태: styles.inputShellEditing 추가
        오류 상태: styles.inputShellError 추가

        즉, 수정 중이면 테두리가 올리브색으로 바뀌고,
        오류가 있으면 빨간색 테두리로 바뀝니다.
      */}
      <View style={[styles.inputShell, editing ? styles.inputShellEditing : null, error ? styles.inputShellError : null]}>
        {/* 
          실제 텍스트 입력 영역입니다.

          editable={editing}
          - editing이 true일 때만 입력 가능
          - false일 때는 읽기 전용처럼 보입니다.

          {...inputProps}
          - 부모에서 넘겨준 value, onChangeText, placeholder, secureTextEntry 등을 여기로 전달합니다.
        */}
        <TextInput
          {...inputProps}
          editable={editing}
          placeholderTextColor="#B6B6B6"
          style={[styles.input, editing ? styles.inputEditing : null]}
        />

        {/* 
          오른쪽 연필 아이콘 버튼입니다.
          누르면 해당 입력칸만 수정 가능 상태가 됩니다.

          hitSlop={10}
          - 아이콘 주변 터치 영역을 넓혀서 누르기 편하게 해줍니다.
        */}
        <Pressable onPress={onEditPress} hitSlop={10}>
          <Image source={require('@/assets/images/icon-pen.png')} style={styles.fieldIcon} resizeMode="contain" />
        </Pressable>
      </View>

      {/* 
        오류 문구입니다.
        error 값이 있을 때만 화면에 표시됩니다.
        예: 이름을 입력해주세요.
      */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

// 회원정보 수정 화면입니다.
// 처음에는 모든 입력칸이 읽기 전용 상태이고,
// 각 입력칸 오른쪽 연필 아이콘을 누르면 해당 칸만 수정할 수 있습니다.
export default function EditProfileScreen() {
  // 이름/닉네임 상태입니다.
  // 화면 처음 들어왔을 때 기본값으로 "거북이"가 표시됩니다.
  const [name, setName] = useState('거북이');

  // 아이디/이메일 상태입니다.
  // 현재는 실제 로그인 정보가 아니라 화면 확인용 더미 값입니다.
  const [email, setEmail] = useState('jeung***@naver.com');

  // 비밀번호 상태입니다.
  // 비밀번호는 새 값이 있을 때만 서버로 전송합니다.
  const [password, setPassword] = useState('');

  // 현재 수정 중인 입력칸을 저장하는 상태입니다.
  // null이면 수정 중인 칸이 없음
  // 'name'이면 이름 칸만 수정 가능
  // 'email'이면 아이디 칸만 수정 가능
  // 'password'이면 비밀번호 칸만 수정 가능
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  // 저장 버튼을 한 번이라도 눌렀는지 확인하는 상태입니다.
  // true가 되면 빈 값인 입력칸 아래에 오류 문구를 보여줍니다.
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.getProfile();

        setName(response.data.nickname ?? '거북이');
        setEmail(response.data.email);
      } catch (error) {
        console.warn('Failed to fetch profile', error);
      }
    };

    fetchProfile();
  }, []);

  // 입력칸 오른쪽 연필 아이콘을 눌렀을 때 실행됩니다.
  // 어떤 필드를 수정할지 받아서 editingField에 저장합니다.
  const handleEditPress = (field: EditableField) => {
    setEditingField(field);
  };

  // 프로필 사진 위의 연필 아이콘을 눌렀을 때 실행됩니다.
  // 현재는 실제 이미지 선택 기능을 연결하지 않고 알림만 보여줍니다.
  const handleProfileImagePress = () => {
    Alert.alert('프로필 사진 변경 기능은 추후 연결 예정입니다.');
  };

  // 회원정보 저장 버튼을 눌렀을 때 실행됩니다.
  // 현재는 실제 서버/API 저장은 연결하지 않았고,
  // 화면 안에서 빈 값 검사 후 저장 완료 알림만 보여줍니다.
  const handleSave = async () => {
    // 저장 버튼을 눌렀다는 상태로 바꿉니다.
    // 이 값이 true가 되면 빈 입력칸 아래에 오류 문구가 표시됩니다.
    setSubmitted(true);

    if (!name.trim() || (password.trim() && password.trim().length < 6)) {
      return;
    }

    try {
      setLoading(true);
      await api.updateProfile({
        nickname: name.trim(),
        ...(password.trim() ? { password } : {}),
      });

      setEditingField(null);
      setPassword('');
      Alert.alert('회원정보가 저장되었습니다.');
    } catch (error) {
      Alert.alert('회원정보 저장 실패', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    // 화면 전체를 세로 스크롤 가능하게 만듭니다.
    // 화면 높이가 작은 기기에서도 아래 저장 버튼까지 볼 수 있게 합니다.
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 
        상단 헤더 영역입니다.
        로고와 뒤로가기 버튼이 들어갑니다.

        로고 위치를 내리고 싶으면 styles.header의 paddingTop을 키우면 됩니다.
        로고 아래 공간을 늘리고 싶으면 paddingBottom 또는 backButton marginTop을 조절하면 됩니다.
      */}
      <View style={styles.header}>
        {/* 상단 NeckOn 로고입니다. 크기는 styles.logo에서 조정합니다. */}
        <LogoImage style={styles.logo} />

        {/* 
          뒤로가기 버튼입니다.
          누르면 이전 화면으로 돌아갑니다.
          현재는 ‹ 문자를 사용해서 뒤로가기 아이콘처럼 보이게 합니다.
        */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>

      {/* 
        상단 올리브색 프로필 영역입니다.
        프로필 이미지/이니셜과 닉네임이 들어갑니다.

        높이, 여백, 둥근 모서리는 styles.profileBand에서 조정합니다.
      */}
      <View style={styles.profileBand}>
        {/* 
          프로필 이미지 전체 묶음입니다.
          원형 아바타와 작은 연필 버튼을 겹치기 위해 position: relative를 사용합니다.
        */}
        <View style={styles.avatarWrap}>
          {/* 
            실제 프로필 이미지 자리입니다.
            현재는 이미지 대신 N 글자를 보여줍니다.
            나중에 사진으로 바꾸려면 이 View 안의 Text 대신 Image를 넣으면 됩니다.
          */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>N</Text>
          </View>

          {/* 
            프로필 사진 수정 버튼입니다.
            원형 아바타 오른쪽 아래에 겹쳐 보입니다.
          */}
          <Pressable onPress={handleProfileImagePress} style={styles.avatarEditButton} hitSlop={8}>
            <Image source={require('@/assets/images/icon-pen.png')} style={styles.avatarEditIcon} resizeMode="contain" />
          </Pressable>
        </View>

        {/* 프로필 영역에 표시되는 닉네임입니다. name 상태와 연결되어 있습니다. */}
        <Text style={styles.name}>{name}</Text>
      </View>

      {/* 화면 본문 제목입니다. */}
      <Text style={styles.title}>회원정보</Text>

      {/* 
        입력 폼 전체 영역입니다.
        이름, 아이디, 비밀번호 입력칸이 들어갑니다.
      */}
      <View style={styles.form}>
        {/* 이름/닉네임 입력칸 */}
        <EditableProfileInput
          label="이름(닉네임)"
          placeholder="이름을 입력해주세요."
          value={name}
          onChangeText={setName}
          editing={editingField === 'name'}
          onEditPress={() => handleEditPress('name')}
          error={submitted && !name.trim() ? '이름을 입력해주세요.' : undefined}
        />

        {/* 아이디/이메일 입력칸 */}
        <EditableProfileInput
          label="아이디"
          placeholder="아이디"
          value={email}
          onChangeText={setEmail}
          editing={false}
          onEditPress={() => Alert.alert('이메일 수정은 현재 서버에서 지원하지 않습니다.')}
          autoCapitalize="none"
          keyboardType="email-address"
          error={submitted && !email.trim() ? '아이디를 입력해주세요.' : undefined}
        />

        {/* 비밀번호 입력칸 */}
        <EditableProfileInput
          label="비밀번호"
          placeholder="변경할 비밀번호"
          value={password}
          onChangeText={setPassword}
          editing={editingField === 'password'}
          onEditPress={() => handleEditPress('password')}
          autoCapitalize="none"
          secureTextEntry
          error={submitted && Boolean(password.trim()) && password.trim().length < 6 ? '비밀번호는 6자 이상 입력해주세요.' : undefined}
        />
      </View>

      {/* 
        저장 버튼을 화면 아래쪽으로 밀어내는 빈 공간입니다.
        버튼이 너무 아래에 있으면 styles.spacer의 flex나 minHeight를 줄이면 됩니다.
      */}
      <View style={styles.spacer} />

      {/* 회원정보 저장 버튼입니다. */}
      <AuthButton onPress={handleSave}>{loading ? '저장 중...' : '회원정보 저장'}</AuthButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ==============================
  // 전체 화면
  // ==============================

  screen: {
    // 화면 전체 배경색입니다.
    backgroundColor: '#FFFFFF',

    // 화면 전체를 채우게 합니다.
    flex: 1,
  },

  content: {
    // 내용이 화면보다 짧아도 ScrollView 내부가 화면 높이만큼 늘어나게 합니다.
    // 그래야 spacer가 버튼을 아래로 밀 수 있습니다.
    flexGrow: 1,

    // 화면 맨 아래 여백입니다.
    // 저장 버튼이 너무 아래에 붙으면 이 값을 키우고,
    // 너무 위에 있으면 줄이면 됩니다.
    paddingBottom: 28,
  },

  // ==============================
  // 상단 헤더 / 로고 / 뒤로가기
  // ==============================

  header: {
    // 헤더 아래 얇은 구분선 색입니다.
    borderBottomColor: '#EFEFEF',

    // 헤더 아래 구분선 두께입니다.
    borderBottomWidth: 1,

    // 헤더 좌우 여백입니다.
    // 로고와 뒤로가기 버튼이 좌우에서 얼마나 떨어질지 정합니다.
    paddingHorizontal: 22,

    // 화면 위에서 로고까지의 거리입니다.
    // 로고를 아래로 내리고 싶으면 16 -> 30, 40처럼 키우면 됩니다.
    // 로고를 위로 올리고 싶으면 줄이면 됩니다.
    paddingTop: 54,
  },

  logo: {
    // 로고 높이입니다.
    height: 30,

    // 로고 너비입니다.
    width: 100,
  },

  backButton: {
    alignItems: 'center',

    // 뒤로가기 버튼 터치 영역 높이입니다.
    height: 38,

    justifyContent: 'center',

    // 뒤로가기 버튼을 왼쪽으로 살짝 빼는 값입니다.
    // 더 왼쪽으로 보내고 싶으면 -8 -> -12
    // 오른쪽으로 옮기고 싶으면 -8 -> 0
    marginLeft: -8,

    // 로고와 뒤로가기 버튼 사이 세로 간격입니다.
    // 뒤로가기 버튼을 더 아래로 내리고 싶으면 8 -> 14
    marginTop: 8,

    // 뒤로가기 버튼 터치 영역 너비입니다.
    width: 38,
  },

  backText: {
    color: '#111111',

    // 뒤로가기 꺾쇠 크기입니다.
    fontSize: 32,

    // 글자 세로 정렬용 줄 높이입니다.
    lineHeight: 34,
  },

  // ==============================
  // 상단 프로필 밴드
  // ==============================

  profileBand: {
    alignItems: 'center',

    // 올리브색 프로필 영역 배경입니다.
    backgroundColor: OLIVE,

    // 아래쪽 왼쪽 모서리 둥근 정도입니다.
    borderBottomLeftRadius: 18,

    // 아래쪽 오른쪽 모서리 둥근 정도입니다.
    borderBottomRightRadius: 18,

    // 프로필 사진과 닉네임을 가로로 배치합니다.
    flexDirection: 'row',

    // 프로필 사진과 닉네임 사이 간격입니다.
    gap: 14,

    // 프로필 밴드 좌우 안쪽 여백입니다.
    paddingHorizontal: 22,

    // 프로필 밴드 위아래 높이를 결정하는 여백입니다.
    // 밴드가 너무 얇으면 22 -> 30
    // 너무 두꺼우면 22 -> 16
    paddingVertical: 22,
  },

  avatarWrap: {
    // 프로필 이미지와 작은 연필 버튼 전체 영역 높이입니다.
    height: 62,

    // 자식 요소인 avatarEditButton을 absolute로 배치하기 위해 필요합니다.
    position: 'relative',

    // 프로필 이미지와 작은 연필 버튼 전체 영역 너비입니다.
    width: 62,
  },

  avatar: {
    alignItems: 'center',
    backgroundColor: '#D8DED0',

    // 원형 아바타를 만들기 위한 둥근 정도입니다.
    // height/width가 56이고 borderRadius가 28이라 원이 됩니다.
    borderRadius: 28,

    height: 56,
    justifyContent: 'center',
    width: 56,
  },

  avatarEditButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',

    // 작은 연필 버튼을 원형으로 만드는 값입니다.
    borderRadius: 13,

    // 아바타 기준 아래에서 얼마나 떨어질지 정합니다.
    bottom: 2,

    // Android 그림자입니다.
    elevation: 3,

    // 작은 버튼 크기입니다.
    height: 26,

    justifyContent: 'center',

    // 아바타 안에서 absolute 위치로 겹치게 합니다.
    position: 'absolute',

    // 오른쪽 아래에 배치합니다.
    right: 0,

    // iOS 그림자입니다.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,

    width: 26,
  },

  avatarEditIcon: {
    // 프로필 사진 수정 연필 아이콘 크기입니다.
    height: 14,

    // 연필 아이콘 색입니다.
    tintColor: OLIVE,

    width: 14,
  },

  avatarText: {
    color: '#596944',

    // 아바타 안 N 글자 크기입니다.
    fontSize: 24,

    fontWeight: '900',
  },

  name: {
    color: '#FFFFFF',

    // 프로필 밴드 안 닉네임 글자 크기입니다.
    fontSize: 18,

    fontWeight: '900',
  },

  // ==============================
  // 본문 제목 / 입력 폼
  // ==============================

  title: {
    color: '#111111',

    // "회원정보" 글자 크기입니다.
    fontSize: 21,

    fontWeight: '900',

    // 제목 좌우 여백입니다.
    marginHorizontal: 22,

    // 프로필 밴드와 제목 사이 간격입니다.
    // 제목을 아래로 내리고 싶으면 22 -> 30
    // 위로 올리고 싶으면 22 -> 16
    marginTop: 22,
  },

  form: {
    // 입력칸끼리의 세로 간격입니다.
    gap: 13,

    // 입력 폼 좌우 여백입니다.
    paddingHorizontal: 22,

    // "회원정보" 제목과 첫 입력칸 사이 간격입니다.
    paddingTop: 22,
  },

  inputBlock: {
    // 라벨, 입력칸, 오류 문구 사이 간격입니다.
    gap: 7,
  },

  inputLabel: {
    color: '#4F4F4F',

    // 라벨 글자 크기입니다.
    fontSize: 13,

    fontWeight: '700',
  },

  inputShell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',

    // 입력칸 테두리 색입니다.
    borderColor: '#BDBDBD',

    // 입력칸 둥근 정도입니다.
    borderRadius: 8,

    // 입력칸 테두리 두께입니다.
    borderWidth: 1,

    // TextInput과 연필 아이콘을 가로 배치합니다.
    flexDirection: 'row',

    // 입력칸 높이입니다.
    // 칸을 더 크게 하고 싶으면 39 -> 46
    // 더 작게 하고 싶으면 39 -> 34
    height: 39,

    // 입력칸 내부 좌우 여백입니다.
    paddingHorizontal: 10,
  },

  inputShellEditing: {
    // 수정 중인 입력칸 배경색입니다.
    backgroundColor: '#F8FBF4',

    // 수정 중인 입력칸 테두리 색입니다.
    borderColor: OLIVE,
  },

  inputShellError: {
    // 오류가 있을 때 입력칸 테두리 색입니다.
    borderColor: '#D85D5D',
  },

  input: {
    color: '#111111',

    // 남은 가로 공간을 TextInput이 차지하게 합니다.
    flex: 1,

    // 입력 글자 크기입니다.
    fontSize: 13,

    // 기본 TextInput 안쪽 여백을 제거해서 디자인을 맞춥니다.
    padding: 0,
  },

  inputEditing: {
    // 수정 중일 때 입력 글자를 조금 더 굵게 보여줍니다.
    fontWeight: '700',
  },

  fieldIcon: {
    // 입력칸 오른쪽 연필 아이콘 크기입니다.
    height: 17,

    // 입력 텍스트와 연필 아이콘 사이 간격입니다.
    marginLeft: 8,

    // 연필 아이콘 색입니다.
    tintColor: '#777777',

    width: 17,
  },

  errorText: {
    // 오류 문구 색입니다.
    color: '#D85D5D',

    // 오류 문구 크기입니다.
    fontSize: 11,

    fontWeight: '700',
  },

  // ==============================
  // 저장 버튼 위치 조정
  // ==============================

  spacer: {
    // 남는 공간을 차지해서 저장 버튼을 아래쪽으로 밀어냅니다.
    // 저장 버튼을 더 위로 올리고 싶으면 flex를 줄이거나,
    // minHeight를 줄이면 됩니다.
    flex: 1,

    // 입력칸과 저장 버튼 사이 최소 간격입니다.
    // 버튼을 더 위로 올리고 싶으면 56 -> 30
    // 더 아래로 내리고 싶으면 56 -> 80
    minHeight: 56,
  },
});
