
import { query } from "../db.js";
export const getInstructorClassrooms = async (req, res) => {
  try {
    const instructor_id = req.user.user_id;

    const sql = `
      SELECT 
        cl.classroom_id,
        c.course_id AS code,
        c.course_name AS name,
        cl.year,
        cl.semester,
        cl.section
      FROM classrooms cl
      INNER JOIN courses c 
          ON c.course_id = cl.course_id
      WHERE cl.instructor_id = $1
      ORDER BY cl.year DESC, cl.semester DESC, c.course_id ASC
    `;

    const result = await query(sql, [instructor_id]);

    return res.status(200).json({
      message: "success",
      data: result.rows,
    });

  } catch (err) {
    console.error("getInstructorClassrooms error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const getStd = async (req, res) => {
  try {
    const instructorId = req.user.user_id; // ได้จาก token
    const classroomId = req.params.id;

    // 1) ตรวจสอบสิทธิ์ก่อน
    const check = await pool.query(
      `SELECT classroom_id FROM classroom 
       WHERE classroom_id = $1 AND instructor_id = $2`,
      [classroomId, instructorId]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({
        status: false,
        message: "คุณไม่มีสิทธิ์เข้าถึงชั้นเรียนนี้",
      });
    }

    // 2) ดึงรายชื่อจริง
    const result = await pool.query(
      `SELECT 
          s.student_id,
          s.first_name,
          s.last_name
       FROM classroom_student cs
       JOIN student s ON s.student_id = cs.student_id
       WHERE cs.classroom_id = $1
       ORDER BY s.student_id`,
      [classroomId]
    );

    return res.json({
      status: true,
      data: result.rows,
    });

  } catch (err) {
    console.error("get students error:", err);
    res.status(500).json({ status: false, message: "Server Error" });
  }
}

export const search_students = async (req, res) => {
  try {
    let { q = "" } = req.query;
    q = q.trim().toLowerCase();

    console.log("search_students q =", q);

    // ถ้าไม่พิมพ์อะไรเลย → ให้เป็น "%" แต่ limit 20 อยู่ดี
    const like = q === "" ? "%" : `%${q}%`;

    const sql = `
      SELECT
        u.user_id,
        u.full_name
      FROM users u
      WHERE u.role_id = 1   -- 1 = นักศึกษา
        AND (
          LOWER(u.user_id)   LIKE $1 OR
          LOWER(u.full_name) LIKE $1
        )
      ORDER BY u.user_id ASC
      LIMIT 20;
    `;

    const result = await query(sql, [like]);

    return res.status(200).json({
      message: "success",
      data: result.rows,  // [{ user_id, full_name }]
    });
  } catch (err) {
    console.error("search_students error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

function timeToMinutes(timeStr) {
  // timeStr รูปแบบ "HH:MM"
  if (!timeStr || typeof timeStr !== "string") return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
} export const schedule = async (req, res) => {
  const classroomId = req.params.id;
  const { start_time, end_time, late_after } = req.body;

  if (!start_time || !end_time || !late_after) {
    return res.status(400).json({
      message: "กรุณาส่ง start_time, end_time, late_after ให้ครบ",
    });
  }

  const startMin = timeToMinutes(start_time);
  const endMin = timeToMinutes(end_time);
  const lateMin = timeToMinutes(late_after);

  if (startMin === null || endMin === null || lateMin === null) {
    return res.status(400).json({
      message: "รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM เช่น 08:00",
    });
  }

  if (endMin <= startMin) {
    return res.status(400).json({
      message: "เวลาเลิกเรียนต้องมากกว่าเวลาเริ่มเรียน",
    });
  }

  if (lateMin < startMin) {
    return res.status(400).json({
      message: "เวลามาสายต้องไม่ก่อนเวลาเริ่มเรียน",
    });
  }

  if (lateMin > endMin) {
    return res.status(400).json({
      message: "เวลามาสายต้องไม่เกินเวลาเลิกเรียน",
    });
  }

  try {
    const sql = `
      UPDATE classrooms
      SET 
        "Start" = $1,
        "End"   = $2,
        "Late"  = $3
      WHERE classroom_id = $4
      RETURNING 
        classroom_id,
        to_char("Start", 'HH24:MI') AS start_time,
        to_char("End",   'HH24:MI') AS end_time,
        to_char("Late",  'HH24:MI') AS late_after;
    `;

    const values = [start_time, end_time, late_after, classroomId];
    const result = await query(sql, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบ classroom นี้" });
    }

    const row = result.rows[0];

    return res.json({
      classroom_id: row.classroom_id,
      schedule: {
        start_time: row.start_time,
        end_time: row.end_time,
        late_after: row.late_after,
      },
    });
  } catch (err) {
    console.error("Error updating classroom schedule:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
};

export const getClassroomDetail = async (req, res) => {
  try {
    const instructorId = req.user.user_id;   // จาก token
    const classroomId = req.params.id;

    const sql = `
      SELECT 
        cl.classroom_id,
        c.course_id   AS subject_code,
        c.course_name AS subject_name,
        cl.section,
        cl.year,
        cl.semester,
        -- ยังไม่มี credit ใน DB จริง ใช้ NULL ไปก่อน
        NULL::integer AS credit,
        u.full_name   AS teacher_name,
        COALESCE(ec.student_count, 0) AS student_count,
        -- ยังไม่มี room ในตาราง classrooms → ใส่ NULL ไปก่อน
        NULL::varchar AS room,
        to_char(cl."Start", 'HH24:MI') AS start_time,
        to_char(cl."End",   'HH24:MI') AS end_time,
        to_char(cl."Late",  'HH24:MI') AS late_after
      FROM classrooms cl
      JOIN courses c
        ON c.course_id = cl.course_id
      LEFT JOIN users u
        ON u.user_id = cl.instructor_id
      LEFT JOIN (
        SELECT classroom_id, COUNT(*) AS student_count
        FROM enrollments
        GROUP BY classroom_id
      ) ec
        ON ec.classroom_id = cl.classroom_id
      WHERE cl.classroom_id = $1
        AND cl.instructor_id = $2
    `;

    const result = await query(sql, [classroomId, instructorId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "ไม่พบชั้นเรียนนี้ หรือคุณไม่มีสิทธิ์เข้าถึง",
      });
    }

    const row = result.rows[0];

    return res.json({
      message: "success",
      data: {
        classroom_id: row.classroom_id,
        subject_code: row.subject_code,
        subject_name: row.subject_name,
        section: row.section,
        year: row.year,
        semester: row.semester,
        credit: row.credit,         // ตอนนี้จะเป็น null
        teacher_name: row.teacher_name,
        student_count: row.student_count,
        room: row.room,             // ตอนนี้จะเป็น null
        schedule: {
          start_time: row.start_time,   // "HH:MM"
          end_time: row.end_time,
          late_after: row.late_after,
        },
      },
    });
  } catch (err) {
    console.error("getClassroomDetail error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};