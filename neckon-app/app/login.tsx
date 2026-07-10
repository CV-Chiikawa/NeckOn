import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthInput, AuthScreen, LogoImage } from '@/components/neckon-auth';
import { api, getErrorMessage } from '@/services/api';

// 로그인 화면입니다.
// 현재는 디자인 확인 단계라 입력값 검증 없이 로그인 버튼을 누르면 탭 홈으로 이동합니다.
export default function LoginScreen() {
  // 입력창 UI를 유지하기 위해 아이디와 비밀번호 값을 화면 안에서만 관리합니다.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('로그인 실패', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      await api.login({ email: email.trim(), password });
      router.replace('/(tabs)/' as never);
    } catch (error) {
      Alert.alert('로그인 실패', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <View style={styles.logoWrap}>
        <LogoImage />
      </View>

      <Text style={styles.title}>로그인</Text>

      <View style={styles.form}>
        <AuthInput
          label="아이디"
          placeholder="이메일을 입력하세요."
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <AuthInput
          label="비밀번호"
          placeholder="비밀번호를 입력하세요."
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <View style={styles.actions}>
        {/* 로그인 버튼: 현재는 바로 대시보드 탭으로 이동합니다. */}
        <AuthButton onPress={handleLogin}>{loading ? '로그인 중...' : '로그인'}</AuthButton>
        {/* 회원가입 버튼: 약관동의 화면으로 이동합니다. */}
        <AuthButton href="/terms" variant="ghost">
          회원가입
        </AuthButton>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: 'center',
    marginTop: 84,
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
  actions: {
    gap: 58,
    marginTop: 28,
  },
});
