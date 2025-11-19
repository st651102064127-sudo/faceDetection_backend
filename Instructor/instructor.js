// controllers/instructor.controller.js
import { query } from "../db.js";

export const getInstructorCourses = async (req, res) => {
    try {
        const instructor_id = req.user.user_id;

        const sql = `
      SELECT course_id AS code, course_name AS name
      FROM courses
      WHERE instructor_id = $1
      ORDER BY course_id ASC
    `;

        const result = await query(sql, [instructor_id]);

        return res.status(200).json({
            message: "success",
            data: result.rows,
        });
    } catch (err) {
        console.error("getInstructorCourses error:", err);
        res.status(500).json({ message: "Server error" });
    }
};
export const createClassroom = async (req, res) => {
    try {
        const instructor_id = req.user.user_id;  // ดึงจาก token
        const { course_id, year, semester, section } = req.body;

        // ============= ตรวจสอบ input =============
        if (!course_id || !year || !semester || !section) {
            return res.status(400).json({
                message: "กรุณากรอกข้อมูลให้ครบ: course_id, year, semester, section",
            });
        }

        // ============= ตรวจว่าอาจารย์สอนวิชานั้นหรือไม่ =============
        const teachCheck = await query(
            `SELECT 1 FROM courses 
       WHERE course_id = $1 AND instructor_id = $2`,
            [course_id, instructor_id]
        );

        if (teachCheck.rowCount === 0) {
            return res.status(403).json({
                message: "คุณไม่มีสิทธิ์สร้างชั้นเรียนในรายวิชานี้",
            });
        }

        // ============= ป้องกันห้องเรียนซ้ำ =============
        const dup = await query(
            `SELECT classroom_id FROM classrooms
       WHERE course_id = $1 AND year = $2 AND semester = $3 AND section = $4`,
            [course_id, year, semester, section]
        );

        if (dup.rowCount > 0) {
            return res.status(409).json({
                message: "มีชั้นเรียนนี้อยู่แล้ว",
                classroom_id: dup.rows[0].classroom_id,
            });
        }

        // ============= สร้างชั้นเรียน =============
        const result = await query(
            `INSERT INTO classrooms (course_id, instructor_id, year, semester, section)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING classroom_id`,
            [course_id, instructor_id, year, semester, section]
        );

        return res.status(201).json({
            message: "สร้างชั้นเรียนสำเร็จ",
            data: {
                classroom_id: result.rows[0].classroom_id,
            },
        });

    } catch (err) {
        console.error("createClassroom ERROR:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
