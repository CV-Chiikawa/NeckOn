import { router } from 'expo-router';
import { PropsWithChildren, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// 앱 전체에서 반복해서 쓰는 색상 모음입니다.
// 버튼, 에러 문구, 배경색을 한곳에서 맞추기 위해 사용합니다.
export const neckonColors = {
  olive: '#889B6C',
  oliveDark: '#6F7F53',
  oliveSoft: '#EEF3E8',
  black: '#111111',
  gray: '#858585',
  line: '#D8D8D8',
  danger: '#D85D5D',
  panel: '#F8F3EE',
};

// 로그인/회원가입 관련 화면의 기본 여백과 SafeArea를 잡아주는 공통 화면 틀입니다.
export function AuthScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.screen, style]}>{children}</View>
    </SafeAreaView>
  );
}

// assets/images/logo.png를 화면마다 같은 방식으로 보여주는 공통 로고 컴포넌트입니다.
export function LogoImage({ style }: { style?: StyleProp<ImageStyle> }) {
  return <Image source={require('@/assets/images/logo.png')} style={[styles.logo, style]} resizeMode="contain" />;
}

type ButtonProps = PropsWithChildren<{
  href?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'disabled';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}>;

// href가 있으면 해당 화면으로 이동하고, onPress가 있으면 전달받은 기능을 실행하는 공통 버튼입니다.
export function AuthButton({ children, href, variant = 'primary', onPress, style }: ButtonProps) {
  const content = (
    <View style={[styles.button, styles[`${variant}Button`], style]}>
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`]]}>{children}</Text>
    </View>
  );

  if (href) {
    return <Pressable onPress={() => router.push(href as never)}>{content}</Pressable>;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

type InputProps = {
  label: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  editableIcon?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
};

// 입력창 공통 컴포넌트입니다.
// 비밀번호 입력일 때는 눈 아이콘을 눌러 보기/숨기기를 전환할 수 있습니다.
export function AuthInput({
  label,
  placeholder,
  secureTextEntry,
  keyboardType,
  error,
  editableIcon = false,
  value,
  onChangeText,
}: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.inputBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#B6B6B6"
          secureTextEntry={isPassword && !passwordVisible}
          keyboardType={keyboardType}
          autoCapitalize="none"
          value={value}
          onChangeText={onChangeText}
        />
        {isPassword ? (
          <Pressable onPress={() => setPasswordVisible((current) => !current)} hitSlop={8}>
            <Image
              source={
                passwordVisible
                  ? require('@/assets/images/icon-eye.png')
                  : require('@/assets/images/icon-eye-off.png')
              }
              style={styles.fieldIcon}
              resizeMode="contain"
            />
          </Pressable>
        ) : null}
        {editableIcon ? (
          <Image source={require('@/assets/images/icon-pen.png')} style={styles.fieldIcon} resizeMode="contain" />
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

// 약관동의 화면에서 쓰는 체크박스 한 줄 컴포넌트입니다.
export function CheckRow({
  title,
  description,
  checked = true,
  strong = false,
}: {
  title: string;
  description?: string;
  checked?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={[styles.checkRow, strong ? styles.strongCheckRow : null]}>
      <View style={[styles.checkBox, checked ? styles.checkBoxActive : null]}>
        {checked ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <View style={styles.checkTextWrap}>
        <Text style={[styles.checkTitle, strong ? styles.strongCheckTitle : null]}>{title}</Text>
        {description ? <Text style={styles.checkDescription}>{description}</Text> : null}
      </View>
    </View>
  );
}

// 뒤로가기/상단 로고가 필요한 서브 화면에서 재사용할 수 있는 헤더입니다.
export function BackHeader({ title }: { title?: string }) {
  return (
    <View style={styles.header}>
      <LogoImage style={styles.headerLogo} />
      {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
    </View>
  );
}

// 공통 컴포넌트들의 기본 디자인입니다.
// 버튼의 둥근 모서리, 입력창 테두리, 에러 문구 색상 등을 여기서 정의합니다.
const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  screen: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 28,
    paddingTop: 36,
  },
  logo: {
    height: 42,
    width: 132,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: neckonColors.olive,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderColor: '#D5CDC5',
    borderWidth: 1,
  },
  ghostButton: {
    backgroundColor: '#FFFFFF',
    borderColor: neckonColors.olive,
    borderWidth: 1,
  },
  disabledButton: {
    backgroundColor: '#D8D8D8',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  outlineButtonText: {
    color: '#6B6B6B',
  },
  ghostButtonText: {
    color: neckonColors.olive,
  },
  disabledButtonText: {
    color: '#FFFFFF',
  },
  inputBlock: {
    gap: 7,
  },
  inputLabel: {
    color: '#4F4F4F',
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    alignItems: 'center',
    borderColor: '#BDBDBD',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    height: 39,
    paddingHorizontal: 10,
  },
  inputShellError: {
    borderColor: neckonColors.danger,
  },
  input: {
    color: neckonColors.black,
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  fieldIcon: {
    height: 17,
    marginLeft: 8,
    tintColor: '#777777',
    width: 17,
  },
  errorText: {
    color: neckonColors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  checkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  strongCheckRow: {
    alignItems: 'center',
    borderBottomColor: '#CCCCCC',
    borderBottomWidth: 1,
    paddingBottom: 13,
  },
  checkBox: {
    alignItems: 'center',
    borderColor: '#B8B8B8',
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    marginTop: 1,
    width: 18,
  },
  checkBoxActive: {
    backgroundColor: neckonColors.olive,
    borderColor: neckonColors.olive,
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  checkTextWrap: {
    flex: 1,
    gap: 3,
  },
  checkTitle: {
    color: '#5D5D5D',
    fontSize: 12,
    fontWeight: '800',
  },
  strongCheckTitle: {
    color: neckonColors.black,
    fontSize: 15,
  },
  checkDescription: {
    color: '#9A9A9A',
    fontSize: 9,
    lineHeight: 13,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  headerLogo: {
    height: 30,
    width: 100,
  },
  headerTitle: {
    color: neckonColors.black,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 22,
  },
});
