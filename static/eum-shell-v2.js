/* ============================================================
   이음 스쿨 v5 Shell JS — 헤더 + 하단 탭 5개 mount
   2026-05-15 신규 작성

   사용법:
     <script src="./static/eum-shell-v2.js"></script>
     <script>
       EumShell.mount({
         pageId: "home",
         title: "이음 교회학교",
         church: "이음 교회",
         dept: "유년부"
       });
     </script>
   ============================================================ */
(function () {
  "use strict";

  // 하단 탭 5개 — WORK_ORDER_v5 §4
  var TABS = [
    { id: "home",     label: "홈",   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', href: "./home.html"     },
    { id: "students", label: "학생", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', href: "./students.html" },
    { id: "events",   label: "출석", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 11 3 3 5-5"/></svg>', href: "./events.html"   },
    { id: "alerts",   label: "돌봄", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>', href: "./alerts.html"   },
    { id: "all",      label: "전체", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>', href: "./all.html"      }
  ];

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function thisSundayKR() {
    var d = new Date();
    var dow = d.getDay(); // 0=일
    var diff = (7 - dow) % 7;
    if (diff === 0 && dow !== 0) diff = 7;
    var sun = new Date(d);
    sun.setDate(d.getDate() + diff);
    return (sun.getMonth() + 1) + "월 " + sun.getDate() + "일 주일";
  }

  function todayKR() {
    var d = new Date();
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + days[d.getDay()] + ")";
  }

  function buildHeader(opts) {
    var church = escapeHtml(opts.church || "이음 교회");
    var dept = opts.dept != null ? String(opts.dept).trim() : "";
    var brand = escapeHtml(opts.title || "이음 교회학교");

    // dept 비어있으면 점 두 개 연속 표시 방지
    var deptBlock = dept
      ? '<span>·</span><span>' + escapeHtml(dept) + '</span>'
      : '';

    return (
      '<header class="eum-h">' +
        '<div class="eum-h__top">' +
          '<div class="eum-h__logo"><img src="./static/eum-logo.png" alt="E:UM" style="width:100%; height:100%; object-fit:contain; border-radius:8px;" /></div>' +
          '<div class="eum-h__brand">' + brand + '</div>' +
          '<div class="eum-h__spacer"></div>' +
          '<button class="eum-h__btn" id="eum-h-menu" aria-label="메뉴">⋯</button>' +
        '</div>' +
        '<div class="eum-h__meta">' +
          '<strong>' + church + '</strong>' +
          deptBlock +
          '<span>·</span>' +
          '<span>' + thisSundayKR() + '</span>' +
        '</div>' +
      '</header>'
    );
  }

  function buildBot(activeId) {
    var html = '<nav class="eum-bot">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      html += '<a href="' + escapeHtml(t.href) + '"'
            + (t.id === activeId ? ' class="on"' : '')
            + '>'
            +   '<span class="ico">' + t.icon + '</span>'
            +   '<span>' + escapeHtml(t.label) + '</span>'
            + '</a>';
    }
    html += '</nav>';
    return html;
  }

  function buildEumFamilyFooter() {
    var apps = [
      { key: 'talentroad', name: '달란트로드', tagline: '나의 은사 찾기 · 56유형 검사', emoji: '🗺️', url: 'https://lgh5440.github.io/talentroad-test/', accent: '#C9962B' },
      { key: 'myrealid', name: '이음 캠프', tagline: '수련회·모임 운영 도우미', emoji: '🏕️', url: 'https://eum-camp-template.web.app/', accent: '#a5b4fc' },
      { key: 'eumplay', name: '이음 플레이', tagline: '교회 활동 게임 9종 · 진행 도우미', emoji: '🎲', url: 'https://lgh5440.github.io/eum-play/', accent: '#34d399' },
      { key: 'eumschool', name: '이음 스쿨', tagline: '교회학교 통합 양육 (운영 중)', emoji: '📚', url: '', accent: '#06b6d4', status: 'current' },
      { key: 'eumphoto', name: '이음 포토', tagline: '사진 정리 데스크톱 앱', emoji: '📷', url: 'https://lgh5440.github.io/eum-photo/', accent: '#f43f5e' }
    ];

    var cards = '';
    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      var isCurrent = app.key === 'eumschool';
      var isComing = app.status === 'coming-soon';
      
      var cardClass = 'eum-family-card';
      if (isCurrent) cardClass += ' is-current';
      if (isComing) cardClass += ' is-coming-soon';

      var cardStyle = '';
      if (isCurrent) {
        cardStyle = 'background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);';
      } else if (!isComing && app.url) {
        cardStyle = 'background:linear-gradient(140deg, rgba(255,255,255,0.06), ' + app.accent + '1f); border:1px solid ' + app.accent + '55;';
      } else {
        cardStyle = 'background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.08);';
      }

      var inner = '<span class="eum-family-emoji">' + app.emoji + '</span>'
                + '<p class="eum-family-name">' + app.name + '</p>'
                + '<p class="eum-family-tag">' + app.tagline + '</p>';
      
      if (isCurrent) {
        inner += '<span class="eum-family-badge">현재 앱</span>';
      } else if (isComing) {
        inner += '<span class="eum-family-badge" style="background:rgba(201,150,43,0.18); color:#F0BC78; border:1px solid rgba(201,150,43,0.4);">준비 중</span>';
      }

      if (isCurrent || isComing || !app.url) {
        cards += '<div class="' + cardClass + '" style="' + cardStyle + '">' + inner + '</div>';
      } else {
        var href = app.url + '?utm_source=eumschool&utm_medium=footer&utm_campaign=eum-family';
        cards += '<a class="' + cardClass + '" href="' + href + '" target="_blank" rel="noopener noreferrer" style="' + cardStyle + '">' + inner + '</a>';
      }
    }

    return '<section class="eum-family" aria-label="이음 패밀리 앱">'
         +   '<header class="eum-family-header">'
         +     '<h3 class="eum-family-title">이음 패밀리 앱</h3>'
         +     '<p class="eum-family-sub">하나님과 사람을, 사람과 사람을 잇다 — E:UM</p>'
         +   '</header>'
         +   '<div class="eum-family-grid">' + cards + '</div>'
         +   '<p class="eum-family-contact">오류 신고 · 문의 : <a href="mailto:lgh544092@gmail.com?subject=%5BE%3AUM%20%ED%8C%A8%EB%B0%80%EB%A6%AC%5D%20%EB%AC%B8%EC%9D%98%C2%B7%EC%98%A4%EB%A5%98%20%EC%A0%9C%EB%B3%B4">lgh544092@gmail.com</a></p>'
         + '</section>';
  }

  function mount(opts) {
    opts = opts || {};
    var activeTab = opts.pageId || "home";

    if (!document.querySelector(".eum-h")) {
      document.body.insertAdjacentHTML("afterbegin", buildHeader(opts));
    }
    if (!document.querySelector(".eum-bot")) {
      document.body.insertAdjacentHTML("beforeend", buildBot(activeTab));
    }

    var main = document.querySelector(".eum-main");
    if (main && !document.querySelector(".eum-family")) {
      main.insertAdjacentHTML("beforeend", buildEumFamilyFooter());
    }

    var menu = document.getElementById("eum-h-menu");
    if (menu) {
      menu.addEventListener("click", function () {
        // Supabase 연결돼 있으면 로그아웃, 아니면 전체 탭으로
        if (window.Eum && window.Eum.signOut) {
          if (confirm("로그아웃 하시겠습니까?")) {
            window.Eum.signOut().then(function () {
              window.location.replace("./login.html");
            });
          }
        } else {
          window.location.href = "./all.html";
        }
      });
    }
  }

  // 인증 가드 — Eum이 로드돼 있으면 세션 확인. 미인증이면 login으로
  async function guard() {
    if (!window.Eum) return true; // 1단계 호환 — Supabase 미사용 화면
    var ok = await window.Eum.requireAuth();
    if (!ok) {
      window.location.replace("./login.html");
      return false;
    }
    return true;
  }

  window.EumShell = {
    mount: mount,
    guard: guard,
    TABS: TABS,
    todayKR: todayKR,
    thisSundayKR: thisSundayKR
  };
})();
