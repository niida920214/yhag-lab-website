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

  document.addEventListener("DOMContentLoaded", function () {
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
