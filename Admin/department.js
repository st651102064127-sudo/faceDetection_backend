
import { query } from "../db.js";


export const department_index = async (req, res) => {
    try {
        const result = await query(
            `SELECT d.department_id, d.department_name, d.faculty_id, f.faculty_name
       FROM departments d
       LEFT JOIN faculties f ON f.faculty_id = d.faculty_id
       ORDER BY d.department_id ASC`
        );
        return res.status(200).json({ message: "success", data: result.rows });
    } catch (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};


export const department_store = async (req, res) => {
    try {
        const { department_name, faculty_id } = req.body;

        if (!department_name || !department_name.trim() || !faculty_id) {
            return res.status(400).json({ message: "department_name & faculty_id are required" });
        }

        // ชื่อซ้ำในคณะเดียวกัน (case-insensitive)
        const dup = await query(
            `SELECT 1 FROM departments 
       WHERE faculty_id = $1 AND LOWER(department_name) = LOWER($2)`,
            [faculty_id, department_name.trim()]
        );
        if (dup.rowCount > 0) {
            return res.status(409).json({ message: "มีสาขานี้ในคณะนี้อยู่แล้ว" });
        }

        const inserted = await query(
            `INSERT INTO departments (department_name, faculty_id)
       VALUES ($1, $2)
       RETURNING department_id, department_name, faculty_id`,
            [department_name.trim(), faculty_id]
        );

        // ดึงรายการทั้งหมดคืน
        const list = await query(
            `SELECT d.department_id, d.department_name, d.faculty_id, f.faculty_name
       FROM departments d
       LEFT JOIN faculties f ON f.faculty_id = d.faculty_id
       ORDER BY d.department_id ASC`
        );

        return res.status(201).json({
            message: "เพิ่มข้อมูลสาขาสำเร็จ",
            data: inserted.rows[0],
            list: list.rows,
        });
    } catch (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

/** แก้ไขสาขา (เช็คชื่อซ้ำในคณะเดียวกัน โดยยกเว้นแถวตัวเอง) และคืนรายการทั้งหมด */
export const department_update = async (req, res) => {
    try {
        const { id } = req.params;
        const { department_name, faculty_id } = req.body;

        if (!department_name || !department_name.trim() || !faculty_id) {
            return res.status(400).json({ message: "department_name & faculty_id are required" });
        }

        const exist = await query(
            "SELECT department_id FROM departments WHERE department_id=$1",
            [id]
        );
        if (exist.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลสาขา" });
        }

        const dup = await query(
            `SELECT 1 FROM departments
       WHERE faculty_id = $1 
         AND LOWER(department_name) = LOWER($2)
         AND department_id <> $3`,
            [faculty_id, department_name.trim(), id]
        );
        if (dup.rowCount > 0) {
            return res.status(409).json({ message: "มีสาขานี้ในคณะนี้อยู่แล้ว" });
        }

        const updated = await query(
            `UPDATE departments
       SET department_name = $1, faculty_id = $2
       WHERE department_id = $3
       RETURNING department_id, department_name, faculty_id`,
            [department_name.trim(), faculty_id, id]
        );

        const list = await query(
            `SELECT d.department_id, d.department_name, d.faculty_id, f.faculty_name
       FROM departments d
       LEFT JOIN faculties f ON f.faculty_id = d.faculty_id
       ORDER BY d.department_id ASC`
        );

        return res.status(200).json({
            message: "แก้ไขข้อมูลสาขาสำเร็จ",
            data: updated.rows[0],
            list: list.rows,
        });
    } catch (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

/** ลบสาขา และคืนรายการทั้งหมด */
export const department_destroy = async (req, res) => {
    try {
        const { id } = req.params;

        const exist = await query(
            "SELECT department_id FROM departments WHERE department_id=$1",
            [id]
        );
        if (exist.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลสาขา" });
        }

        await query("DELETE FROM departments WHERE department_id=$1", [id]);

        const list = await query(
            `SELECT d.department_id, d.department_name, d.faculty_id, f.faculty_name
       FROM departments d
       LEFT JOIN faculties f ON f.faculty_id = d.faculty_id
       ORDER BY d.department_id ASC`
        );

        return res.status(200).json({
            message: "ลบข้อมูลสาขาสำเร็จ",
            list: list.rows,
        });
    } catch (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
