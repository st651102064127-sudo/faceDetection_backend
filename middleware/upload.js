
import multer from "multer";
import path from "path";

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
import fs from "fs";
const uploadDir = "./Image";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ตั้งค่าเก็บไฟล์
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./Image");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

// filter ไฟล์เฉพาะรูปภาพ
function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/jpg"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("รองรับเฉพาะ JPG / PNG เท่านั้น"));
  }
  cb(null, true);
}

export const upload = multer({ storage, fileFilter });
