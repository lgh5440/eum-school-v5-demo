/* ============================================================
   이음 스쿨 v5 — 데이터 액세스 레이어
   Supabase 호출을 도메인별로 묶어 화면 코드를 단순화.

   전제: supabase.js가 먼저 로드됨 (window.Eum.sb 사용)
   ============================================================ */
(function () {
  "use strict";

  if (!window.Eum || !window.Eum.sb) {
    console.error("[Data] supabase.js가 먼저 로드돼야 합니다.");
    return;
  }
  var sb = window.Eum.sb;

  // ─── 표준 부서 프리셋 ────────────────────────────
  var PRESETS = [
    { key: "infant",     name: "영아부", sortOrder: 10 },
    { key: "toddler",    name: "유아부", sortOrder: 20 },
    { key: "kinder",     name: "유치부", sortOrder: 30 },
    { key: "young",      name: "유년부", sortOrder: 40 },
    { key: "elementary", name: "초등부", sortOrder: 50 },
    { key: "boys",       name: "소년부", sortOrder: 60 },
    { key: "middle",     name: "중등부", sortOrder: 70 },
    { key: "high",       name: "고등부", sortOrder: 80 }
  ];

  // ─── 부서 ─────────────────────────────────────────
  var Departments = {
    async list(includeInactive) {
      var r = await sb.from("departments")
        .select("*")
        .order("sort_order", { ascending: true });
      if (r.error) throw r.error;
      return includeInactive ? r.data : r.data.filter(function (d) { return d.is_active; });
    },
    async create(churchId, payload) {
      var r = await sb.from("departments").insert({
        church_id:  churchId,
        name:       payload.name,
        preset_key: payload.presetKey || null,
        is_active:  payload.isActive !== false,
        sort_order: payload.sortOrder || 0
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async update(id, patch) {
      var data = {};
      if (patch.name       !== undefined) data.name       = patch.name;
      if (patch.isActive   !== undefined) data.is_active  = patch.isActive;
      if (patch.sortOrder  !== undefined) data.sort_order = patch.sortOrder;
      if (patch.presetKey  !== undefined) data.preset_key = patch.presetKey;
      var r = await sb.from("departments").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
  };

  // ─── 반 ───────────────────────────────────────────
  var Classes = {
    async list(includeInactive) {
      var r = await sb.from("classes")
        .select("*")
        .order("sort_order", { ascending: true });
      if (r.error) throw r.error;
      return includeInactive ? r.data : r.data.filter(function (c) { return c.is_active; });
    },
    async create(churchId, deptId, payload) {
      var r = await sb.from("classes").insert({
        church_id:     churchId,
        department_id: deptId,
        name:          payload.name,
        is_active:     payload.isActive !== false,
        sort_order:    payload.sortOrder || 0
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async update(id, patch) {
      var data = {};
      if (patch.name      !== undefined) data.name       = patch.name;
      if (patch.isActive  !== undefined) data.is_active  = patch.isActive;
      if (patch.sortOrder !== undefined) data.sort_order = patch.sortOrder;
      var r = await sb.from("classes").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    // 반별 학생 수 — 활성 학생만
    async studentCountsBy(classIds) {
      if (!classIds || !classIds.length) return {};
      var r = await sb.from("students")
        .select("class_id")
        .eq("is_active", true)
        .in("class_id", classIds);
      if (r.error) return {};
      var map = {};
      r.data.forEach(function (s) {
        map[s.class_id] = (map[s.class_id] || 0) + 1;
      });
      return map;
    }
  };

  // ─── 교사 ─────────────────────────────────────────
  // 화면 표기 키마: { id, name, phone, email, roles[], isActive, departmentIds[], classIds[] }
  // DB 컬럼:        { id, name, phone, email, roles[], is_active, (join 테이블) }
  var Teachers = {
    // 같은 교회 모든 교사 + 부서·반 배정 한 번에
    async listAll(includeInactive) {
      var r = await sb.from("teachers")
        .select("id, user_id, church_id, name, phone, email, roles, is_active, created_at")
        .order("created_at", { ascending: true });
      if (r.error) throw r.error;

      var teachers = (r.data || []).filter(function (t) {
        return includeInactive || t.is_active;
      });
      if (!teachers.length) return [];

      var ids = teachers.map(function (t) { return t.id; });

      // 부서·반 배정 한 번에
      var deptR = await sb.from("teacher_departments")
        .select("teacher_id, department_id").in("teacher_id", ids);
      if (deptR.error) throw deptR.error;
      var classR = await sb.from("teacher_classes")
        .select("teacher_id, class_id").in("teacher_id", ids);
      if (classR.error) throw classR.error;

      var deptMap = {}, classMap = {};
      (deptR.data || []).forEach(function (x) {
        (deptMap[x.teacher_id] = deptMap[x.teacher_id] || []).push(x.department_id);
      });
      (classR.data || []).forEach(function (x) {
        (classMap[x.teacher_id] = classMap[x.teacher_id] || []).push(x.class_id);
      });

      return teachers.map(function (t) {
        return {
          id: t.id,
          userId: t.user_id,
          name: t.name,
          phone: t.phone,
          email: t.email || "",
          roles: t.roles || [],
          isActive: t.is_active,
          departmentIds: deptMap[t.id] || [],
          classIds: classMap[t.id] || []
        };
      });
    },

    async create(churchId, payload) {
      var phone = window.Eum.normalizePhone(payload.phone || "");
      if (!payload.name || !payload.name.trim()) {
        throw new Error("이름을 입력해 주세요.");
      }
      if (!phone) {
        throw new Error("전화번호를 입력해 주세요. (로그인 ID로 사용됩니다)");
      }
      var roles = (payload.roles && payload.roles.length) ? payload.roles : ["operator"];
      var r = await sb.from("teachers").insert({
        church_id: churchId,
        name:      payload.name.trim(),
        phone:     phone,
        email:     (payload.email || "").trim() || null,
        roles:     roles,
        is_active: payload.isActive !== false
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },

    async update(id, patch) {
      var data = {};
      if (patch.name      !== undefined) data.name       = patch.name;
      if (patch.phone     !== undefined) data.phone      = window.Eum.normalizePhone(patch.phone);
      if (patch.email     !== undefined) data.email      = patch.email || null;
      if (patch.roles     !== undefined) data.roles      = patch.roles;
      if (patch.isActive  !== undefined) data.is_active  = patch.isActive;
      var r = await sb.from("teachers").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
  };

  // ─── 교사–부서 배정 (diff 동기화) ─────────────────
  var TeacherDepartments = {
    async list(teacherId) {
      var r = await sb.from("teacher_departments")
        .select("department_id").eq("teacher_id", teacherId);
      if (r.error) throw r.error;
      return (r.data || []).map(function (x) { return x.department_id; });
    },
    // 현재 배정과 desired 비교해 차이만 insert/delete
    async sync(teacherId, desiredDeptIds) {
      var current = await TeacherDepartments.list(teacherId);
      var toAdd = desiredDeptIds.filter(function (id) { return current.indexOf(id) < 0; });
      var toDel = current.filter(function (id) { return desiredDeptIds.indexOf(id) < 0; });

      if (toAdd.length) {
        var rows = toAdd.map(function (did) {
          return { teacher_id: teacherId, department_id: did };
        });
        var ri = await sb.from("teacher_departments").insert(rows);
        if (ri.error) throw ri.error;
      }
      if (toDel.length) {
        var rd = await sb.from("teacher_departments")
          .delete().eq("teacher_id", teacherId).in("department_id", toDel);
        if (rd.error) throw rd.error;
      }
    }
  };

  // ─── 교사–반 배정 (diff 동기화) ───────────────────
  var TeacherClasses = {
    async list(teacherId) {
      var r = await sb.from("teacher_classes")
        .select("class_id").eq("teacher_id", teacherId);
      if (r.error) throw r.error;
      return (r.data || []).map(function (x) { return x.class_id; });
    },
    async sync(teacherId, desiredClassIds) {
      var current = await TeacherClasses.list(teacherId);
      var toAdd = desiredClassIds.filter(function (id) { return current.indexOf(id) < 0; });
      var toDel = current.filter(function (id) { return desiredClassIds.indexOf(id) < 0; });

      if (toAdd.length) {
        var rows = toAdd.map(function (cid) {
          return { teacher_id: teacherId, class_id: cid };
        });
        var ri = await sb.from("teacher_classes").insert(rows);
        if (ri.error) throw ri.error;
      }
      if (toDel.length) {
        var rd = await sb.from("teacher_classes")
          .delete().eq("teacher_id", teacherId).in("class_id", toDel);
        if (rd.error) throw rd.error;
      }
    }
  };

  // ─── 학생 + 가족 + 보호자 ─────────────────────────
  // 화면 카멜키마: { id, name, grade, gender, birthYear, departmentId, classId,
  //                familyId, isActive, tags[], enrolledAt,
  //                parent: { id, name, phone, relation } }  ← 대표 보호자 1명
  // DB 컬럼:      students.* + families.* + family_parents.*
  var Students = {
    // 같은 교회 학생 + 보호자 첫 1명 조립
    async listAll(includeInactive) {
      var sR = await sb.from("students")
        .select("id, church_id, department_id, class_id, family_id, name, grade, birth_year, gender, tags, enrolled_at, is_active, created_at")
        .order("name", { ascending: true });
      if (sR.error) throw sR.error;

      var students = (sR.data || []).filter(function (s) {
        return includeInactive || s.is_active;
      });
      if (!students.length) return [];

      // 가족별 보호자 묶기 — students.family_id IS NULL이면 건너뜀
      var famIds = students.map(function (s) { return s.family_id; }).filter(Boolean);
      var parentMap = {};
      if (famIds.length) {
        var pR = await sb.from("family_parents")
          .select("id, family_id, name, phone, relation")
          .in("family_id", famIds);
        if (pR.error) throw pR.error;
        (pR.data || []).forEach(function (p) {
          if (!parentMap[p.family_id]) parentMap[p.family_id] = [];
          parentMap[p.family_id].push(p);
        });
      }

      return students.map(function (s) {
        var parents = (s.family_id && parentMap[s.family_id]) || [];
        var primary = parents[0] || null;
        return {
          id:            s.id,
          name:          s.name,
          grade:         s.grade || "",
          gender:        s.gender || "",
          birthYear:     s.birth_year,
          departmentId:  s.department_id,
          classId:       s.class_id,
          familyId:      s.family_id,
          isActive:      s.is_active,
          tags:          s.tags || [],
          enrolledAt:    s.enrolled_at,
          parents:       parents.map(function (p) {
            return { id: p.id, name: p.name, phone: p.phone || "", relation: p.relation || "" };
          }),
          parent:        primary ? { id: primary.id, name: primary.name, phone: primary.phone || "", relation: primary.relation || "" } : null
        };
      });
    },

    // 학생 + 가족 + 보호자(1명) 한 번에 등록
    async create(churchId, payload) {
      var name = (payload.name || "").trim();
      if (!name) throw new Error("학생 이름을 입력해 주세요.");

      var familyId = null;
      // 1) 가족 만들기 (보호자 입력이 있을 때만 — 없으면 family_id NULL)
      if ((payload.parentName && payload.parentName.trim()) || (payload.parentPhone && payload.parentPhone.trim())) {
        var fR = await sb.from("families").insert({ church_id: churchId }).select().single();
        if (fR.error) throw fR.error;
        familyId = fR.data.id;

        var pName = (payload.parentName || "보호자").trim();
        var pPhone = payload.parentPhone ? window.Eum.normalizePhone(payload.parentPhone) : null;
        var pR2 = await sb.from("family_parents").insert({
          family_id: familyId,
          name:      pName,
          phone:     pPhone,
          relation:  (payload.parentRelation || "").trim() || null
        }).select().single();
        if (pR2.error) throw pR2.error;
      }

      // 2) 학생 insert
      var sR = await sb.from("students").insert({
        church_id:     churchId,
        department_id: payload.departmentId || null,
        class_id:      payload.classId || null,
        family_id:     familyId,
        name:          name,
        grade:         (payload.grade || "").trim() || null,
        birth_year:    payload.birthYear || null,
        gender:        (payload.gender || "").trim() || null,
        tags:          payload.tags || [],
        is_active:     payload.isActive !== false
      }).select().single();
      if (sR.error) throw sR.error;
      return sR.data;
    },

    async update(id, patch) {
      var data = {};
      if (patch.name         !== undefined) data.name          = patch.name;
      if (patch.grade        !== undefined) data.grade         = patch.grade || null;
      if (patch.birthYear    !== undefined) data.birth_year    = patch.birthYear || null;
      if (patch.gender       !== undefined) data.gender        = patch.gender || null;
      if (patch.departmentId !== undefined) data.department_id = patch.departmentId || null;
      if (patch.classId      !== undefined) data.class_id      = patch.classId || null;
      if (patch.familyId     !== undefined) data.family_id     = patch.familyId || null;
      if (patch.tags         !== undefined) data.tags          = patch.tags;
      if (patch.isActive     !== undefined) data.is_active     = patch.isActive;
      // 빈 patch는 호출 의미가 없으므로 차단 — PostgREST 400 방지
      if (!Object.keys(data).length) return null;
      var r = await sb.from("students").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
  };

  // ─── 가족 / 보호자 (직접 편집용) ─────────────────
  var Families = {
    async create(churchId) {
      var r = await sb.from("families").insert({ church_id: churchId }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
  };

  var FamilyParents = {
    async listByFamily(familyId) {
      var r = await sb.from("family_parents")
        .select("id, family_id, name, phone, relation")
        .eq("family_id", familyId)
        .order("id", { ascending: true });
      if (r.error) throw r.error;
      return (r.data || []).map(function (p) {
        return { id: p.id, familyId: p.family_id, name: p.name, phone: p.phone || "", relation: p.relation || "" };
      });
    },
    async create(familyId, payload) {
      if (!payload.name || !payload.name.trim()) throw new Error("보호자 이름을 입력해 주세요.");
      var r = await sb.from("family_parents").insert({
        family_id: familyId,
        name:      payload.name.trim(),
        phone:     payload.phone ? window.Eum.normalizePhone(payload.phone) : null,
        relation:  (payload.relation || "").trim() || null
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async update(id, patch) {
      var data = {};
      if (patch.name     !== undefined) data.name     = patch.name;
      if (patch.phone    !== undefined) data.phone    = patch.phone ? window.Eum.normalizePhone(patch.phone) : null;
      if (patch.relation !== undefined) data.relation = patch.relation || null;
      var r = await sb.from("family_parents").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async remove(id) {
      var r = await sb.from("family_parents").delete().eq("id", id);
      if (r.error) throw r.error;
    }
  };

  // ─── 출석·결석 등 이벤트 ──────────────────────────
  // type: 'attend' | 'online' | 'absent' | 'visit' | 'note'
  var Events = {
    // 특정 날짜 + (옵션) 부서/반의 학생 출석 이벤트
    async listByDate(yyyymmdd, opts) {
      opts = opts || {};
      var start = yyyymmdd + "T00:00:00";
      var end   = yyyymmdd + "T23:59:59.999";
      var q = sb.from("student_events")
        .select("id, student_id, type, occurred_at, recorded_by, notes")
        .gte("occurred_at", start)
        .lte("occurred_at", end)
        .in("type", opts.types || ["attend", "online", "absent"]);
      if (opts.studentIds && opts.studentIds.length) q = q.in("student_id", opts.studentIds);
      var r = await q;
      if (r.error) throw r.error;
      return r.data || [];
    },

    // 그 날짜·그 학생들의 attend/online/absent 이벤트를 통째로 교체
    // statesMap: { [studentId]: 'attend' | 'online' | 'absent' | null }
    async saveDayAttendance(churchId, yyyymmdd, statesMap, recordedByUserId) {
      var studentIds = Object.keys(statesMap);
      if (!studentIds.length) return { inserted: 0, deleted: 0 };

      var start = yyyymmdd + "T00:00:00";
      var end   = yyyymmdd + "T23:59:59.999";

      // 1) 그 날짜·그 학생들의 attend/online/absent 모두 삭제
      var del = await sb.from("student_events")
        .delete()
        .gte("occurred_at", start)
        .lte("occurred_at", end)
        .in("type", ["attend", "online", "absent"])
        .in("student_id", studentIds);
      if (del.error) throw del.error;

      // 2) null 아닌 항목만 insert
      var rows = [];
      var occurredAt = yyyymmdd + "T10:00:00+09:00"; // KST 주일 오전 10시 가정
      studentIds.forEach(function (sid) {
        var st = statesMap[sid];
        if (st === "attend" || st === "online" || st === "absent") {
          rows.push({
            church_id:   churchId,
            student_id:  sid,
            type:        st,
            occurred_at: occurredAt,
            recorded_by: recordedByUserId || null
          });
        }
      });
      if (!rows.length) return { inserted: 0, deleted: 1 };

      var ins = await sb.from("student_events").insert(rows);
      if (ins.error) throw ins.error;
      return { inserted: rows.length, deleted: 1 };
    },

    // 최근 N주(주일) 출석 — 학생 ID들 기준
    // 반환: { [studentId]: { [yyyymmdd]: 'attend'|'online'|'absent' } }
    async recentWeeksByStudent(studentIds, weekCount) {
      if (!studentIds.length) return {};
      var n = weekCount || 8;
      // 최근 n주 일요일들 계산
      var weeks = [];
      var d = new Date();
      var dow = d.getDay();
      var lastSun = new Date(d);
      lastSun.setDate(d.getDate() - dow); // 이번 주 일요일
      for (var i = 0; i < n; i++) {
        var s = new Date(lastSun);
        s.setDate(lastSun.getDate() - i * 7);
        weeks.push(s.toISOString().slice(0, 10));
      }
      var earliest = weeks[weeks.length - 1] + "T00:00:00";
      var latest   = weeks[0] + "T23:59:59.999";

      var r = await sb.from("student_events")
        .select("student_id, type, occurred_at")
        .in("student_id", studentIds)
        .in("type", ["attend", "online", "absent"])
        .gte("occurred_at", earliest)
        .lte("occurred_at", latest);
      if (r.error) throw r.error;

      var map = {};
      (r.data || []).forEach(function (ev) {
        var date = String(ev.occurred_at).slice(0, 10);
        if (!map[ev.student_id]) map[ev.student_id] = {};
        // 같은 날짜 중복 시 가장 강한 신호 우선: attend > online > absent
        var prev = map[ev.student_id][date];
        var rank = { attend: 3, online: 2, absent: 1 };
        if (!prev || (rank[ev.type] || 0) > (rank[prev] || 0)) {
          map[ev.student_id][date] = ev.type;
        }
      });
      return { weeks: weeks, byStudent: map };
    },

    // 학생별 마지막 attend 일자 — 결석 계산용
    async lastAttendByStudent(studentIds) {
      if (!studentIds.length) return {};
      var r = await sb.from("student_events")
        .select("student_id, occurred_at")
        .in("student_id", studentIds)
        .eq("type", "attend")
        .order("occurred_at", { ascending: false });
      if (r.error) throw r.error;
      var map = {};
      (r.data || []).forEach(function (ev) {
        // 학생별 첫 번째(최신)만 유지
        if (!map[ev.student_id]) map[ev.student_id] = ev.occurred_at;
      });
      return map;
    }
  };

  // ─── 기도제목 ─────────────────────────────────────
  var Prayers = {
    async list(opts) {
      opts = opts || {};
      var q = sb.from("prayers")
        .select("id, subject_type, who, body, is_anonymous, occurred_on, recorded_by, created_at")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (opts.subjectType) q = q.eq("subject_type", opts.subjectType);
      var r = await q;
      if (r.error) throw r.error;
      return (r.data || []).map(function (p) {
        return {
          id: p.id,
          subjectType: p.subject_type,
          who: p.who,
          body: p.body,
          isAnonymous: p.is_anonymous,
          occurredOn: p.occurred_on,
          recordedBy: p.recorded_by
        };
      });
    },
    async create(churchId, payload, userId) {
      if (!payload.who || !payload.who.trim()) throw new Error("대상 이름을 입력해 주세요.");
      if (!payload.body || !payload.body.trim()) throw new Error("기도제목 내용을 입력해 주세요.");
      var r = await sb.from("prayers").insert({
        church_id:    churchId,
        subject_type: payload.subjectType || "student",
        who:          payload.who.trim(),
        body:         payload.body.trim(),
        is_anonymous: !!payload.isAnonymous,
        occurred_on:  payload.occurredOn || new Date().toISOString().slice(0, 10),
        recorded_by:  userId || null
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async remove(id) {
      var r = await sb.from("prayers").delete().eq("id", id);
      if (r.error) throw r.error;
    }
  };

  // ─── 심방·돌봄 메모 ────────────────────────────────
  var CareLogs = {
    async list(opts) {
      opts = opts || {};
      var q = sb.from("care_logs")
        .select("id, student_id, teacher_id, notes, occurred_on, contacted, created_at")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (opts.studentId) q = q.eq("student_id", opts.studentId);
      if (opts.limit) q = q.limit(opts.limit);
      var r = await q;
      if (r.error) throw r.error;
      return (r.data || []).map(function (c) {
        return {
          id: c.id,
          studentId: c.student_id,
          teacherId: c.teacher_id,
          notes: c.notes,
          occurredOn: c.occurred_on,
          contacted: c.contacted
        };
      });
    },
    async create(churchId, payload) {
      if (!payload.notes || !payload.notes.trim()) throw new Error("메모 내용을 입력해 주세요.");
      var r = await sb.from("care_logs").insert({
        church_id:   churchId,
        student_id:  payload.studentId || null,
        teacher_id:  payload.teacherId || null,
        notes:       payload.notes.trim(),
        occurred_on: payload.occurredOn || new Date().toISOString().slice(0, 10),
        contacted:   !!payload.contacted
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async update(id, patch) {
      var data = {};
      if (patch.notes      !== undefined) data.notes       = patch.notes;
      if (patch.contacted  !== undefined) data.contacted   = patch.contacted;
      if (patch.occurredOn !== undefined) data.occurred_on = patch.occurredOn;
      if (!Object.keys(data).length) return null;
      var r = await sb.from("care_logs").update(data).eq("id", id).select().single();
      if (r.error) throw r.error;
      return r.data;
    },
    async remove(id) {
      var r = await sb.from("care_logs").delete().eq("id", id);
      if (r.error) throw r.error;
    }
  };

  // ─── Toast (간이 알림) ────────────────────────────
  function toast(msg, type) {
    var el = document.getElementById("eum-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "eum-toast";
      el.style.cssText = "position:fixed; left:50%; bottom:80px; transform:translateX(-50%);" +
        "background:#162338; color:#F1F5F9; padding:10px 16px; border-radius:10px;" +
        "border:1px solid #2A3A55; font-size:0.85rem; z-index:100;" +
        "box-shadow:0 4px 16px rgba(0,0,0,0.3); max-width: 80vw; text-align:center;" +
        "opacity:0; transition: opacity .2s;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    if (type === "err") {
      el.style.borderColor = "#F87171"; el.style.color = "#F87171";
    } else if (type === "ok") {
      el.style.borderColor = "#4ADE80"; el.style.color = "#4ADE80";
    } else {
      el.style.borderColor = "#2A3A55"; el.style.color = "#F1F5F9";
    }
    el.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.style.opacity = "0"; }, 2200);
  }

  window.Data = {
    presets: PRESETS,
    departments: Departments,
    classes: Classes,
    teachers: Teachers,
    teacherDepartments: TeacherDepartments,
    teacherClasses: TeacherClasses,
    students: Students,
    families: Families,
    familyParents: FamilyParents,
    events: Events,
    prayers: Prayers,
    careLogs: CareLogs,
    toast: toast
  };
})();
