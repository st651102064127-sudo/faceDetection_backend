// Admin/faculty.js
import { query } from "../db.js";

/** GET /faculties */
export const faculty_index = async (req, res) => {
  try {
    const result = await query(
      "SELECT faculty_id, faculty_name FROM faculties ORDER BY faculty_id ASC"
    );
    return res.status(200).json({ message: "success", data: result.rows });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const faculty_store = async (req, res) => {
  console.log(req);
  
  try {
    const { faculty_name } = req.body;
    if (!faculty_name || faculty_name.trim() === "") {
      return res.status(400).json({ message: "faculty_name is required" });
    }

    // ✅ เช็คชื่อซ้ำ
    const dup = await query(
      "SELECT 1 FROM faculties WHERE LOWER(faculty_name)=LOWER($1)",
      [faculty_name.trim()]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ message: "มีข้อมูลนี้อยู่แล้ว" });
    }

    const result = await query(
      "INSERT INTO faculties (faculty_name) VALUES ($1) RETURNING faculty_id, faculty_name",
      [faculty_name.trim()]
    );

    return res.status(201).json({
      message: "เพิ่มข้อมูลคณะสำเร็จ",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/** PUT /faculties/:id */
export const faculty_update = async (req, res) => {
  try {
    const { id } = req.params;
    const { faculty_name } = req.body;

    if (!faculty_name || faculty_name.trim() === "") {
      return res.status(400).json({ message: "faculty_name is required" });
    }

    // เช็คมี record นี้จริงไหม
    const exist = await query(
      "SELECT faculty_id FROM faculties WHERE faculty_id=$1",
      [id]
    );
    if (exist.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลคณะ" });
    }

    // ✅ เช็คชื่อซ้ำ โดยยกเว้นตัวเอง
    const dup = await query(
      "SELECT 1 FROM faculties WHERE LOWER(faculty_name)=LOWER($1) AND faculty_id<>$2",
      [faculty_name.trim(), id]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ message: "มีข้อมูลนี้อยู่แล้ว" });
    }

    const result = await query(
      "UPDATE faculties SET faculty_name=$1 WHERE faculty_id=$2 RETURNING faculty_id, faculty_name",
      [faculty_name.trim(), id]
    );

    return res.status(200).json({
      message: "แก้ไขข้อมูลคณะสำเร็จ",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/** DELETE /faculties/:id */
export const faculty_destroy = async (req, res) => {
  try {
    const { id } = req.params;

    // เช็คมีอยู่จริงก่อน
    const exist = await query(
      "SELECT faculty_id FROM faculties WHERE faculty_id=$1",
      [id]
    );
    if (exist.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลคณะ" });
    }

    await query("DELETE FROM faculties WHERE faculty_id=$1", [id]);

    return res.status(200).json({ message: "ลบข้อมูลคณะสำเร็จ" });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
