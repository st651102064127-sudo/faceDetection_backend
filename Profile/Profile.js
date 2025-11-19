// controllers/profile.js
import { query } from "../db.js";
import bcrypt from "bcrypt";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// GET /me  หรือ /profile  → ดึงข้อมูลจาก token
export const profile_show = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const result = await query(
            `SELECT 
                u.user_id, 
                u.full_name, 
                u.email, 
                u.birth_date,
                r.role_id, 
                r.role_name,
                f.faculty_id, 
                f.faculty_name,
                d.department_id, 
                d.department_name,
                
                -- รูปโปรไฟล์
                up.id,
                up.file_path AS profile_photo

            FROM users u
            LEFT JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
            LEFT JOIN departments d ON d.department_id = u.department_id
            LEFT JOIN user_photos up ON up.user_id = u.user_id  

            WHERE u.user_id = $1
            LIMIT 1`,
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้" });
        }

        return res.status(200).json({
            message: "success",
            data: result.rows[0],
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Server error" });
    }
};


// PUT /me  หรือ /profile  → แก้ไขข้อมูลของตัวเอง
export const profile_update = async (req, res) => {
    try {
        const userId = req.user.user_id; // user จาก token

        const {
            full_name,
            email,
            faculty_id,
            department_id,
            password,
        } = req.body;

        // ตรวจ user
        const exist = await query(
            "SELECT * FROM users WHERE user_id = $1",
            [userId]
        );
        if (exist.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้" });
        }

        // full_name / email ต้องไม่ว่าง
        if (!full_name?.trim() || !email?.trim()) {
            return res.status(400).json({
                message: "full_name และ email เป็นข้อมูลบังคับ",
            });
        }

        // เช็ค email ซ้ำ
        const dupEmail = await query(
            `SELECT 1 
             FROM users 
             WHERE LOWER(email) = LOWER($1) 
             AND user_id <> $2`,
            [email.trim(), userId]
        );

        if (dupEmail.rowCount > 0) {
            return res.status(409).json({ message: "อีเมลนี้ถูกใช้ไปแล้ว" });
        }

        // ==== เตรียม UPDATE แบบ Dynamic ====
        const updateCols = [];
        const updateVals = [];
        let index = 1;

        // full_name
        updateCols.push(`full_name = $${index}`);
        updateVals.push(full_name.trim());
        index++;

        // email
        updateCols.push(`email = $${index}`);
        updateVals.push(email.trim());
        index++;

        // faculty_id ถ้าส่งมาเท่านั้น
        if (faculty_id !== undefined) {
            updateCols.push(`faculty_id = $${index}`);
            updateVals.push(faculty_id || null);
            index++;
        }

        // department_id ถ้าส่งมาเท่านั้น
        if (department_id !== undefined) {
            updateCols.push(`department_id = $${index}`);
            updateVals.push(department_id || null);
            index++;
        }

        // password ถ้ามีค่า → อัปเดต
        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password.trim(), 10);
            updateCols.push(`password = $${index}`);
            updateVals.push(hashedPassword);
            index++;
        }

        // userId สำหรับ WHERE
        updateVals.push(userId);

        const sql = `
            UPDATE users
            SET ${updateCols.join(", ")}
            WHERE user_id = $${index}
        `;

        await query(sql, updateVals);

        // ==== ดึงข้อมูลใหม่ ====
        const updated = await query(
            `SELECT u.user_id, u.full_name, u.email, u.birth_date,
                r.role_id, r.role_name,
                f.faculty_id, f.faculty_name,
                d.department_id, d.department_name
             FROM users u
             LEFT JOIN roles r ON r.role_id = u.role_id
             LEFT JOIN faculties f ON f.faculty_id = u.faculty_id
             LEFT JOIN departments d ON d.department_id = u.department_id
             WHERE u.user_id = $1`,
            [userId]
        );

        return res.status(200).json({
            message: "อัปเดตโปรไฟล์สำเร็จ",
            data: updated.rows[0],
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Server error" });
    }
};

export const upload_profile_photo = async (req, res) => {
    try {
        const userId = req.user.user_id;

        if (!req.file) {
            return res.status(400).json({ message: "ไม่มีรูปที่อัปโหลด" });
        }

        // random filename ใหม่แบบปลอดภัย
        const ext = path.extname(req.file.originalname).toLowerCase();
        const newFileName = crypto.randomBytes(16).toString("hex") + ext;

        const newFilePath = `/Image/Profile/${newFileName}`;
        const oldPath = req.file.path;

        // ------------------------------------------------------
        // 1) ลบรูปเก่าที่เป็น is_primary = TRUE
        // ------------------------------------------------------
        const old = await query(
            `SELECT file_path FROM user_photos 
             WHERE user_id = $1 AND is_primary = TRUE`,
            [userId]
        );

        if (old.rowCount > 0) {
            const oldFile = old.rows[0].file_path;
            const absPath = path.join(process.cwd(), oldFile);

            if (fs.existsSync(absPath)) {
                fs.unlinkSync(absPath); // ลบไฟล์เก่า
            }

            await query(`DELETE FROM user_photos WHERE user_id = $1`, [userId]);
        }

        // ------------------------------------------------------
        // 2) ย้ายไฟล์อัปโหลดจาก multer มาใช้ชื่อใหม่
        // ------------------------------------------------------
        const newAbsPath = path.join(process.cwd(), "Image/Profile", newFileName);
        fs.renameSync(oldPath, newAbsPath);

        // ------------------------------------------------------
        // 3) บันทึกลง database
        // ------------------------------------------------------
        const inserted = await query(
            `INSERT INTO user_photos (user_id, file_name, file_path, is_primary)
             VALUES ($1, $2, $3, TRUE)
             RETURNING id, file_name, file_path`,
            [userId, newFileName, newFilePath]
        );

        return res.status(200).json({
            message: "อัปโหลดรูปโปรไฟล์สำเร็จ",
            data: inserted.rows[0]
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Server error" });
    }
};