// Admin/courses.js
import { log } from "console";
import { query } from "../db.js";

// GET /admin/courses
// ดึงรายวิชาทั้งหมด + ชื่ออาจารย์
export const courses_index = async (req, res) => {
  try {
    const r = await query(
      `
      SELECT
        c.course_id,
        c.course_name,
        c.instructor_id,
        u.full_name  AS instructor_name,
        u.email      AS instructor_email
      FROM courses c
      LEFT JOIN users u ON c.instructor_id = u.user_id
      ORDER BY c.course_id ASC
      `
    );

    res.status(200).json({
      message: "success",
      data: r.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /admin/courses/:course_id
// รายละเอียดวิชา + รายชื่อนักศึกษาที่ลงทะเบียนวิชานั้น
export const courses_show = async (req, res) => {
  const { course_id } = req.params;

  try {
    const courseRes = await query(
      `
      SELECT
        c.course_id,
        c.course_name,
        c.instructor_id,
        u.full_name AS instructor_name,
        u.email     AS instructor_email
      FROM courses c
      LEFT JOIN users u ON c.instructor_id = u.user_id
      WHERE c.course_id = $1
      `,
      [course_id]
    );

    if (courseRes.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const studentsRes = await query(
      `
      SELECT
        e.student_id,
        u.full_name,
        u.email
      FROM enrollments e
      JOIN users u ON e.student_id = u.user_id
      WHERE e.course_id = $1
      ORDER BY u.full_name ASC
      `,
      [course_id]
    );

    res.status(200).json({
      message: "success",
      data: {
        course: courseRes.rows[0],
        students: studentsRes.rows,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /admin/courses
// เพิ่มวิชา 1 วิชา จากหน้า AddCourse
// body: { course_name, instructor_id }
export const courses_store = async (req, res) => {
  const { course_id, course_name, instructor_id } = req.body || {};

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!course_id || !course_name || !instructor_id) {
    return res.status(400).json({
      message: "course_id, course_name และ instructor_id จำเป็นต้องกรอก",
    });
  }

  try {
    // ตรวจสอบรายวิชาซ้ำ
    const exist = await query(
      `SELECT course_id FROM courses WHERE LOWER(course_id) = LOWER($1)`,
      [course_id.trim()]
    );

    if (exist.rows.length > 0) {
      return res.status(409).json({
        message: "รหัสวิชานี้มีอยู่แล้วในระบบ",
      });
    }

    // ตรวจสอบว่า instructor มีจริงไหม
    const instructorCheck = await query(
      `SELECT user_id FROM users WHERE user_id = $1 AND role_id = 2`,
      [instructor_id.trim()]
    );

    if (instructorCheck.rows.length === 0) {
      return res.status(400).json({
        message: "ไม่พบอาจารย์ผู้สอน หรือ user นี้ไม่ใช่อาจารย์",
      });
    }

    // INSERT
    const result = await query(
      `
      INSERT INTO courses (course_id, course_name, instructor_id)
      VALUES ($1, $2, $3)
      RETURNING course_id, course_name, instructor_id
      `,
      [course_id.trim(), course_name.trim(), instructor_id.trim()]
    );

    return res.status(201).json({
      message: "success",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("CREATE COURSE ERROR:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};


// POST /admin/courses/bulk
// เพิ่มหลายวิชาจาก CSV ผ่าน frontend
// body: { courses: [{ course_name, instructor_id }, ...] }
export const courses_bulk_store = async (req, res) => {
  const { courses } = req.body || {};

  if (!Array.isArray(courses)) {
    return res.status(400).json({
      message: "courses ต้องเป็น array ของวิชา"
    });
  }

  const inserted = [];
  const skipped = [];

  for (const c of courses) {
    const course_id = String(c.course_id || "").trim();
    const course_name = String(c.course_name || "").trim();

    // ⛔ ไม่มีข้อมูล -> ข้าม
    if (!course_id || !course_name) {
      skipped.push({ ...c, reason: "INVALID_DATA" });
      continue;
    }

    try {
      // ตรวจว่ามีอยู่แล้ว
      const dupCheck = await query(
        "SELECT 1 FROM courses WHERE LOWER(course_id) = LOWER($1) LIMIT 1",
        [course_id]
      );

      if (dupCheck.rows.length > 0) {
        skipped.push({ ...c, reason: "DUPLICATE" });
        continue;
      }

      // INSERT
      const r = await query(
        `
        INSERT INTO courses (course_id, course_name)
        VALUES ($1, $2)
        RETURNING course_id, course_name
        `,
        [course_id, course_name]
      );

      inserted.push(r.rows[0]);
    } catch (e) {
      console.error("bulk insert error:", e);
      skipped.push({ ...c, reason: "ERROR" });
    }
  }

  return res.status(200).json({
    message: "success",
    inserted,
    skipped,
  });
};


export const courses_delete = async (req, res) => {
  const { id } = req.params;


  try {
    // ตรวจสอบว่ารหัสวิชามีอยู่จริงไหม
    const check = await query("SELECT * FROM courses WHERE course_id = $1", [id]);

    if (check.rows.length === 0) {
      return res.status(404).json({
        message: "ไม่พบรายวิชานี้ในระบบ",
      });
    }

    // ลบวิชา
    await query("DELETE FROM courses WHERE course_id = $1", [id]);

    res.status(200).json({
      message: "ลบรายวิชาสำเร็จ",
      course_id: id,
    });
  } catch (error) {
    console.error("DELETE /courses error:", error);
    res.status(500).json({
      message: "เกิดข้อผิดพลาดในระบบ",
    });
  }
};



export const course_update = async (req, res) => {
  try {
    const course_id = req.params.id;
    const { course_name , instructor_id } = req.body;
    
    
    if (!course_name) {
      return res.status(400).json({ message: "กรุณากรอกชื่อวิชา" });
    }

    // ตรวจสอบว่ามีวิชานี้อยู่หรือไม่
    const check = await query("SELECT * FROM courses WHERE course_id = $1", [course_id]);

    if (check.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบรายวิชานี้" });
    }

    // อัปเดตข้อมูล
    await query(
      `
      UPDATE courses 
      SET course_name = $1 ,
      instructor_id = $2
      WHERE course_id = $3
      `,
      [course_name,instructor_id, course_id]
    );

    res.status(200).json({ message: "อัปเดตรายวิชาสำเร็จ" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getInstructor = async (req, res) => {
  try {
    const sql = `
      SELECT user_id, full_name, email 
      FROM users 
      WHERE role_id = 2  -- 2 = อาจารย์ (เปลี่ยนตามระบบของคุณ)
      ORDER BY full_name ASC
    `;

    const result = await query(sql);

    res.status(200).json({
      message: "ดึงรายชื่ออาจารย์สำเร็จ",
      data: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

