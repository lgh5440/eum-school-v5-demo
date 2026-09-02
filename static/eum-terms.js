/* eum-terms — 5문장 무료·비영리 약관 (Sprint 1 Day 9 / 원칙 8 의무 문구).
 *
 * 출처: TODO § 원칙 8 (★ 표시 핵심 9 원칙 중 8번 — "비영리·무료 명시").
 *
 * 사용:
 *   <div data-eum-terms></div>
 *   <script src="./static/eum-terms.js"></script>
 *   페이지 로드 시 자동으로 data-eum-terms 요소에 5문장 약관 삽입.
 *
 * 9번 원칙: 본 본문은 외부(학부모·교사)가 가입 시 처음 읽는 자리 → 가드 어휘 적용.
 *   통제·서열 어휘 회피, "함께·동행·짐 나누기" 톤.
 */
(function () {
  const SENTENCES = [
    "1. 이음 스쿨은 한국 교회학교 다음세대 양육을 돕는 비영리 도구이며, 사용료를 받지 않습니다.",
    "2. 본 시스템은 학생·교사·부서장을 평가하거나 감독하지 않으며, 데이터는 짐 나누기와 동행을 위해서만 사용됩니다.",
    "3. 학부모·학생 개인정보는 가입 교회 안에서만 사용되며, 외부 제3자에게 공유되지 않습니다.",
    "4. 발생하는 외부 서비스 비용(카카오 알림톡·AI 사용료 등)은 각 교회·운영자가 직접 부담합니다.",
    "5. 본 약관에 동의하지 않으시면 사용을 중단하실 수 있고, 요청 시 등록된 데이터는 모두 삭제됩니다.",
  ];

  function render() {
    const targets = document.querySelectorAll("[data-eum-terms]");
    targets.forEach((el) => {
      // 이미 렌더링됐으면 중복 방지
      if (el.dataset.eumTermsRendered === "1") return;
      el.dataset.eumTermsRendered = "1";
      el.innerHTML = `
        <details class="eum-terms" style="margin-top:14px;padding:10px 12px;background:#fcfaf4;border:1px solid #e6e1d5;border-radius:8px">
          <summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:#101A3D">이음 스쿨 5문장 약관 (무료·비영리 / 9번 원칙)</summary>
          <ol style="margin:10px 0 0;padding-left:20px;line-height:1.7;font-size:0.92rem;color:#3A4568">
            ${SENTENCES.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
          </ol>
        </details>
      `;
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }

  window.EumTerms = { SENTENCES, render };
})();
