/* ============================================================
   E:UM Local Storage Port — 로컬 우선(local-first) 무료 티어용
   (docs/로컬우선_온보딩_설계_2026-09-02.md §4 StoragePort 설계의
   로컬(IndexedDB) 어댑터 구현 — 2026-09-02 1차: 학생명부·출석 /
   2026-09-02 2차: 돌봄·기도 메모 + CSV·JSON 백업(export))

   범위: students(학생명부 — 2026-09-03 4차: guardians·birthYear·gender·personalNote
   추가) · attendance(출석) · careNotes(돌봄·기도 메모) · departments·classes
   (부서·반 구조 — 2026-09-03 3차) · careAlertResolutions(결석 알림 처리기록 —
   2026-09-03 3차) · teachers·teacherCareLogs(교사관리 — 2026-09-03 4차: 예전
   admin 기능 복구 3단계) · setup(최초 설정값) · export(CSV 3종 + versioned
   JSON — §5 설계 그대로)
   범위 밖(미구현): import(JSON 복원) · 협업 모드 마이그레이션(§9) · 카카오 알림톡
   발송(외부 유료 API 연동 필요 — 무료 로컬 단일사용자 모드 취지와 배치되어 이식
   불가 판정, 2026-09-03 조사보고 참고) · 신입교사 가입승인(원격 2인 흐름이라
   이식 불가) · 보호자 다건 가족 그룹핑(형제자매 보호자 공유 — 로컬 단일사용자
   규모에서 학생별 보호자 중복 입력의 비용이 관계형 모델의 복잡도보다 낮다고
   판단해 학생 레코드에 guardians 배열을 직접 embed, 별도 families 스토어를
   만들지 않음). 실제로 안 쓰는 코드를 미리 만들지 않는다.

   설계 원칙(§4 인용): "localStorage는 mode/version/onboarding/UI 설정과
   migration marker만 보관하고 PII는 저장하지 않는다" — 그래서 학생 이름 등
   실제 개인정보는 전부 IndexedDB에만 쓰고, localStorage에는
   eum_school_mode 같은 플래그만 남긴다.
   ============================================================ */
