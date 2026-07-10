import { useNavigate } from "react-router-dom";
import "./login.css";
import { useState } from "react";
import { login } from "./api/authApi";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      if (!email || !password) {
        alert("이메일과 비밀번호를 입력해주세요.");
        return;
      }

      const res = await login({
        email,
        password,
      });

      console.log(res.data);

      localStorage.setItem("token", res.data.token);

      alert("로그인 성공");

      navigate("/dashboard");
    } catch (err) {
      console.error(err);

      const message =
        err.response?.data?.message || "로그인 실패";

      alert(message);
    }
  };

  return (
    <div className="login-container">
      <img
        src="/images/NeckOn.png"
        className="login-logo"
        alt="NeckOn 로고"
        onClick={() => navigate("/dashboardSummary")}
      />

      <div className="divider" />

      <div className="login-card">
        <div className="form-row">
          <label>이메일</label>
          <input
            type="text"
            placeholder="이메일을 입력해주세요."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>비밀번호</label>
          <input
            type="password"
            placeholder="비밀번호를 입력해주세요."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div
          className="signup-text"
          onClick={() => navigate("/signup-agree")}
        >
          회원가입
        </div>

        <button
          className="login-btn"
          onClick={handleLogin}
        >
          로그인
        </button>
      </div>
    </div>
  );
}

export default Login;
