import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthInput, AuthScreen, LogoImage } from '@/components/neckon-auth';
import { api, getErrorMessage } from '@/services/api';

// 회원가입 입력 화면입니다.
// 실제 회원가입 API는 아직 연결하지 않고, 프론트 입력 검증만 처리합니다.
export default function SignupScreen() {
  // 회원가입 폼에 입력된 값들을 화면 안에서 관리합니다.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // 비밀번호 확인 입력값이 비밀번호와 다른지 검사합니다.
  const passwordMismatch = Boolean(passwordConfirm) && password !== passwordConfirm;

  // 필수 입력값과 비밀번호 일치 여부를 확인한 뒤 로그인 화면으로 이동합니다.
  const handleSignup = async () => {
    setSubmitted(true);

    if (!email.trim() || !password.trim() || !passwordConfirm.trim() || !name.trim() || password !== passwordConfirm) {
      return;
    }

    try {
      setLoading(true);
      await api.register({
        email: email.trim(),
        password,
        nickname: name.trim(),
      });
      router.replace('/(tabs)/' as never);
    } catch (error) {
      Alert.alert('회원가입 실패', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <View style={styles.logoWrap}>
        <LogoImage />
      </View>

      <Text style={styles.title}>회원가입</Text>

      <View style={styles.form}>
        <AuthInput
          label="아이디"
          placeholder="이메일을 입력하세요."
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          error={submitted && !email.trim() ? '아이디를 입력해주세요.' : undefined}
        />
        <AuthInput
          label="비밀번호"
          placeholder="비밀번호를 입력하세요."
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={submitted && !password.trim() ? '비밀번호를 입력해주세요.' : undefined}
        />
        <AuthInput
          label="비밀번호 확인"
          placeholder="비밀번호 확인"
          secureTextEntry
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          error={
            submitted && !passwordConfirm.trim()
              ? '비밀번호 확인을 입력해주세요.'
              : passwordMismatch
                ? '비밀번호가 일치하지 않습니다.'
                : undefined
          }
        />
        <AuthInput
          label="이름(닉네임)"
          placeholder="이름을 입력해주세요."
          value={name}
          onChangeText={setName}
          error={submitted && !name.trim() ? '이름을 입력해주세요.' : undefined}
        />
      </View>

      <View style={styles.spacer} />
      <AuthButton onPress={handleSignup}>{loading ? '가입 중...' : '회원가입'}</AuthButton>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: 'center',
    marginTop: 50,
  },
  title: {
    color: '#111111',
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 24,
    marginTop: 42,
  },
  form: {
    gap: 13,
  },
  spacer: {
    flex: 1,
  },
});
