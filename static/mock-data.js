/* ============================================================
   이음 스쿨 v5 — 1단계 검증용 목 데이터
   2단계에서 Supabase 연결로 대체 예정
   ============================================================ */
window.EumMock = {
  church: { name: "이음 교회", dept: "유년부" },

  user: {
    name: "김교사",
    // 1인 다역 — 권한 묶음으로 메뉴 노출 판단
    permissions: ["admin", "manager", "operator"]
  },

  // ─── 표준 부서 프리셋 (참고용) ─────────────────────
  deptPresets: [
    { key: "infant",     name: "영아부",   sortOrder: 10 },
    { key: "toddler",    name: "유아부",   sortOrder: 20 },
    { key: "kinder",     name: "유치부",   sortOrder: 30 },
    { key: "young",      name: "유년부",   sortOrder: 40 },
    { key: "elementary", name: "초등부",   sortOrder: 50 },
    { key: "boys",       name: "소년부",   sortOrder: 60 },
    { key: "middle",     name: "중등부",   sortOrder: 70 },
    { key: "high",       name: "고등부",   sortOrder: 80 }
  ],

  // ─── 현재 등록된 부서 ──────────────────────────────
  departments: [
    { id: 30, name: "유치부", presetKey: "kinder",     isActive: true,  sortOrder: 30 },
    { id: 40, name: "유년부", presetKey: "young",      isActive: true,  sortOrder: 40 },
    { id: 50, name: "초등부", presetKey: "elementary", isActive: true,  sortOrder: 50 },
    { id: 70, name: "중등부", presetKey: "middle",     isActive: true,  sortOrder: 70 },
    { id: 80, name: "고등부", presetKey: "high",       isActive: false, sortOrder: 80 }
  ],

  // ─── 반 ───────────────────────────────────────────
  classes: [
    { id: 301, departmentId: 30, name: "사랑반", isActive: true, sortOrder: 1 },
    { id: 302, departmentId: 30, name: "소망반", isActive: true, sortOrder: 2 },
    { id: 401, departmentId: 40, name: "1반",    isActive: true, sortOrder: 1 },
    { id: 402, departmentId: 40, name: "2반",    isActive: true, sortOrder: 2 },
    { id: 403, departmentId: 40, name: "3반",    isActive: true, sortOrder: 3 },
    { id: 501, departmentId: 50, name: "1반",    isActive: true, sortOrder: 1 },
    { id: 502, departmentId: 50, name: "2반",    isActive: true, sortOrder: 2 },
    { id: 701, departmentId: 70, name: "1반",    isActive: true, sortOrder: 1 }
  ],

  // ─── 교사 (권한 묶음 + 부서·반 배정 + 연락처) ────
  teachers: [
    { id: 1, name: "김교사",   email: "kim@eum.kr",   phone: "010-1111-2222",
      roles: ["admin", "manager", "operator"],
      departmentIds: [40], classIds: [401], isActive: true },
    { id: 2, name: "이부장",   email: "lee@eum.kr",   phone: "010-3333-4444",
      roles: ["manager", "operator"],
      departmentIds: [40], classIds: [402], isActive: true },
    { id: 3, name: "박교사",   email: "park@eum.kr",  phone: "010-5555-6666",
      roles: ["operator"],
      departmentIds: [40], classIds: [403], isActive: true },
    { id: 4, name: "최교역자", email: "choi@eum.kr",  phone: "010-7777-8888",
      roles: ["admin"],
      departmentIds: [30, 40, 50, 70], classIds: [], isActive: true }
  ],

  // ─── 권한 묶음 라벨 (시스템 키는 유지, 화면은 범위 기반) ──
  roleLabels: {
    admin:    "교회 전체",
    manager:  "부서장",
    operator: "반 담당"
  },
  roleDescs: {
    admin:    "교회·부서·교사 전체 + 백업/내보내기",
    manager:  "맡은 부서 안의 반·교사·학생 관리",
    operator: "맡은 반의 학생 출석·돌봄 입력"
  },

  // ─── KPI / 운영 현황 / 오늘 할 일 ────────────────
  kpis: {
    students: 42, todayAttended: 28, absent: 8,
    newcomers: 3, prayers: 11, careNeeded: 4
  },
  progress: [
    { label: "출석 입력률", value: 92 },
    { label: "결석 연락",   value: 50 },
    { label: "공지 발송",   value: 100 },
    { label: "교사 확인",   value: 75 }
  ],
  todayTasks: [
    { id: 1, text: "출석 체크 (오늘 주일)", done: false },
    { id: 2, text: "결석 학생 4명 연락",     done: false },
    { id: 3, text: "주중 공지 문안 작성",    done: true  }
  ],

  // ─── 학생 (departmentId/classId로 권한 필터링 가능) ──
  students: [
    { id: 1, name: "이서연", grade: "초3", departmentId: 40, classId: 401,
      parent: "이상호", phone: "010-1234-5678",
      lastAttend: "2026-05-10", tags: [] },
    { id: 2, name: "김민준", grade: "초4", departmentId: 40, classId: 402,
      parent: "김지영", phone: "010-2345-6789",
      lastAttend: "2026-05-03", tags: ["long-absent"] },
    { id: 3, name: "박지우", grade: "초2", departmentId: 40, classId: 401,
      parent: "박철수", phone: "010-3456-7890",
      lastAttend: "2026-05-10", tags: ["newcomer"] },
    { id: 4, name: "최서윤", grade: "초3", departmentId: 40, classId: 403,
      parent: "최영미", phone: "010-4567-8901",
      lastAttend: "2026-04-26", tags: ["long-absent", "care"] },
    { id: 5, name: "정도윤", grade: "초5", departmentId: 50, classId: 501,
      parent: "정민수", phone: "010-5678-9012",
      lastAttend: "2026-05-10", tags: [] },
    { id: 6, name: "한예린", grade: "초1", departmentId: 40, classId: 402,
      parent: "한경수", phone: "010-6789-0123",
      lastAttend: "2026-05-10", tags: ["newcomer"] }
  ],

  absent: [
    { id: 4, name: "최서윤", weeks: 3,
      parent: "최영미", phone: "010-4567-8901",
      note: "지난 달 이사 — 새 교회 정착까지 따뜻한 인사 필요" },
    { id: 2, name: "김민준", weeks: 1,
      parent: "김지영", phone: "010-2345-6789",
      note: "" }
  ],

  // ─── 기도제목 (subjectType + isAnonymous 지원) ──
  // subjectType: "student" | "teacher" | "department"
  // isAnonymous: true → 화면 표시는 "익명" / "익명 교사"로 마스킹
  prayers: [
    { id: 1, subjectType: "student",    who: "이서연 가정", text: "외할머니 건강 회복",                  date: "2026-05-10", isAnonymous: false },
    { id: 2, subjectType: "student",    who: "김민준",       text: "전학 적응",                            date: "2026-05-03", isAnonymous: false },
    { id: 3, subjectType: "department", who: "유년부",       text: "여름 수련회 준비",                     date: "2026-05-13", isAnonymous: false },
    { id: 4, subjectType: "teacher",    who: "김교사",       text: "학생 한 명 한 명을 살피는 마음",       date: "2026-05-12", isAnonymous: false },
    { id: 5, subjectType: "teacher",    who: "이부장",       text: "가정 안에 평안",                       date: "2026-05-14", isAnonymous: true  }
  ]
};
