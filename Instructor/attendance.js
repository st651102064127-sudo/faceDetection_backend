// Instructor/attendance.js
import { query as dbQuery } from "../db.js";
export const getDate = async (req, res) => {
    const classroomId = req.params.classroomId || req.params.id;

    try {
        const sql = `
      SELECT DISTINCT 
        to_char(a.date::date, 'YYYY-MM-DD') AS date
      FROM attendance a
      JOIN enrollments e ON a.enrollment_id = e.id
      WHERE e.classroom_id = $1
      ORDER BY date;  -- ใช้ alias แทน
    `;

        const result = await dbQuery(sql, [classroomId]);

        // ได้เป็น ["2025-11-15", "2025-11-18", ...]
        const dates = result.rows.map((row) => row.date);

        console.log("attendance dates for classroom", classroomId, dates);

        return res.json({
            message: "success",
            data: dates,
        });
    } catch (err) {
        console.error("GET /attendance/dates error:", err);
        return res.status(500).json({
            message: "ไม่สามารถดึงวันที่เช็คชื่อได้",
            error: err.message,
        });
    }
};


/**
 * GET /instructor/classroom/:classroomId/attendance?date=YYYY-MM-DD
 * ดึงรายชื่อนักศึกษาในห้อง + สถานะ/เวลาเข้าเรียนของวันที่ระบุ
 */
export const getManualAttendance = async (req, res) => {
    const classroomId = req.params.classroomId || req.params.id;
    let { date } = req.query;

    try {
        // ถ้าไม่ส่ง date มา ให้ใช้วันนี้เป็นค่า default
        if (!date) {
            const today = new Date();
            date = today.toISOString().slice(0, 10); // YYYY-MM-DD
        }

        const sql = `
      SELECT
        e.id        AS enrollment_id,
        u.user_id   AS student_id,
        u.full_name AS student_name,
        a.status,
        a."time"
      FROM enrollments e
      JOIN users u
        ON e.student_id = u.user_id
      LEFT JOIN attendance a
        ON a.enrollment_id = e.id
       AND a.date = $2
      WHERE e.classroom_id = $1
      ORDER BY u.user_id;
    `;

        const result = await dbQuery(sql, [classroomId, date]);

        return res.json({
            message: "success",
            date,
            data: result.rows,
        });
    } catch (err) {
        console.error("GET /attendance error:", err);
        return res.status(500).json({
            message: "ไม่สามารถดึงข้อมูลการเข้าเรียนได้",
            error: err.message,
        });
    }
};

/**
 * PUT /instructor/classroom/:classroomId/attendance
 * บันทึกการเช็คชื่อแบบ manual (ทั้งห้องในครั้งเดียว)
 * body: { date: "2024-11-19", items: [{ enrollment_id, status, time }, ...] }
 */
export const saveManualAttendance = async (req, res) => {
    const classroomId = req.params.classroomId || req.params.id;
    const { date, items } = req.body;

    if (!date || !Array.isArray(items)) {
        return res.status(400).json({
            message: "กรุณาส่ง date และ items ให้ถูกต้อง",
        });
    }

    try {
        // 1) ลบรายการ attendance เดิมของห้องนี้ใน "วันนั้น" ทั้งหมดก่อน
        const deleteSql = `
      DELETE FROM attendance a
      USING enrollments e
      WHERE a.enrollment_id = e.id
        AND e.classroom_id = $1
        AND a.date = $2;
    `;
        await dbQuery(deleteSql, [classroomId, date]);

        // 2) แทรกชุดข้อมูลใหม่ทั้งหมดเข้าไป
        const insertSql = `
      INSERT INTO attendance (enrollment_id, date, status, "time")
      VALUES ($1, $2, $3, $4);
    `;

        for (const item of items) {
            const { enrollment_id, status, time } = item;

            await dbQuery(insertSql, [
                enrollment_id,
                date,
                status,
                time || null,
            ]);
        }

        return res.json({
            message: "success",
            date,
            updated_count: items.length,
        });
    } catch (err) {
        console.error("PUT /attendance error:", err);
        return res.status(500).json({
            message: "ไม่สามารถบันทึกข้อมูลการเข้าเรียนได้",
            error: err.message,
        });
    }
};