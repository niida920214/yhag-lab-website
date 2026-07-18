/*!
 * Yahagi Lab — Global Script
 * 矢作研究室 公式サイト共通スクリプト
 * 依存: Lucide Icons (CDN, defer 読み込み)
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "yahagi-lab-theme";

  /* ---- Theme toggle ----------------------------------------------------
   * Default (no saved preference yet) is always dark mode. Once the user
   * manually toggles via .theme-toggle, that explicit choice is persisted
   * to localStorage and takes priority on every later visit.
   ------------------------------------------------------------------- */
  var DEFAULT_THEME = "dark";

  function applyStoredTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (err) {
      stored = null;
    }
    var theme = stored === "dark" || stored === "light" ? stored : DEFAULT_THEME;
    root.setAttribute("data-theme", theme);
  }

  function currentTheme() {
    var explicit = root.getAttribute("data-theme");
    return explicit === "dark" || explicit === "light" ? explicit : DEFAULT_THEME;
  }

  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      /* localStorage unavailable — ignore, theme just won't persist */
    }
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(next === "dark"));
    });
  }

  applyStoredTheme();

  /* ---- Fiscal-year progress bar ------------------------------------------
   * 4月1日を0%、翌年3月31日の終わりを100%として、今日がその区間の何%の
   * 位置にいるかを計算して .fiscal-progress の中身に反映する。
   * -------------------------------------------------------------------- */
  function renderFiscalProgress() {
    var fill = document.querySelector("[data-fiscal-fill]");
    var percentEl = document.querySelector("[data-fiscal-percent]");
    var labelEl = document.querySelector("[data-fiscal-label]");
    if (!fill || !percentEl) return;

    var now = new Date();
    // getMonth() is 0-indexed, so April = 3
    var fiscalStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    var fiscalStart = new Date(fiscalStartYear, 3, 1, 0, 0, 0, 0);
    var fiscalEnd = new Date(fiscalStartYear + 1, 2, 31, 23, 59, 59, 999);

    var totalMs = fiscalEnd - fiscalStart;
    var elapsedMs = now - fiscalStart;
    var percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    fill.style.width = percent.toFixed(1) + "%";
    percentEl.textContent = percent.toFixed(1) + "%";
    if (labelEl) {
      labelEl.textContent = fiscalStartYear + "年度";
    }
  }

  /* ---- Photo slots（全員共有） ------------------------------------------------
   * [data-photo-slot] の付いたボタンをクリックすると画像選択ダイアログが開き、
   * 縮小した写真を /api/photo（Vercel Blob）へアップロードして全訪問者に共有する。
   * アップロードには合言葉（サーバー側の環境変数 UPLOAD_PASSPHRASE）が必要。
   * サーバーに繋がらない場合（ローカル確認時など）は従来どおり
   * localStorage に保存し、その端末でだけ表示するフォールバックで動く。
   * ------------------------------------------------------------------------ */
  var PHOTO_KEY_PREFIX = "yahagi-photo-";
  var PHOTO_MAX_DIM = 512; // アップロード前にこのサイズまで縮小（転送量・容量対策）
  var PHOTO_API = "/api/photo";
  var PASS_SESSION_KEY = "yahagi-upload-pass"; // 同じタブ内での合言葉の再入力を省略

  function applyPhoto(slot, url) {
    var img = slot.querySelector("img");
    if (!img) return;
    img.src = url;
    img.hidden = false;
    slot.classList.add("has-photo");
  }

  function loadLocalPhoto(slot) {
    try {
      var saved = localStorage.getItem(
        PHOTO_KEY_PREFIX + slot.getAttribute("data-photo-slot")
      );
      if (saved) applyPhoto(slot, saved);
    } catch (err) {
      /* localStorage unavailable — placeholder のまま */
    }
  }

  function initPhotoSlots() {
    var slots = document.querySelectorAll("[data-photo-slot]");
    if (!slots.length) return;

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    var activeSlot = null;

    slots.forEach(function (slot) {
      var name = slot.getAttribute("data-photo-slot");

      /* まずサーバーの共有写真を取得。無ければ／失敗すればローカル保存分を表示 */
      fetch(PHOTO_API + "?slot=" + encodeURIComponent(name))
        .then(function (r) {
          if (!r.ok) throw new Error("api error");
          return r.json();
        })
        .then(function (data) {
          if (data && data.url) applyPhoto(slot, data.url);
          else loadLocalPhoto(slot);
        })
        .catch(function () {
          loadLocalPhoto(slot);
        });

      slot.addEventListener("click", function () {
        activeSlot = slot;
        fileInput.value = "";
        fileInput.click();
      });
    });

    function uploadPhoto(slot, dataUrl) {
      var name = slot.getAttribute("data-photo-slot");
      var pass = null;
      try {
        pass = sessionStorage.getItem(PASS_SESSION_KEY);
      } catch (err) {
        pass = null;
      }
      if (!pass) {
        pass = window.prompt(
          "写真を全員に共有します。アップロード用の合言葉を入力してください："
        );
        if (pass === null || pass === "") return; // キャンセル
      }

      fetch(PHOTO_API + "?slot=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pass, dataUrl: dataUrl }),
      })
        .then(function (r) {
          if (r.ok) return r.json();
          if (r.status === 401) {
            try {
              sessionStorage.removeItem(PASS_SESSION_KEY);
            } catch (err) { /* ignore */ }
            window.alert("合言葉が違います。");
            throw new Error("handled");
          }
          window.alert("アップロードに失敗しました（コード: " + r.status + "）。");
          throw new Error("handled");
        })
        .then(function (data) {
          try {
            sessionStorage.setItem(PASS_SESSION_KEY, pass);
          } catch (err) { /* ignore */ }
          /* キャッシュを避けるためクエリを付けて即時反映 */
          applyPhoto(slot, data.url + "?v=" + Date.now());
        })
        .catch(function (err) {
          if (err && err.message === "handled") return;
          /* サーバーに届かない（ローカル確認など）→ この端末だけに保存 */
          applyPhoto(slot, dataUrl);
          try {
            localStorage.setItem(PHOTO_KEY_PREFIX + name, dataUrl);
          } catch (e) { /* ignore */ }
          window.alert(
            "サーバーに接続できなかったため、この端末にのみ保存しました（共有はされていません）。"
          );
        });
    }

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file || !activeSlot) return;
      var slot = activeSlot;

      var reader = new FileReader();
      reader.onload = function () {
        var image = new Image();
        image.onload = function () {
          /* 長辺 PHOTO_MAX_DIM px まで縮小してからアップロードする */
          var scale = Math.min(1, PHOTO_MAX_DIM / Math.max(image.width, image.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          uploadPhoto(slot, canvas.toDataURL("image/jpeg", 0.85));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---- 退室メール確認モーダル（仮実装） --------------------------------------
   * 「退室メール」→ 背景が暗くなりモーダル表示 → 送信者を選択 →
   * はい／キャンセル。現在はモックで、実際のメールは送信しない。
   * ------------------------------------------------------------------------ */
  function initMailModal() {
    var openBtn = document.getElementById("mail-open-btn");
    var modal = document.getElementById("mail-modal");
    if (!openBtn || !modal) return;

    var sendBtn = document.getElementById("mail-send-btn");
    var cancelBtn = document.getElementById("mail-cancel-btn");
    var result = document.getElementById("mail-result");
    var defaultNote = result ? result.textContent : "";

    function openModal() {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      if (result) {
        result.textContent = defaultNote;
        result.classList.remove("is-success");
      }
      var checked = modal.querySelector("input[name='mail-sender']:checked");
      if (checked) checked.focus();
    }

    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = "";
      openBtn.focus();
    }

    openBtn.addEventListener("click", openModal);
    cancelBtn.addEventListener("click", closeModal);

    /* 背景（モーダル外）クリックで閉じる */
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    sendBtn.addEventListener("click", function () {
      var checked = modal.querySelector("input[name='mail-sender']:checked");
      var senderName = checked
        ? checked.parentElement.querySelector("span").textContent
        : "（未選択）";
      var today = new Date();
      var dateStr =
        today.getFullYear() + "/" +
        String(today.getMonth() + 1).padStart(2, "0") + "/" +
        String(today.getDate()).padStart(2, "0");

      /* --- 仮実装ここから ---------------------------------------------
         実配信にする場合はここを API 呼び出し（例: Vercel Functions 経由で
         Gmail API / メール送信サービスを叩く）に置き換える。 */
      if (result) {
        result.textContent =
          "（仮）" + dateStr + " 付の退室メールを「" + senderName +
          "」として送信しました。※実際のメールはまだ送信されていません。";
        result.classList.add("is-success");
      }
      /* --- 仮実装ここまで --------------------------------------------- */
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderFiscalProgress();
    initPhotoSlots();
    initMailModal();

    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(currentTheme() === "dark"));
      btn.addEventListener("click", toggleTheme);
    });

    /* ---- Mobile navigation ------------------------------------------- */
    var navToggle = document.querySelector(".nav-toggle");
    var mainNav = document.querySelector(".main-nav");

    if (navToggle && mainNav) {
      navToggle.addEventListener("click", function () {
        var isOpen = mainNav.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(isOpen));
        document.body.style.overflow = isOpen ? "hidden" : "";
      });

      mainNav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          mainNav.classList.remove("is-open");
          navToggle.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
        });
      });

      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && mainNav.classList.contains("is-open")) {
          mainNav.classList.remove("is-open");
          navToggle.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
          navToggle.focus();
        }
      });
    }

    /* ---- Highlight current nav link ----------------------------------- */
    var currentPath = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".main-nav a[href]").forEach(function (link) {
      var linkPath = link.getAttribute("href").split("/").pop() || "index.html";
      if (linkPath === currentPath) {
        link.setAttribute("aria-current", "page");
      }
    });

    /* ---- Footer year --------------------------------------------------- */
    document.querySelectorAll("[data-current-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    /* ---- Lucide icon init ----------------------------------------------- */
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }

    /* ---- Scroll reveal (progressive enhancement) ------------------------ */
    var revealTargets = document.querySelectorAll("[data-reveal]");
    if (revealTargets.length) {
      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.15 }
        );
        revealTargets.forEach(function (el) {
          observer.observe(el);
        });
      } else {
        revealTargets.forEach(function (el) {
          el.classList.add("is-visible");
        });
      }
    }
  });
})();
