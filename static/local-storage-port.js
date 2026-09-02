/* ============================================================
   E:UM Local Storage Port — 로컬 우선(local-first) 무료 티어용
   (docs/로컬우선_온보딩_설계_2026-09-02.md §4 StoragePort 설계의
   로컬(IndexedDB) 어댑터 구현 — 2026-09-02 1차: 학생명부·출석 /
   2026-09-02 2차: 돌봄·기도 메모 + CSV·JSON 백업(export))

   범위: students(학생명부) · attendance(출석) · careNotes(돌봄·기도 메모) ·
   setup(최초 설정값) · export(CSV 3종 + versioned JSON — §5 설계 그대로)
   범위 밖(미구현): import(JSON 복원) · 협업 모드 마이그레이션(§9). 실제로 안 쓰는
   코드를 미리 만들지 않는다.

   설계 원칙(§4 인용): "localStorage는 mode/version/onboarding/UI 설정과
   migration marker만 보관하고 PII는 저장하지 않는다" — 그래서 학생 이름 등
   실제 개인정보는 전부 IndexedDB에만 쓰고, localStorage에는
   eum_school_mode 같은 플래그만 남긴다.
   ============================================================ */
(function () {
  "use strict";

  var DB_NAME = "eum_school_local_v1";
  // v1: meta·students·attendance / v2(2026-09-02): + careNotes
  var DB_VERSION = 2;
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
  async function addStudent(input) {
    var name = (input.name || "").trim();
    if (!name) throw new Error("학생 이름을 입력해 주세요.");
    var record = {
      id: uuid(),
      name: name,
      department: (input.department || "").trim() || null,
      createdAt: new Date().toISOString(),
    };
    var store = await tx("students", "readwrite");
    await reqToPromise(store.add(record));
    return record;
  }

  async function listStudents() {
    var store = await tx("students", "readonly");
    var rows = await reqToPromise(store.getAll());
    return (rows || []).sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
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

  async function exportStudentsCsv() {
    var students = await listStudents();
    var rows = students.map(function (s) {
      return [s.name, s.department || "", (s.createdAt || "").slice(0, 10), s.id];
    });
    return {
      filename: "이음스쿨_학생명부_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["이름", "부서", "등록일", "학생ID"], rows),
      count: rows.length,
    };
  }

  async function exportAttendanceCsv() {
    var sb = await studentsById();
    var rows = (await listAttendance()).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var an = (sb.map[a.studentId] || {}).name || "";
      var bn = (sb.map[b.studentId] || {}).name || "";
      return an.localeCompare(bn, "ko");
    }).map(function (r) {
      var s = sb.map[r.studentId] || {};
      return [r.date, s.name || "(삭제된 학생)", s.department || "", r.status === "present" ? "출석" : r.status, r.studentId];
    });
    return {
      filename: "이음스쿨_출결기록_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["날짜", "이름", "부서", "출결", "학생ID"], rows),
      count: rows.length,
    };
  }

  async function exportCareNotesCsv() {
    var sb = await studentsById();
    var rows = (await listCareNotes()).map(function (n) {
      var s = sb.map[n.studentId] || {};
      return [n.date, s.name || "(삭제된 학생)", s.department || "", NOTE_KINDS[n.kind] || n.kind, n.text, n.studentId];
    });
    return {
      filename: "이음스쿨_돌봄기도메모_" + fileStamp() + ".csv",
      mime: "text/csv;charset=utf-8",
      content: csvText(["날짜", "이름", "부서", "종류", "내용", "학생ID"], rows),
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
    };
    return {
      filename: "이음스쿨_백업_" + fileStamp() + ".json",
      mime: "application/json;charset=utf-8",
      content: JSON.stringify(payload, null, 2),
      count: students.length + attendance.length + careNotes.length,
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
    listStudents: listStudents,
    recordAttendance: recordAttendance,
    listAttendance: listAttendance,
    noteKinds: NOTE_KINDS,
    addCareNote: addCareNote,
    listCareNotes: listCareNotes,
    updateCareNote: updateCareNote,
    deleteCareNote: deleteCareNote,
    exportStudentsCsv: exportStudentsCsv,
    exportAttendanceCsv: exportAttendanceCsv,
    exportCareNotesCsv: exportCareNotesCsv,
    exportJson: exportJson,
  };
})();
