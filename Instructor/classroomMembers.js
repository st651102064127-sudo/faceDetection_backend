import { query } from "../db.js";

export const getMembersClassroom = async (req, res) => {
    try {
        const { classroom_id } = req.params;

        const sql = `
      SELECT e.student_id, u.full_name 
      FROM enrollments e
      JOIN users u ON u.user_id = e.student_id
      WHERE e.classroom_id = $1
      ORDER BY e.student_id ASC
    `;

        const result = await query(sql, [classroom_id]);

        return res.status(200).json({
            message: "success",
            data: result.rows,
        });

    } catch (err) {
        console.error("getMembersByClassroom error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
const getMembersByClassroom = async (classroomId) => {
    const r = await query(
        `
    SELECT 
      cs.classroom_id,
      cs.student_id,
      u.full_name,
      u.email
    FROM classroom_students cs
    JOIN users u ON u.user_id = cs.student_id
    WHERE cs.classroom_id = $1
    ORDER BY cs.student_id ASC
    `,
        [classroomId]
    );
    return r.rows;
};

/**
 * GET /instructor/classroom/:id/members
 * คืนสมาชิกของห้องเรียนนี้ทั้งหมด
 */
export const classroom_members_index = async (req, res) => {
    try {
        const classroomId = parseInt(req.params.id, 10);
        if (!Number.isInteger(classroomId)) {
            return res.status(400).json({ message: "classroom_id ไม่ถูกต้อง" });
        }

        // (ถ้าอยากเช็คว่าเป็นห้องของอาจารย์คนนี้จริงๆก็ JOIN classrooms+req.user.user_id เพิ่มได้)

        const members = await getMembersByClassroom(classroomId);
        return res.status(200).json({
            message: "success",
            data: members,
        });
    } catch (err) {
        console.error("classroom_members_index error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
export const classroom_members_add = async (req, res) => {
    try {
        const classroom_id = req.params.id;
        const { students = [], instructor_id = null } = req.body;

        if (!classroom_id) {
            return res.status(400).json({ message: "ต้องมี classroom_id" });
        }

        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ message: "ต้องส่ง students เป็น array" });
        }

        // -----------------------------------------
        // INSERT ทีละคน + กันซ้ำด้วย UNIQUE constraint
        // -----------------------------------------
        const inserted = [];
        const skipped = [];

        for (const student_id of students) {
            try {
                const insertSQL = `
          INSERT INTO enrollments (classroom_id, student_id)
          VALUES ($1, $2)
          ON CONFLICT (classroom_id, student_id) DO NOTHING
          RETURNING student_id;
        `;

                const r = await query(insertSQL, [classroom_id, student_id]);

                if (r.rowCount > 0) {
                    inserted.push(student_id);
                } else {
                    skipped.push(student_id); // ซ้ำ → ข้าม
                }
            } catch (errRow) {
                console.error("insert row error:", errRow);
                skipped.push(student_id);
            }
        }

        // -----------------------------------------
        // ดึงสมาชิกปัจจุบันทั้งหมดในห้อง
        // -----------------------------------------
        const sqlMembers = `
      SELECT 
        e.student_id,
        u.full_name 
      FROM enrollments e
      JOIN users u ON u.user_id = e.student_id
      WHERE e.classroom_id = $1
      ORDER BY e.student_id ASC;
    `;
        const members = await query(sqlMembers, [classroom_id]);

        return res.status(200).json({
            message: "เพิ่มสมาชิกสำเร็จ",
            inserted,
            skipped,
            data: members.rows,
        });

    } catch (err) {
        console.error("classroom_members_add error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

/**
 * DELETE /instructor/classroom/:id/members/:studentId
 */
export const classroom_members_remove = async (req, res) => {
    try {
        const { classroom_id, student_id } = req.params;

        const sql = `
      DELETE FROM enrollments
      WHERE classroom_id = $1 AND student_id = $2
    `;

        await query(sql, [classroom_id, student_id]);

        return res.status(200).json({ message: "ลบเรียบร้อย" });

    } catch (err) {
        console.error("remove student error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