(function () {
  "use strict";

  var DB_NAME = "eum_school_local_v1";
  // v1: meta·students·attendance / v2(2026-09-02): + careNotes /
  // v3(2026-09-03): + departments·classes·careAlertResolutions /
  // v4(2026-09-03): + teachers·teacherCareLogs (students의 guardians·birthYear·
  // gender·personalNote는 새 필드일 뿐 새 스토어가 아니라 버전업 불필요) /
  // v5(2026-09-03, 오너 지시 — 기존 패턴대로 버전업): students에 phone·address
  // 필드 추가(이 역시 새 스토어는 아니라 onupgradeneeded에서 할 일은 없지만,
  // 스키마 변경 시점을 버전 번호로 명시 추적하라는 지시를 그대로 따름)
  var DB_VERSION = 5;
  var MODE_KEY = "eum_school_mode";

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("이 브라우저는 로컬 저장(IndexedDB)을 지원하지 않습니다."));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("students")) {
          db.createObjectStore("students", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("attendance")) {
          var att = db.createObjectStore("attendance", { keyPath: "id" });
          att.createIndex("by_student", "studentId", { unique: false });
          att.createIndex("by_date", "date", { unique: false });
        }
        // v2 — 이미 v1 DB가 있는 기기도 이 분기로 스토어만 추가된다(기존 데이터 무손실).
        if (!db.objectStoreNames.contains("careNotes")) {
          var notes = db.createObjectStore("careNotes", { keyPath: "id" });
          notes.createIndex("by_student", "studentId", { unique: false });
          notes.createIndex("by_date", "date", { unique: false });
        }
        // v3 — 기존 v1·v2 기기도 이 분기로 스토어만 추가된다(기존 데이터 무손실).
        if (!db.objectStoreNames.contains("departments")) {
          db.createObjectStore("departments", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("classes")) {
          var classes = db.createObjectStore("classes", { keyPath: "id" });
          classes.createIndex("by_department", "departmentId", { unique: false });
        }
        if (!db.objectStoreNames.contains("careAlertResolutions")) {
          db.createObjectStore("careAlertResolutions", { keyPath: "id" });
        }
        // v4 — 기존 v1~v3 기기도 이 분기로 스토어만 추가된다(기존 데이터 무손실).
        if (!db.objectStoreNames.contains("teachers")) {
          db.createObjectStore("teachers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("teacherCareLogs")) {
          var tLogs = db.createObjectStore("teacherCareLogs", { keyPath: "id" });
          tLogs.createIndex("by_teacher", "teacherId", { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { reject(req.error || new Error("로컬 저장소를 여는 데 실패했습니다.")); };
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeName, mode).objectStore(storeName);
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("저장소 작업에 실패했습니다.")); };
    });
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // 구형 브라우저 폴백 — 로컬 전용 식별자라 UUID 표준 엄밀성 불필요.
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function todayKst() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  }

  async function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // ─── 모드 플래그 (localStorage — PII 없음) ────────────────
  function setLocalMode() {
    try { localStorage.setItem(MODE_KEY, "local"); } catch (_) {}
  }
  function getMode() {
    try { return localStorage.getItem(MODE_KEY); } catch (_) { return null; }
  }
  function isLocalMode() {
    return getMode() === "local";
  }

  // ─── 최초 설정 (교회명·본인이름·PIN) ──────────────────────
  async function saveSetup(input) {
    var record = {
      key: "setup",
      churchName: (input.churchName || "").trim(),
      userName: (input.userName || "").trim(),
      pinHash: input.pin ? await sha256Hex(input.pin) : null,
      createdAt: new Date().toISOString(),
    };
    var store = await tx("meta", "readwrite");
    await reqToPromise(store.put(record));
    setLocalMode();
    return record;
  }

  async function getSetup() {
    var store = await tx("meta", "readonly");
    var record = await reqToPromise(store.get("setup"));
    return record || null;
  }

  // ─── 학생 명부 ─────────────────────────────────────────────
  // departmentId/classId(2026-09-03 3차 추가) — 부서·반을 먼저 만든 뒤 배정하는 구조화
  // 경로. department(자유입력 문자열)는 v2 이전 레거시 호환용으로 남겨둔다 — 부서를
  // 아직 안 만들었거나 굳이 목록화하고 싶지 않을 때도 이름만으로 쓸 수 있게 한다.
  // guardians/birthYear/gender/personalNote(2026-09-03 4차 — 새친구관리 이식) 전부
  // 선택값이라 기존 "학생 명부"의 빠른 등록(이름·부서·반만)과 그대로 호환된다.
  function normalizeGuardians(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (g) {
        return {
          name: (g && g.name || "").trim(),
          relation: (g && g.relation) || "other",
          phone: (g && g.phone || "").trim(),
        };
      })
      .filter(function (g) { return g.name; });
  }

  async function addStudent(input) {
    var name = (input.name || "").trim();
    if (!name) throw new Error("학생 이름을 입력해 주세요.");
    var birthYear = input.birthYear === "" || input.birthYear == null ? null : parseInt(input.birthYear, 10);
    var record = {
      id: uuid(),
      name: name,
      departmentId: input.departmentId || null,
      classId: input.classId || null,
      department: (input.department || "").trim() || null,
      birthYear: Number.isFinite(birthYear) ? birthYear : null,
      gender: input.gender || null,
      phone: (input.phone || "").trim() || null,
      address: (input.address || "").trim() || null,
      personalNote: (input.personalNote || "").trim() || null,
      guardians: normalizeGuardians(input.guardians),
      createdAt: new Date().toISOString(),
    };
    var store = await tx("students", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  // 연락처·주소 재수정 전용 — updateStudentPlacement(부서·반)와 같은 원칙으로
  // 다른 필드는 건드리지 않는다. 새친구관리 등 다른 경로로 등록된 기존 학생에게
  // 나중에 전화·주소를 추가/수정할 때도 이 함수 하나로 처리한다.
  async function updateStudentContact(id, patch) {
    if (!id) throw new Error("수정할 학생이 없습니다.");
    var store = await tx("students", "readwrite");
    var existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error("학생을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    if (patch.phone !== undefined) existing.phone = String(patch.phone || "").trim() || null;
    if (patch.address !== undefined) existing.address = String(patch.address || "").trim() || null;
    existing.updatedAt = new Date().toISOString();
    await reqToPromise(store.put(existing));
    return existing;
  }

  // 새친구관리 CSV 일괄등록 — rows는 이미 부서명·반명을 departmentId/classId로
  // 해석해 둔 상태로 받는다(이름→ID 매핑은 화면단에서, 실제 쓰기는 여기서 —
  // families.html의 클라이언트 매핑 + 서버 일괄쓰기 분리를 그대로 재현).
  async function bulkAddStudents(rows) {
    var created = [];
    var failed = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      try {
        var record = await addStudent(row);
        created.push(record);
      } catch (err) {
        failed.push({ index: i, name: row && row.name, reason: (err && err.message) || "등록 실패" });
      }
    }
    return { created: created, failed: failed, total: rows.length };
  }

  async function listStudents() {
    var store = await tx("students", "readonly");
    var rows = await reqToPromise(store.getAll());
    return (rows || []).sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
  }

  // 부서·반 재배정 전용 — 이름 등 다른 필드는 이 함수로 건드리지 않는다(범위를 좁게 유지).
  async function updateStudentPlacement(id, patch) {
    if (!id) throw new Error("수정할 학생이 없습니다.");
    var store = await tx("students", "readwrite");
    var existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error("학생을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    existing.departmentId = patch.departmentId || null;
    existing.classId = patch.classId || null;
    existing.updatedAt = new Date().toISOString();
    await reqToPromise(store.put(existing));
    return existing;
  }

  // ─── 부서·반 (2026-09-03 3차 — 예전 클라우드 admin의 church_settings.html
  //     "부서·반 설정"을 로컬 단일기기 구조로 이식. 삭제 기능은 원본에도 없어 만들지
  //     않는다 — 실제로 안 쓰는 코드를 미리 만들지 않는다는 원칙.) ─────────────────
  async function addDepartment(input) {
    var name = (input.name || "").trim();
    if (!name) throw new Error("부서 이름을 입력해 주세요.");
    var ageMin = input.ageMin === "" || input.ageMin == null ? null : parseInt(input.ageMin, 10);
    var ageMax = input.ageMax === "" || input.ageMax == null ? null : parseInt(input.ageMax, 10);
    if (ageMin != null && ageMax != null && ageMin > ageMax) {
      throw new Error("최소 나이는 최대 나이보다 작거나 같아야 합니다.");
    }
    var record = {
      id: uuid(),
      name: name,
      ageMin: Number.isFinite(ageMin) ? ageMin : null,
      ageMax: Number.isFinite(ageMax) ? ageMax : null,
      createdAt: new Date().toISOString(),
    };
    var store = await tx("departments", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listDepartments() {
    var store = await tx("departments", "readonly");
    var rows = await reqToPromise(store.getAll());
    return (rows || []).sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
  }

  async function addClass(input) {
    if (!input.departmentId) throw new Error("부서를 먼저 선택해 주세요.");
    var name = (input.name || "").trim();
    if (!name) throw new Error("반 이름을 입력해 주세요.");
    var record = {
      id: uuid(),
      departmentId: input.departmentId,
      name: name,
      createdAt: new Date().toISOString(),
    };
    var store = await tx("classes", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listClasses(filter) {
    var store = await tx("classes", "readonly");
    var rows = await reqToPromise(store.getAll());
    rows = rows || [];
    if (filter && filter.departmentId) rows = rows.filter(function (r) { return r.departmentId === filter.departmentId; });
    return rows.sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
  }

  // 학생의 부서·반 이름을 표시용으로 풀어낸다 — departmentId가 있으면 그걸 우선,
  // 없으면 레거시 자유입력 department 문자열로 대체(하위호환).
  function resolveStudentPlacement(student, deptMap, classMap) {
    if (student.departmentId && deptMap[student.departmentId]) {
      var deptName = deptMap[student.departmentId].name;
      var clsName = student.classId && classMap[student.classId] ? classMap[student.classId].name : "";
      return { department: deptName, className: clsName };
    }
    return { department: student.department || "", className: "" };
  }

  async function departmentsAndClassesMaps() {
    var depts = await listDepartments();
    var classes = await listClasses();
    var deptMap = {}; depts.forEach(function (d) { deptMap[d.id] = d; });
    var classMap = {}; classes.forEach(function (c) { classMap[c.id] = c; });
    return { deptMap: deptMap, classMap: classMap, depts: depts, classes: classes };
  }

  // ─── 결석 알림 — F4 (2026-09-03 3차 — 예전 클라우드 admin의 alerts_review.html +
  //     events.html 결석흐름을 로컬 단일기기 구조로 이식. 카카오 알림톡 자동발송은
  //     외부 유료 API 연동이 필요해 이식 불가 판정 — "폰 SMS로 보내기"(sms: URL, 수신자
  //     미지정)만 이식한다. 클라우드는 일요일 기준 결석 주차를 세지만, 로컬은 요일
  //     제약 없이 쓰는 사용 패턴을 고려해 "마지막 출석일로부터 경과 일수 ÷ 7"로 주차를
  //     센다 — 같은 스테이지 체계(1~4주+)를 요일 비종속으로 재현.) ──────────────────
  var DAY_MS = 86400000;

  function daysBetweenKstDates(dateStrA, dateStrB) {
    var a = new Date(dateStrA + "T00:00:00+09:00").getTime();
    var b = new Date(dateStrB + "T00:00:00+09:00").getTime();
    return Math.round((b - a) / DAY_MS);
  }

  function absenceStage(weeksAbsent) {
    if (weeksAbsent >= 4) return "week4";
    if (weeksAbsent === 3) return "week3";
    if (weeksAbsent === 2) return "week2";
    return "week1";
  }

  // 결석 1주 이상인 학생만 반환 — 등록 직후(첫 출석 전) 유예기간은 등록일 기준으로 계산.
  async function computeAbsenceAlerts() {
    var students = await listStudents();
    var attendance = await listAttendance();
    var lastByStudent = {};
    attendance.forEach(function (r) {
      var cur = lastByStudent[r.studentId];
      if (!cur || r.date > cur) lastByStudent[r.studentId] = r.date;
    });
    var today = todayKst();
    var alerts = [];
    students.forEach(function (s) {
      var lastDate = lastByStudent[s.id] || (s.createdAt ? s.createdAt.slice(0, 10) : today);
      var days = daysBetweenKstDates(lastDate, today);
      var weeksAbsent = Math.floor(days / 7);
      if (weeksAbsent < 1) return;
      alerts.push({
        studentId: s.id,
        studentName: s.name,
        lastAttendance: lastByStudent[s.id] || null,
        daysSince: days,
        weeksAbsent: weeksAbsent,
        stage: absenceStage(weeksAbsent),
      });
    });
    alerts.sort(function (a, b) { return b.weeksAbsent - a.weeksAbsent; });
    return alerts;
  }

  async function resolveAbsenceAlert(studentId, stage, resolution) {
    if (!studentId || !stage) throw new Error("처리할 알림을 찾을 수 없습니다.");
    var text = (resolution || "").trim();
    if (!text) throw new Error("어떤 돌봄이 있었는지 한 줄이라도 남겨 주세요.");
    var record = {
      id: studentId + "|" + stage,
      studentId: studentId,
      stage: stage,
      resolution: text,
      resolvedAt: new Date().toISOString(),
    };
    var store = await tx("careAlertResolutions", "readwrite");
    await reqToPromise(store.put(record));
    return record;
  }

  async function listAlertResolutions() {
    var store = await tx("careAlertResolutions", "readonly");
    var rows = await reqToPromise(store.getAll());
    return rows || [];
  }

  // ─── 교사관리 (2026-09-03 4차 — 예전 클라우드 admin의 teacher_management.html을
  //     로컬 단일기기 구조로 이식. "신입교사 가입승인"(원격 2인 흐름)은 이식 불가
  //     판정이라 옮기지 않는다 — 부서장이 교사를 직접 등록하는 경로만 남는다.) ────
  var TEACHER_ROLES = { teacher: "교사", assistant_department_head: "부감", department_head: "부장", pastor: "교역자" };

  async function addTeacher(input) {
    var name = (input.name || "").trim();
    if (!name) throw new Error("교사 이름을 입력해 주세요.");
    var record = {
      id: uuid(),
      name: name,
      role: TEACHER_ROLES[input.role] ? input.role : "teacher",
      isActive: true,
      departmentId: input.departmentId || null,
      phone: (input.phone || "").trim() || null,
      personalNote: (input.personalNote || "").trim() || null,
      createdAt: new Date().toISOString(),
    };
    var store = await tx("teachers", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listTeachers() {
    var store = await tx("teachers", "readonly");
    var rows = await reqToPromise(store.getAll());
    return (rows || []).sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
  }

  async function updateTeacher(id, patch) {
    if (!id) throw new Error("수정할 교사가 없습니다.");
    var store = await tx("teachers", "readwrite");
    var existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error("교사를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    if (patch.name != null) {
      var name = String(patch.name).trim();
      if (!name) throw new Error("교사 이름을 입력해 주세요.");
      existing.name = name;
    }
    if (patch.role != null) existing.role = TEACHER_ROLES[patch.role] ? patch.role : existing.role;
    if (patch.isActive != null) existing.isActive = !!patch.isActive;
    if (patch.departmentId !== undefined) existing.departmentId = patch.departmentId || null;
    if (patch.phone != null) existing.phone = String(patch.phone).trim() || null;
    if (patch.personalNote != null) existing.personalNote = String(patch.personalNote).trim() || null;
    existing.updatedAt = new Date().toISOString();
    await reqToPromise(store.put(existing));
    return existing;
  }

  // 교사 돌봄기록 — 안부/격려/기도/쉼상담 4종(클라우드 CARE_LABELS와 동일 어휘 유지).
  // "이번 주 출석 확인"도 이 로그의 특수 케이스(type=check_in, notes 고정문구)로
  // 표현한다 — 클라우드의 isTeacherAttendanceLog 판정을 그대로 재현.
  var TEACHER_CARE_KINDS = { check_in: "안부", encouragement: "격려", prayer: "기도", rest_offered: "쉼 상담" };
  var TEACHER_ATTENDANCE_NOTE = "교사 출석 확인";

  async function addTeacherCareLog(input) {
    if (!input.teacherId) throw new Error("교사를 먼저 선택해 주세요.");
    var text = (input.notes || "").trim();
    if (!text) throw new Error("내용을 입력해 주세요.");
    var record = {
      id: uuid(),
      teacherId: input.teacherId,
      type: TEACHER_CARE_KINDS[input.type] ? input.type : "check_in",
      notes: text,
      date: input.date || todayKst(),
      createdAt: new Date().toISOString(),
    };
    var store = await tx("teacherCareLogs", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listTeacherCareLogs(filter) {
    var store = await tx("teacherCareLogs", "readonly");
    var rows = await reqToPromise(store.getAll());
    rows = rows || [];
    if (filter && filter.teacherId) rows = rows.filter(function (r) { return r.teacherId === filter.teacherId; });
    return rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || "") < (b.createdAt || "") ? 1 : -1;
    });
  }

  async function deleteTeacherCareLog(id) {
    if (!id) throw new Error("삭제할 기록이 없습니다.");
    var store = await tx("teacherCareLogs", "readwrite");
    await reqToPromise(store.delete(id));
    return true;
  }

  function sundayStartKst(dateStr) {
    var base = dateStr || todayKst();
    var parts = base.split("-").map(function (n) { return parseInt(n, 10); });
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  }

  function isTeacherAttendanceLog(log) {
    return log.type === "check_in" && String(log.notes || "").indexOf(TEACHER_ATTENDANCE_NOTE) !== -1;
  }

  // 이번 주(일요일 시작, KST) 출석 확인이 이미 남아있는 교사ID 집합.
  async function weeklyTeacherAttendanceIds() {
    var logs = await listTeacherCareLogs();
    var weekStart = sundayStartKst(todayKst());
    var ids = new Set();
    logs.forEach(function (log) {
      if (isTeacherAttendanceLog(log) && log.date >= weekStart) ids.add(log.teacherId);
    });
    return ids;
  }

  // 토글 — 이번 주 확인이 없으면 추가, 있으면 그 기록(들)을 지워 해제한다.
  async function toggleTeacherWeeklyAttendance(teacherId) {
    var logs = await listTeacherCareLogs({ teacherId: teacherId });
    var weekStart = sundayStartKst(todayKst());
    var thisWeekLogs = logs.filter(function (log) { return isTeacherAttendanceLog(log) && log.date >= weekStart; });
    if (thisWeekLogs.length) {
      for (var i = 0; i < thisWeekLogs.length; i++) {
        await deleteTeacherCareLog(thisWeekLogs[i].id);
      }
      return { checked: false };
    }
    await addTeacherCareLog({ teacherId: teacherId, type: "check_in", notes: TEACHER_ATTENDANCE_NOTE });
    return { checked: true };
  }

  // ─── 출석 ──────────────────────────────────────────────────
  // 같은 학생·같은 날짜 중복 기록은 기존 행을 지우고 새로 씀(하루 1건 원칙).
  async function recordAttendance(input) {
    if (!input.studentId) throw new Error("학생을 선택해 주세요.");
    var date = input.date || todayKst();
    var store = await tx("attendance", "readwrite");
    var idx = store.index("by_student");
    var existing = await reqToPromise(idx.getAll(input.studentId));
    var dup = (existing || []).find(function (r) { return r.date === date; });
    if (dup) {
      await reqToPromise(store.delete(dup.id));
    }
    var record = {
      id: uuid(),
      studentId: input.studentId,
      date: date,
      status: input.status || "present",
      createdAt: new Date().toISOString(),
    };
    await reqToPromise(store.add(record));
    return record;
  }

  async function listAttendance(filter) {
    var store = await tx("attendance", "readonly");
    var rows = await reqToPromise(store.getAll());
    rows = rows || [];
    if (filter && filter.date) rows = rows.filter(function (r) { return r.date === filter.date; });
    if (filter && filter.studentId) rows = rows.filter(function (r) { return r.studentId === filter.studentId; });
    return rows;
  }

  // ─── 돌봄·기도 메모 ─────────────────────────────────────────
  // kind: "care"(돌봄) | "prayer"(기도제목). 학생 1명에 메모 여러 건(날짜별·자유).
  var NOTE_KINDS = { care: "돌봄", prayer: "기도제목" };

  function normalizeNoteKind(kind) {
    return NOTE_KINDS[kind] ? kind : "care";
  }

  async function addCareNote(input) {
    if (!input.studentId) throw new Error("학생을 선택해 주세요.");
    var text = (input.text || "").trim();
    if (!text) throw new Error("메모 내용을 입력해 주세요.");
    var now = new Date().toISOString();
    var record = {
      id: uuid(),
      studentId: input.studentId,
      date: input.date || todayKst(),
      kind: normalizeNoteKind(input.kind),
      text: text,
      createdAt: now,
      updatedAt: now,
    };
    var store = await tx("careNotes", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listCareNotes(filter) {
    var store = await tx("careNotes", "readonly");
    var rows = await reqToPromise(store.getAll());
    rows = rows || [];
    if (filter && filter.studentId) rows = rows.filter(function (r) { return r.studentId === filter.studentId; });
    // 최신 메모가 위로 — 날짜 내림차순, 같은 날짜면 작성 시각 내림차순.
    return rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || "") < (b.createdAt || "") ? 1 : -1;
    });
  }

  async function updateCareNote(id, patch) {
    if (!id) throw new Error("수정할 메모가 없습니다.");
    var store = await tx("careNotes", "readwrite");
    var existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error("메모를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    if (patch.text != null) {
      var text = String(patch.text).trim();
      if (!text) throw new Error("메모 내용을 입력해 주세요.");
      existing.text = text;
    }
    if (patch.kind != null) existing.kind = normalizeNoteKind(patch.kind);
    if (patch.date) existing.date = patch.date;
    existing.updatedAt = new Date().toISOString();
    await reqToPromise(store.put(existing));
    return existing;
  }

  async function deleteCareNote(id) {
    if (!id) throw new Error("삭제할 메모가 없습니다.");
    var store = await tx("careNotes", "readwrite");
    await reqToPromise(store.delete(id));
    return true;
  }

  // ─── 백업 export (§5: CSV 3종 = 보는 용 / versioned JSON = 되살리는 용) ──
  var SCHEMA_VERSION = 1;
  var CSV_BOM = "\uFEFF"; // 한글 엑셀 호환 — BOM 없으면 Excel이 CP949로 읽어 깨진다.

  // RFC 4180 escape: 쉼표·따옴표·개행이 있으면 따옴표로 감싸고 내부 따옴표는 두 번.
  // 앞이 = + - @ 로 시작하는 값은 엑셀이 수식으로 해석할 수 있어(CSV injection)
  // 앞에 공백 1칸을 붙인다 — 보는 용 CSV이므로 안전이 우선, 원문은 JSON 백업에 보존.
  function csvCell(v) {
    if (v == null) v = "";
    var str = String(v);
    if (/^[=+\-@]/.test(str)) str = " " + str;
    if (/[",\r\n]/.test(str)) str = '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  function csvText(header, rows) {
    var lines = [header.map(csvCell).join(",")];
    rows.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    return CSV_BOM + lines.join("\r\n") + "\r\n";
  }

  function fileStamp() {
    return todayKst().replace(/-/g, "");
  }

  async function studentsById() {
    var students = await listStudents();
    var map = {};
    students.forEach(function (s) { map[s.id] = s; });
    return { list: students, map: map };
  }

  var GUARDIAN_RELATION_LABEL = { father: "아버지", mother: "어머니", guardian: "보호자", other: "기타" };

  function guardiansCell(guardians) {
    return (guardians || [])
      .map(function (g) {
        var rel = GUARDIAN_RELATION_LABEL[g.relation] || g.relation || "";
        return [g.name, rel, g.phone].filter(Boolean).join("/");
      })
      .join("; ");
  }

  async function exportStudentsCsv() {
    var students = await listStudents();
    var maps = await departmentsAndClassesMaps();
    var rows = students.map(function (s) {
      var placement = resolveStudentPlacement(s, maps.deptMap, maps.classMap);
      var dept = [placement.department, placement.className].filter(Boolean).join(" · ");
      return [s.name, s.birthYear || "", dept, s.phone || "", s.address || "", guardiansCell(s.guardians), (s.createdAt || "").slice(0, 10), s.id];
    });
    return {
      filename: "이음스쿨_학생명부_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["이름", "생년", "부서·반", "연락처", "주소", "보호자(이름/관계/전화)", "등록일", "학생ID"], rows),
      count: rows.length,
    };
  }

  async function exportAttendanceCsv() {
    var sb = await studentsById();
    var maps = await departmentsAndClassesMaps();
    var rows = (await listAttendance()).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var an = (sb.map[a.studentId] || {}).name || "";
      var bn = (sb.map[b.studentId] || {}).name || "";
      return an.localeCompare(bn, "ko");
    }).map(function (r) {
      var s = sb.map[r.studentId] || {};
      var placement = s.id ? resolveStudentPlacement(s, maps.deptMap, maps.classMap) : { department: "", className: "" };
      var dept = [placement.department, placement.className].filter(Boolean).join(" · ");
      return [r.date, s.name || "(삭제된 학생)", dept, r.status === "present" ? "출석" : r.status, r.studentId];
    });
    return {
      filename: "이음스쿨_출결기록_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["날짜", "이름", "부서·반", "출결", "학생ID"], rows),
      count: rows.length,
    };
  }

  async function exportCareNotesCsv() {
    var sb = await studentsById();
    var maps = await departmentsAndClassesMaps();
    var rows = (await listCareNotes()).map(function (n) {
      var s = sb.map[n.studentId] || {};
      var placement = s.id ? resolveStudentPlacement(s, maps.deptMap, maps.classMap) : { department: "", className: "" };
      var dept = [placement.department, placement.className].filter(Boolean).join(" · ");
      return [n.date, s.name || "(삭제된 학생)", dept, NOTE_KINDS[n.kind] || n.kind, n.text, n.studentId];
    });
    return {
      filename: "이음스쿨_돌봄기도메모_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["날짜", "이름", "부서·반", "종류", "내용", "학생ID"], rows),
      count: rows.length,
    };
  }

  // versioned JSON — 안정 ID·관계(studentId)·schema_version·exported_at 포함(§5).
  // PIN 해시는 백업에 넣지 않는다(화면 잠금용일 뿐이라 복원 시 다시 설정하면 된다).
  async function exportJson() {
    var setup = await getSetup();
    var students = await listStudents();
    var attendance = await listAttendance();
    var careNotes = await listCareNotes();
    var departments = await listDepartments();
    var classes = await listClasses();
    var alertResolutions = await listAlertResolutions();
    var teachers = await listTeachers();
    var teacherCareLogs = await listTeacherCareLogs();
    var payload = {
      app: "eum-school-local",
      schema_version: SCHEMA_VERSION,
      db_version: DB_VERSION,
      exported_at: new Date().toISOString(),
      setup: setup ? {
        churchName: setup.churchName || "",
        userName: setup.userName || "",
        hasPin: !!setup.pinHash,
        createdAt: setup.createdAt || null,
      } : null,
      students: students,
      attendance: attendance,
      careNotes: careNotes,
      departments: departments,
      classes: classes,
      alertResolutions: alertResolutions,
      teachers: teachers,
      teacherCareLogs: teacherCareLogs,
    };
    return {
      filename: "이음스쿨_백업_" + fileStamp() + ".json",
      mime: "application/json;charset=utf-8",
      content: JSON.stringify(payload, null, 2),
      count: students.length + attendance.length + careNotes.length + departments.length + classes.length + teachers.length,
    };
  }

  window.EumLocalStorage = {
    isSupported: function () { return !!window.indexedDB; },
    isLocalMode: isLocalMode,
    setLocalMode: setLocalMode,
    todayKst: todayKst,
    saveSetup: saveSetup,
    getSetup: getSetup,
    addStudent: addStudent,
    bulkAddStudents: bulkAddStudents,
    listStudents: listStudents,
    updateStudentPlacement: updateStudentPlacement,
    updateStudentContact: updateStudentContact,
    recordAttendance: recordAttendance,
    listAttendance: listAttendance,
    noteKinds: NOTE_KINDS,
    addCareNote: addCareNote,
    listCareNotes: listCareNotes,
    updateCareNote: updateCareNote,
    deleteCareNote: deleteCareNote,
    addDepartment: addDepartment,
    listDepartments: listDepartments,
    addClass: addClass,
    listClasses: listClasses,
    resolveStudentPlacement: resolveStudentPlacement,
    departmentsAndClassesMaps: departmentsAndClassesMaps,
    computeAbsenceAlerts: computeAbsenceAlerts,
    resolveAbsenceAlert: resolveAbsenceAlert,
    listAlertResolutions: listAlertResolutions,
    teacherRoles: TEACHER_ROLES,
    addTeacher: addTeacher,
    listTeachers: listTeachers,
    updateTeacher: updateTeacher,
    teacherCareKinds: TEACHER_CARE_KINDS,
    addTeacherCareLog: addTeacherCareLog,
    listTeacherCareLogs: listTeacherCareLogs,
    deleteTeacherCareLog: deleteTeacherCareLog,
    weeklyTeacherAttendanceIds: weeklyTeacherAttendanceIds,
    toggleTeacherWeeklyAttendance: toggleTeacherWeeklyAttendance,
    guardianRelationLabel: GUARDIAN_RELATION_LABEL,
    exportStudentsCsv: exportStudentsCsv,
    exportAttendanceCsv: exportAttendanceCsv,
    exportCareNotesCsv: exportCareNotesCsv,
    exportJson: exportJson,
  };
})();
