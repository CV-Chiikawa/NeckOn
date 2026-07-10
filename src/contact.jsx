import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createContact } from "./api/contactApi";
import "./contact.css";

const MAX_CONTACT_LENGTH = 5000;

function Contact() {
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append("category", "other");
      formData.append("content", trimmedContent);

      await createContact(formData);
      alert("문의가 접수되었습니다.");
      navigate("/mypage");
    } catch (error) {
      console.error("문의 전송 실패:", error);
      const message =
        error.response?.data?.message || "문의 전송에 실패했습니다.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <header className="contact-header">
        <img
          src="/images/NeckOn.png"
          className="contact-logo"
          alt="NeckOn 로고"
          onClick={() => navigate("/dashboardSummary")}
        />
        <div className="contact-header-line" />
      </header>

      <main className="contact-content">
        <section className="contact-copy">
          <h1>문의하기</h1>
          <p>답변은 가입 이메일로 발송됩니다.</p>
        </section>

        <label className="contact-textarea-wrap">
          <span className="sr-only">문의 내용</span>
          <textarea
            className="contact-textarea"
            value={content}
            maxLength={MAX_CONTACT_LENGTH}
            onChange={(event) => setContent(event.target.value)}
            placeholder="궁금한 점이나 불편한 점을 자세히 적어주세요."
          />
        </label>

        <div className="contact-warning">
          <img
            src="/material-symbols_warning-outline-rounded.png"
            className="contact-warning-icon"
            alt=""
          />
          <span>문의 내용에 욕설을 적을 시 이용 제재 혹은 법적 조치가 이뤄질 수 있습니다.</span>
        </div>

        <button
          type="button"
          className="contact-submit-btn"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "전송 중..." : "문의하기"}
        </button>
      </main>
    </div>
  );
}

export default Contact;
