import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./signupAgree.css";

function SignupAgree() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState({
    all: false,
    term1: false,
    term2: false,
    term3: false,
    term4: false,
  });

  const handleAll = (e) => {
    const checked = e.target.checked;

    setChecks({
      all: checked,
      term1: checked,
      term2: checked,
      term3: checked,
      term4: checked,
    });
  };

  const handleSingle = (e) => {
    const { name, checked } = e.target;

    const updated = {
      ...checks,
      [name]: checked,
    };

    updated.all =
      updated.term1 && updated.term2 && updated.term3 && updated.term4;

    setChecks(updated);
  };

  return (
    <div className="signupAgree-container">
      <img
        src="/images/NeckOn.png"
        className="signupAgree-logo"
        alt="NeckOn 로고"
        onClick={() => navigate("/dashboardSummary")}
      />

      <div className="signupAgree-divider" />

      <div className="card">
        <label className="all-check">
          <input
            type="checkbox"
            checked={checks.all}
            onChange={handleAll}
          />
          약관 전체 동의
        </label>

        <div className="line" />

        {/* 항목 1 */}
        <div className="item">
          <input
            type="checkbox"
            name="term1"
            checked={checks.term1}
            onChange={handleSingle}
          />

          <div className="text">
            <p className="title">
              [필수] 이용약관 및 개인정보 수집 이용 동의
            </p>
            <p className="desc">
              서비스 이용을 위한 기본적인 규칙과 개인정보 보호 정책에 동의합니다.
            </p>
          </div>
        </div>

        {/* 항목 2 */}
        <div className="item">
          <input
            type="checkbox"
            name="term2"
            checked={checks.term2}
            onChange={handleSingle}
          />

          <div className="text">
            <p className="title">
              [필수] 카메라 접근 권한 및 AI 분석 서비스 이용 동의
            </p>
            <p className="desc">
              거북목 분석을 위해 웹캠을 사용하며, 수집된 영상은 분석 즉시 파기되어 저장되지 않습니다.
            </p>
          </div>
        </div>

        {/* 항목 3 */}
        <div className="item">
          <input
            type="checkbox"
            name="term3"
            checked={checks.term3}
            onChange={handleSingle}
          />

          <div className="text">
            <p className="title">
              [필수] 분석 데이터 앱 동기화 및 푸시 알림 동의
            </p>
            <p className="desc">
              웹에서 측정된 자세 기록을 모바일 앱에서 확인하고, 실시간 푸시 알림을 받을 수 있습니다.
            </p>
          </div>
        </div>

        {/* 항목 4 */}
        <div className="item">
          <input
            type="checkbox"
            name="term4"
            checked={checks.term4}
            onChange={handleSingle}
          />

          <div className="text">
            <p className="title">[선택] 자세 스냅샷 저장 동의</p>
            <p className="desc">
              자세 변화 기록 확인을 위해 분석 중 일부 화면을 스냅샷으로 저장할 수 있습니다. 저장된 스냅샷은 갤러리에서 확인하거나 삭제할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <button
        className="next-btn"
        onClick={() => {
          if (checks.term1 && checks.term2 && checks.term3) {
            sessionStorage.setItem("signupTermsAccepted", "true");
            sessionStorage.setItem(
              "signupSnapshotConsent",
              String(checks.term4)
            );
            navigate("/signup");
          } else {
            alert("필수 약관에 모두 동의해주세요.");
          }
        }}
      >
        다음으로
      </button>

      <p
        className="login-text"
        onClick={() => navigate("/login")}
        style={{ cursor: "pointer" }}
      >
        이미 계정이 있으신가요? 로그인하러가기
      </p>
    </div>
  );
}

export default SignupAgree;
