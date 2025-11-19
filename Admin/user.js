import { query } from "../db.js";
import bcrypt from "bcrypt";

/** helper: ดึงชื่อ role จาก role_id */
const getRoleName = async (role_id) => {
  const r = await query("SELECT role_name FROM roles WHERE role_id=$1", [role_id]);
  return r.rowCount ? r.rows[0].role_name : null;
};

/** helper: เป็นนักศึกษาหรือไม่ (เทียบชื่อ role) */
const isStudentRole = (role_name) =>
  role_name && role_name.trim() === "นักศึกษา";

/** helper: ตรวจ user_id นักศึกษา = ตัวเลข 12 หลัก */
const isValidStudentId = (user_id) => /^\d{12}$/.test(user_id || "");

export const users_index = async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.user_id, u.full_name, u.email,u.birth_date,
              r.role_id, r.role_name,
              f.faculty_id, f.faculty_name,
              d.department_id, d.department_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.user_id ASC`
    );
    return res.status(200).json({ message: "success", data: rows.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

/** (เดิม) ตรวจ FK ว่ามีจริง */
const assertFK = async ({ role_id, faculty_id, department_id }) => {
  const checks = [];
  if (role_id) checks.push(query("SELECT 1 FROM roles WHERE role_id=$1", [role_id]));
  if (faculty_id) checks.push(query("SELECT 1 FROM faculties WHERE faculty_id=$1", [faculty_id]));
  if (department_id) checks.push(query("SELECT 1 FROM departments WHERE department_id=$1", [department_id]));
  const results = await Promise.all(checks);
  let i = 0;
  if (role_id && results[i++].rowCount === 0) return { ok: false, message: "role_id not found" };
  if (faculty_id && results[i++].rowCount === 0) return { ok: false, message: "faculty_id not found" };
  if (department_id && results[i++].rowCount === 0) return { ok: false, message: "department_id not found" };
  return { ok: true };
};

export const users_store = async (req, res) => {
  try {
    const {
      user_id,
      full_name,
      email,
      birth_date,   // รูปแบบแนะนำ: 'YYYY-MM-DD'
      role_id,
      faculty_id,
      department_id,
    } = req.body;

    // ตรวจ input หลัก
    if (!user_id?.trim() || !full_name?.trim() || !email?.trim() || !birth_date || !role_id) {
      return res.status(400).json({
        message: "user_id, full_name, email, birth_date, role_id are required",
      });
    }

    // ตรวจ FK
    const fk = await assertFK({ role_id, faculty_id, department_id });
    if (!fk.ok) return res.status(400).json({ message: fk.message });

    // role = นักศึกษา → user_id ต้องเลข 12 หลัก
    const role_name = await getRoleName(role_id);
    if (isStudentRole(role_name) && !isValidStudentId(user_id.trim())) {
      return res.status(400).json({ message: "user_id ต้องเป็นตัวเลข 12 หลัก สำหรับนักศึกษา" });
    }

    // กันซ้ำ user_id
    const dupById = await query(`SELECT 1 FROM users WHERE user_id=$1`, [user_id.trim()]);
    if (dupById.rowCount > 0) {
      return res.status(409).json({ message: "รหัสผู้ใช้นี้มีอยู่แล้ว" });
    }

    // กันซ้ำ email
    const dupEmail = await query(`SELECT 1 FROM users WHERE LOWER(email)=LOWER($1)`, [email.trim()]);
    if (dupEmail.rowCount > 0) {
      return res.status(409).json({ message: "อีเมลนี้มีอยู่แล้ว" });
    }

    // --- สร้างรหัสผ่านจากวันเกิดแบบ พ.ศ. เป็น DDMMYY ---
    const dt = new Date(birth_date);
    if (isNaN(dt.getTime())) {
      return res.status(400).json({ message: "รูปแบบ birth_date ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)" });
    }
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");

    // ปี พ.ศ. = ค.ศ. + 543 แล้วตัดท้าย 2 หลัก
    const ceYear = dt.getFullYear();
    const beYear = ceYear + 543;
    const yy = String(beYear).slice(-2);

    const rawPassword = `${dd}${mm}${yy}`; // ตัวอย่าง: 22/05/2547 -> 220547
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    // --- จบการสร้างรหัสผ่าน ---

    // Insert
    await query(
      `INSERT INTO users
         (user_id, password, full_name, email, birth_date, role_id, faculty_id, department_id)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user_id.trim(),
        hashedPassword,
        full_name.trim(),
        email.trim(),
        birth_date, // 'YYYY-MM-DD'
        role_id,
        faculty_id || null,
        department_id || null,
      ]
    );

    // คืนรายการทั้งหมด
    const list = await query(
      `SELECT u.user_id, u.full_name, u.email, u.birth_date,
              r.role_id, r.role_name,
              f.faculty_id, f.faculty_name,
              d.department_id, d.department_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.user_id ASC`
    );

    return res.status(201).json({ message: "เพิ่มผู้ใช้สำเร็จ", list: list.rows });
  } catch (e) {
    // จับ unique constraint จาก DB ให้เป็นมิตร
    if (e?.code === "23505") { // unique_violation
      // ชื่อคอนสเตรนต์อาจเป็น users_email_key, users_pkey, ฯลฯ
      if (e?.constraint === "users_email_key") {
        return res.status(409).json({ message: "อีเมลนี้มีอยู่แล้ว" });
      }
      if (e?.constraint === "users_pkey" || e?.constraint === "users_user_id_key") {
        return res.status(409).json({ message: "รหัสผู้ใช้นี้มีอยู่แล้ว" });
      }
      // อื่น ๆ ตอบรวม
      return res.status(409).json({ message: "ข้อมูลซ้ำกับที่มีอยู่ในระบบ" });
    }

    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

export const users_update = async (req, res) => {
  try {
    const { id } = req.params; // ไม่อนุญาตให้เปลี่ยน user_id
    const { full_name, email, role_id, faculty_id, department_id, password } = req.body;

    const exist = await query("SELECT user_id FROM users WHERE user_id=$1", [id]);
    if (exist.rowCount === 0)
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });

    if (!full_name?.trim() || !email?.trim() || !role_id) {
      return res
        .status(400)
        .json({ message: "full_name, email, role_id are required" });
    }

    // ✅ ตรวจ FK
    const fk = await assertFK({ role_id, faculty_id, department_id });
    if (!fk.ok) return res.status(400).json({ message: fk.message });

    // ✅ ถ้า role เป็นนักศึกษา → user_id ต้องเป็นเลข 12 หลัก
    const role_name = await getRoleName(role_id);
    if (isStudentRole(role_name) && !isValidStudentId(id)) {
      return res
        .status(400)
        .json({ message: "user_id ต้องเป็นตัวเลข 12 หลัก สำหรับนักศึกษา" });
    }

    // ✅ ตรวจ email ซ้ำ (ยกเว้นตัวเอง)
    const dup = await query(
      `SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) AND user_id <> $2`,
      [email.trim(), id]
    );
    if (dup.rowCount > 0)
      return res.status(409).json({ message: "email ซ้ำในระบบ" });

    // ✅ ถ้ามี password ใหม่ → hash แล้วอัปเดตด้วย
    let sql, params;

    if (password && password.trim() !== "") {
      const hashed = await bcrypt.hash(password.trim(), 10);
      sql = `UPDATE users
             SET full_name=$1, email=$2, role_id=$3,
                 faculty_id=$4, department_id=$5, password=$6
             WHERE user_id=$7`;
      params = [
        full_name.trim(),
        email.trim(),
        role_id,
        faculty_id || null,
        department_id || null,
        hashed,
        id,
      ];
      console.log(`🧩 เปลี่ยนรหัสผ่านใหม่สำหรับ ${id}`);
    } else {
      sql = `UPDATE users
             SET full_name=$1, email=$2, role_id=$3,
                 faculty_id=$4, department_id=$5
             WHERE user_id=$6`;
      params = [
        full_name.trim(),
        email.trim(),
        role_id,
        faculty_id || null,
        department_id || null,
        id,
      ];
      console.log(`🔄 อัปเดตข้อมูลทั่วไปของ ${id} (ไม่เปลี่ยนรหัสผ่าน)`);
    }

    await query(sql, params);

    // ✅ คืนรายการทั้งหมด
    const list = await query(
      `SELECT u.user_id, u.full_name, u.email, u.birth_date,
              r.role_id, r.role_name,
              f.faculty_id, f.faculty_name,
              d.department_id, d.department_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.user_id ASC`
    );

    return res.status(200).json({ message: "แก้ไขผู้ใช้สำเร็จ", list: list.rows });
  } catch (e) {
    console.error("❌ [users_update ERROR]", e);

    if (e?.code === "23505") {
      if (e?.constraint === "users_email_key")
        return res.status(409).json({ message: "อีเมลนี้มีอยู่แล้ว" });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

export const users_destroy = async (req, res) => {
  try {
    const { id } = req.params;

    const exist = await query("SELECT 1 FROM users WHERE user_id=$1", [id]);
    if (exist.rowCount === 0) return res.status(404).json({ message: "ไม่พบผู้ใช้" });

    await query("DELETE FROM users WHERE user_id=$1", [id]);

    const list = await query(
      `SELECT u.user_id, u.full_name, u.email,
              r.role_id, r.role_name,
              f.faculty_id, f.faculty_name,
              d.department_id, d.department_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.user_id ASC`
    );

    return res.status(200).json({ message: "ลบผู้ใช้สำเร็จ", list: list.rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

const formatBirthDateDDMMYYYYtoSQL = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;

  // รองรับรูปแบบ D/M/YYYY หรือ DD/MM/YYYY
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;

  const paddedDay = day.padStart(2, "0");
  const paddedMonth = month.padStart(2, "0");

  return `${year}-${paddedMonth}-${paddedDay}`; // YYYY-MM-DD
};
// ฟังก์ชันสร้าง password จากวันเกิดแบบไทย (DDMMYY โดยใช้ปี พ.ศ.)
const buildPasswordFromBirthDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;

  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, yearStr] = match;
  const dayPadded = day.padStart(2, "0");
  const monthPadded = month.padStart(2, "0");
  const yearNum = Number(yearStr);

  if (Number.isNaN(yearNum)) return null;

  // แปลงปี ค.ศ. → พ.ศ. แล้วใช้ 2 หลักท้าย
  const beYear = yearNum + 543;
  const yy = String(beYear).slice(-2);

  // เช่น 22/5/2004 → 22/05/2547 → password = 220547
  return `${dayPadded}${monthPadded}${yy}`;
};

export const users_bulk = async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [];
    console.log("bulk rows:", rows);

    if (rows.length === 0) {
      return res.status(400).json({
        message: "ต้องส่ง array ของผู้ใช้เข้ามาใน body (เช่น csvPreview)",
      });
    }

    const inserted = [];
    const skipped = [];

    for (const row of rows) {
      try {
        const {
          user_id,
          full_name,
          email,
          birth_date,   // จาก CSV: '22/5/2004' หรือ '22/05/2004'
          role_id,
          faculty_id,
          department_id,
        } = row;

        // 1) ตรวจว่าข้อมูลสำคัญครบไหม
        if (!user_id || !full_name || !email || !birth_date || !role_id) {
          skipped.push({
            user_id,
            reason:
              "ข้อมูลไม่ครบ (user_id, full_name, email, birth_date, role_id)",
          });
          continue;
        }

        // 2) แปลงวันเกิดไปเป็น YYYY-MM-DD สำหรับเก็บใน DB
        const sqlBirthDate = formatBirthDateDDMMYYYYtoSQL(birth_date);
        if (!sqlBirthDate) {
          skipped.push({
            user_id,
            reason: "รูปแบบ birth_date ไม่ถูกต้อง (ต้องเป็น D/M/YYYY หรือ DD/MM/YYYY)",
          });
          continue;
        }

        // 3) สร้าง raw password จากวันเกิด (DDMMYY แบบ พ.ศ.)
        const rawPassword = buildPasswordFromBirthDate(birth_date);
        if (!rawPassword) {
          skipped.push({
            user_id,
            reason: "ไม่สามารถสร้างรหัสผ่านจาก birth_date ได้ (รูปแบบไม่ถูกต้อง)",
          });
          continue;
        }

        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        // 4) INSERT ถ้า user_id ซ้ำให้ข้าม (ON CONFLICT DO NOTHING)
        const insertSql = `
          INSERT INTO users
            (user_id, password, full_name, email, birth_date, role_id, faculty_id, department_id)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id) DO NOTHING
          RETURNING user_id;
        `;

        const params = [
          String(user_id).trim(),
          hashedPassword,
          String(full_name).trim(),
          String(email).trim(),
          sqlBirthDate,        // YYYY-MM-DD
          role_id,
          faculty_id || null,
          department_id || null,
        ];

        const r = await query(insertSql, params);

        if (r.rowCount > 0) {
          // แถวนี้ insert สำเร็จ
          inserted.push(r.rows[0].user_id);
        } else {
          // user_id ซ้ำ ถูกข้าม
          skipped.push({
            user_id,
            reason: "user_id นี้มีอยู่แล้ว (ถูกข้ามด้วย ON CONFLICT)",
          });
        }
      } catch (errRow) {
        console.error("bulk insert row error:", errRow);
        skipped.push({
          user_id: row.user_id,
          reason: "เกิดข้อผิดพลาดขณะบันทึกแถวนี้",
        });
      }
    }

    // 5) ดึง list ผู้ใช้ทั้งหมดส่งกลับ (เหมือน endpoint อื่นของคุณ)
    const listRes = await query(
      `SELECT u.user_id, u.full_name, u.email, u.birth_date,
              r.role_id, r.role_name,
              f.faculty_id, f.faculty_name,
              d.department_id, d.department_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.user_id ASC`
    );

    return res.status(201).json({
      message: "bulk import finished",
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      inserted,
      skipped,
      list: listRes.rows,
    });
  } catch (e) {
    console.error("users_bulk error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};