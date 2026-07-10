import "./App.css";
import { useNavigate } from "react-router-dom";


function App() {
  const navigate = useNavigate();

  return (
    <div className="main">
      <div className="overlay">
        <div className="nav">
          <div className="logo">
            <img
              src="/images/NeckOn.png"
              alt="NeckOn logo"
              className="logo-img"
              onClick={() => navigate("/dashboardSummary")}
            />
          </div>

          <div className="auth">
            <img
              src="/images/signup.png"
              alt="회원가입"
              className="auth-img"
              onClick={() => navigate("/signup-agree")}
            />

            <img
              src="/images/login.png"
              alt="로그인"
              className="auth-img"
              onClick={() => navigate("/login")}
            />
          </div>
        </div>

        <div className="hero-content">
          <p className="sub">
            당신의 목 건강, AI가 실시간으로 지켜드려요
          </p>

          <h1 className="main-title">
            장시간 컴퓨터 사용으로 지친 당신을 위한 <br />
            스마트한 자세 교정 솔루션
          </h1>

          <button 
            className="start-btn"
            onClick={() => navigate("/login")}
          >
            지금 분석 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
