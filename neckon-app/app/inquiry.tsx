import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthButton, LogoImage } from '@/components/neckon-auth';
import { api, getErrorMessage } from '@/services/api';

// 문의하기 화면입니다.
// 서버 전송 없이 문의 내용을 화면 안에서만 관리합니다.
export default function InquiryScreen() {
  // 사용자가 입력한 문의 내용을 저장합니다.
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // 문의 내용을 입력했는지 확인한 뒤 접수 완료 Alert를 보여주고 마이페이지로 이동합니다.
  const handleSubmit = async () => {
    setSubmitted(true);

    if (!content.trim()) {
      return;
    }

    try {
      setLoading(true);
      await api.sendContact({ category: 'other', content: content.trim() });
      Alert.alert('문의가 접수되었습니다.', '', [
        {
          text: '확인',
          onPress: () => router.replace('/profile' as never),
        },
      ]);
    } catch (error) {
      Alert.alert('문의 전송 실패', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <LogoImage style={styles.logo} />

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>문의하기</Text>
      <Text style={styles.caption}>답변은 가입 이메일로 발송됩니다.</Text>

      <TextInput
        multiline
        placeholder="궁금한 점이나 불편한 점을 자세히 적어주세요."
        placeholderTextColor="#9A9A9A"
        style={[styles.textarea, submitted && !content.trim() ? styles.textareaError : null]}
        textAlignVertical="top"
        value={content}
        onChangeText={setContent}
      />

      {submitted && !content.trim() ? (
        <Text style={styles.errorText}>문의 내용을 입력해주세요.</Text>
      ) : null}

      <View style={styles.warningBox}>
        <Image
          source={require('@/assets/images/icon-warning.png')}
          style={styles.warningIcon}
          resizeMode="contain"
        />

        <Text style={styles.warningText}>
          문의 내용에 욕설, 광고성 내용이 포함된 경우 조치가 어려울 수 있습니다.
        </Text>
      </View>

      <AuthButton onPress={handleSubmit}>{loading ? '전송 중...' : '문의하기'}</AuthButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },

  content: {
    paddingBottom: 28,
    paddingHorizontal: 22,
  },

  header: {
    borderBottomColor: '#EFEFEF',
    borderBottomWidth: 1,
    marginHorizontal: -22,
    paddingHorizontal: 22,
    paddingTop: 54,
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

  title: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 18,
  },

  caption: {
    color: '#9A9A9A',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
  },

  textarea: {
    borderColor: '#BDBDBD',
    borderRadius: 14,
    borderWidth: 1,
    color: '#111111',
    fontSize: 13,
    height: 380,
    marginTop: 18,
    padding: 14,
  },

  textareaError: {
    borderColor: '#D85D5D',
  },

  errorText: {
    color: '#D85D5D',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
  },

  warningBox: {
    alignItems: 'center',
    backgroundColor: '#F4C6C6',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 26,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  warningIcon: {
    height: 19,
    width: 19,
  },

  warningText: {
    color: '#8B6B6B',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
});
