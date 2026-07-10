import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./signup.css";
import { register } from "./api/authApi";
import {
  registerFcmTokenForCurrentBrowser,
  requestFcmTokenForCurrentBrowser,
} from "./firebaseMessaging";

function Signup() {
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [showPwCheck, setShowPwCheck] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordCheck, setPasswordCheck] = useState("");
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    const hasAcceptedTerms =
      sessionStorage.getItem("signupTermsAccepted") === "true";

    if (!hasAcceptedTerms) {
      navigate("/signup-agree", { replace: true });
    }
  }, [navigate]);

  const handleSignup = async () => {
    try {
      if (!email || !password || !passwordCheck || !nickname) {
        alert("모든 항목을 입력해주세요.");
        return;
      }

      if (password !== passwordCheck) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }

      const formData = new FormData();
      formData.append("username", email);
      formData.append("email", email);
      formData.append("password", password);
      formData.append("nickname", nickname);
      formData.append(
        "snapshot_consent",
        sessionStorage.getItem("signupSnapshotConsent") === "true"
          ? "true"
          : "false"
      );

      let fcmTokenResult = null;

      try {
        fcmTokenResult = await requestFcmTokenForCurrentBrowser();

        if (!fcmTokenResult.registered) {
          console.warn("FCM token request skipped:", fcmTokenResult.reason);
        }
      } catch (fcmError) {
        console.error("FCM token request failed:", fcmError);
      }

      const res = await register(formData);

      sessionStorage.removeItem("signupTermsAccepted");
      sessionStorage.removeItem("signupSnapshotConsent");
      localStorage.setItem("token", res.data.token);

      try {
        const fcmRegistration = await registerFcmTokenForCurrentBrowser(
          fcmTokenResult?.fcmToken
        );

        if (!fcmRegistration.registered) {
          console.warn("FCM device registration skipped:", fcmRegistration.reason);
        }
      } catch (fcmError) {
        console.error("FCM device registration failed:", fcmError);
      }

      alert(res.data.message || "회원가입 성공");
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || "회원가입 실패";
      alert(message);
    }
  };

  return (
    <div className="signup-container">
      <img
        src="/images/NeckOn.png"
        className="signup-logo"
        alt="NeckOn 로고"
        onClick={() => navigate("/dashboardSummary")}
      />

      <div className="divider" />

      <div className="signup-card">
        <div className="form-row">
          <label>이메일</label>
          <input
            placeholder="이메일을 입력해주세요."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
        </div>

        <div className="form-row">
          <label>비밀번호</label>

          <div className="input-wrap">
            <input
              type={showPw ? "text" : "password"}
              placeholder="비밀번호를 입력해주세요."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <img
              src={
                showPw
                  ? "/images/fluent_eye-16-filled.png"
                  : "/images/fluent_eye-off-16-filled.png"
              }
              className="eye-icon"
              onClick={() => setShowPw(!showPw)}
            />
          </div>
        </div>

        <div className="form-row">
          <label>비밀번호 확인</label>

          <div className="input-wrap">
            <input
              type={showPwCheck ? "text" : "password"}
              placeholder="비밀번호를 입력해주세요."
              value={passwordCheck}
              onChange={(e) => setPasswordCheck(e.target.value)}
            />

            <img
              src={
                showPwCheck
                  ? "/images/fluent_eye-16-filled.png"
                  : "/images/fluent_eye-off-16-filled.png"
              }
              className="eye-icon"
              onClick={() => setShowPwCheck(!showPwCheck)}
            />
          </div>
        </div>

        <div className="form-row">
          <label>이름(닉네임)</label>
          <input
            placeholder="이름을 입력해주세요."
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <button className="signup-btn" onClick={handleSignup}>
          회원가입
        </button>
      </div>
    </div>
  );
}

export default Signup;
