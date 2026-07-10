import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteMyProfile, getMyProfile, updateMyProfile } from "./api/userApi";
import "./mypage.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function toProfileImageUrl(profileImage) {
  if (!profileImage) {
    return "/images/Ellipse3.png";
  }

  if (profileImage.startsWith("http://") || profileImage.startsWith("https://")) {
    return profileImage;
  }

  return API_BASE_URL ? `${API_BASE_URL}${profileImage}` : profileImage;
}

function MyPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [snapshotConsent, setSnapshotConsent] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [previewImage, setPreviewImage] = useState("");
  const [isNicknameEditing, setIsNicknameEditing] = useState(false);
  const [isPasswordEditing, setIsPasswordEditing] = useState(false);
  const [isImageEditing, setIsImageEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getMyProfile();
        const userData = res.data.data;

        setProfile(userData);
        setNickname(userData.nickname || "");
        setSnapshotConsent(Boolean(userData.snapshot_consent));
        setPreviewImage(toProfileImageUrl(userData.profile_image));
      } catch (err) {
        console.error(err);
        const message =
          err.response?.data?.message || "회원정보를 불러오지 못했습니다.";
        alert(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    if (!selectedImageFile) {
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setPreviewImage(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImageFile]);

  const hasChanges = useMemo(() => {
    if (!profile) {
      return false;
    }

    return (
      nickname !== (profile.nickname || "") ||
      Boolean(password) ||
      Boolean(selectedImageFile) ||
      snapshotConsent !== Boolean(profile.snapshot_consent)
    );
  }, [nickname, password, profile, selectedImageFile, snapshotConsent]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setSelectedImageFile(file);
    setIsImageEditing(true);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      alert("변경된 내용이 없습니다.");
      return;
    }

    if (password && password.length < 6) {
      alert("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    try {
      setIsSaving(true);

      const formData = new FormData();

      if (nickname !== (profile?.nickname || "")) {
        formData.append("nickname", nickname);
      }

      if (password) {
        formData.append("password", password);
      }

      if (selectedImageFile) {
        formData.append("profile_image", selectedImageFile);
      }

      if (snapshotConsent !== Boolean(profile?.snapshot_consent)) {
        formData.append("snapshot_consent", String(snapshotConsent));
      }

      const res = await updateMyProfile(formData);
      const updatedProfile = res.data.data;
      const updatedSnapshotConsent =
        typeof updatedProfile.snapshot_consent === "boolean"
          ? updatedProfile.snapshot_consent
          : snapshotConsent;

      setProfile({
        ...updatedProfile,
        snapshot_consent: updatedSnapshotConsent,
      });
      setNickname(updatedProfile.nickname || "");
      setSnapshotConsent(updatedSnapshotConsent);
      setPassword("");
      setSelectedImageFile(null);
      setPreviewImage(toProfileImageUrl(updatedProfile.profile_image));
      setIsNicknameEditing(false);
      setIsPasswordEditing(false);
      setIsImageEditing(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      alert("회원정보가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      const message =
        err.response?.data?.message || "회원정보 수정에 실패했습니다.";
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleWithdraw = async () => {
    const confirmed = window.confirm(
      "정말 회원 탈퇴를 진행하시겠습니까?\n탈퇴 후에는 계정과 관련 데이터가 삭제되며 복구할 수 없습니다."
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await deleteMyProfile();

      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("signupTermsAccepted");

      alert(res.data.message || "회원 탈퇴가 완료되었습니다.");
      navigate("/login", { replace: true });
    } catch (err) {
      console.error(err);
      const message =
        err.response?.data?.message || "회원 탈퇴에 실패했습니다.";
      alert(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mypage-container">
        <div className="mypage-header">
          <img
            src="/images/NeckOn.png"
            className="mypage-logo"
            onClick={() => navigate("/dashboardSummary")}
          />
        </div>
        <div className="mypage-divider" />
        <div className="mypage-loading">회원정보를 불러오는 중입니다.</div>
      </div>
    );
  }

  return (
    <div className="mypage-container">
      <div className="mypage-header">
        <img
          src="/images/NeckOn.png"
          className="mypage-logo"
          onClick={() => navigate("/dashboardSummary")}
        />
      </div>

      <div className="mypage-divider" />

      <div className="mypage-card profile-card">
        <div className="profile-left">
          <img
            src={previewImage || "/images/Ellipse3.png"}
            className="profile-img"
            alt="프로필 이미지"
          />
          <div className="profile-text-group">
            <div className="profile-name">{nickname || "닉네임 없음"}</div>
            {selectedImageFile && (
              <div className="profile-file-name">{selectedImageFile.name}</div>
            )}
          </div>
        </div>

        <div className="profile-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-file-input"
            onChange={handleImageChange}
          />
          <button
            className="small-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            {isImageEditing ? "이미지 선택됨" : "수정하기"}
          </button>
        </div>
      </div>

      <div className="mypage-card">
        <div className="info-left">
          <span className="label">이메일</span>
          <span className="value">{profile?.email || "-"}</span>
        </div>
      </div>

      <div className="mypage-card">
        <div className="info-left editable-info">
          <span className="label">닉네임</span>
          {isNicknameEditing ? (
            <input
              className="edit-input"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="닉네임을 입력해주세요."
            />
          ) : (
            <span className="value">{nickname || "닉네임 없음"}</span>
          )}
        </div>

        <button
          className="small-btn"
          onClick={() => setIsNicknameEditing((prev) => !prev)}
        >
          {isNicknameEditing ? "닫기" : "수정하기"}
        </button>
      </div>

      <div className="mypage-card">
        <div className="info-left editable-info">
          <span className="label">비밀번호</span>
          {isPasswordEditing ? (
            <input
              type="password"
              className="edit-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="새 비밀번호를 입력해주세요."
            />
          ) : (
            <span className="value masked-value">********</span>
          )}
        </div>

        <button
          className="small-btn"
          onClick={() => setIsPasswordEditing((prev) => !prev)}
        >
          {isPasswordEditing ? "닫기" : "수정하기"}
        </button>
      </div>

      <div className="mypage-card snapshot-consent-card">
        <div className="snapshot-consent-copy">
          <span className="label snapshot-consent-label">스냅샷 저장 동의</span>
          <span className="snapshot-consent-desc">
            자세 변화 기록 확인을 위해 분석 중 일부 화면을 저장합니다.
            <br />
            저장된 스냅샷은 갤러리에서 확인하거나 삭제할 수 있습니다.
          </span>
        </div>

        <button
          type="button"
          className={`snapshot-toggle ${snapshotConsent ? "is-on" : ""}`}
          aria-pressed={snapshotConsent}
          aria-label="스냅샷 저장 동의"
          onClick={() => setSnapshotConsent((prev) => !prev)}
        >
          <span />
        </button>
      </div>

      <button
        type="button"
        className="mypage-card contact-link-card"
        onClick={() => navigate("/contact")}
      >
        <span className="label contact-link-label">문의하기</span>
        <span className="contact-link-arrow">›</span>
      </button>

      <div className="mypage-card withdraw-card">
        <button
          className="withdraw-btn"
          onClick={handleWithdraw}
          disabled={isDeleting || isSaving}
        >
          {isDeleting ? "탈퇴 처리 중..." : "회원 탈퇴"}
        </button>
      </div>

      <div className="save-wrap">
        <button
          className="save-btn"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}

export default MyPage;
