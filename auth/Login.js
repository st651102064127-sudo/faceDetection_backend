// AuthController.js
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { query } from "../db.js";

export const login = async (req, res) => {
  try {
    const { user_id, password } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ message: "ชื่อผู้ใช้ และ password จำเป็น" });
    }

    // หา user จาก DB
    const result = await query(
      `SELECT 
      u.user_id, 
      u.password, 
      u.full_name, 
      u.email,

      u.role_id, 
      r.role_name,

      u.faculty_id, 
      f.faculty_name,

      u.department_id, 
      d.department_name,

      up.file_path AS profile_photo   -- ดึงรูปโปรไฟล์

   FROM users u
   LEFT JOIN roles r ON r.role_id = u.role_id
   LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
   LEFT JOIN departments d ON d.department_id = u.department_id

   -- รูปโปรไฟล์ (primary)
   LEFT JOIN user_photos up 
          ON up.user_id = u.user_id 
         AND up.is_primary = true

   WHERE u.user_id = $1
   LIMIT 1`,
      [user_id]
    );


    if (result.rowCount === 0) {
      return res.status(401).json({ message: "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = result.rows[0];
 
    
    // เทียบ password
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // สร้าง payload ของ token
    const payload = {
      user_id: user.user_id,
      role_id: user.role_id,
      role_name: user.role_name,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "dev_secret_key",
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    // เตรียม user data ที่จะส่งกลับ (ไม่รวม password)
    const userData = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      faculty_id: user.faculty_id,
      faculty_name: user.faculty_name,
      department_id: user.department_id,
      department_name: user.department_name,
      profileImage : user.profile_photo
    };

    // เลือก path ปลายทางตาม role (เปลี่ยนชื่อ path ให้ตรงกับ router ของคุณ)
    let redirect_path = "/login";
    if (user.role_id === 3) redirect_path = "/admin/dashboard";
    else if (user.role_id === 2) redirect_path = "/instructor/dashboard";
    else if (user.role_id === 1) redirect_path = "/student/dashboard";

    return res.status(200).json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: userData,
      redirect_path,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};