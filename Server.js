import express from "express";
import cors from "cors";
import path from "path";

// Admin Controllers
import { faculty_store, faculty_index, faculty_update, faculty_destroy } from "./Admin/faculty.js";
import { department_index, department_store, department_update, department_destroy } from "./Admin/department.js";
import { users_index, users_store, users_update, users_destroy, users_bulk } from "./Admin/user.js";
import { roles_index } from "./Admin/roles.js";

// Profile Controllers
import { profile_show, profile_update, upload_profile_photo } from "./Profile/Profile.js";

// Auth
import { authRequired } from "./auth/authMiddleware.js";
import { login } from "./auth/Login.js";

// Multer Upload
import { upload } from "./middleware/upload.js";
//Course 
import { courses_index, courses_show, courses_store, courses_bulk_store, courses_delete, course_update, getInstructor } from "./Admin/courses.js";
import { getInstructorCourses, createClassroom } from "./Instructor/instructor.js";
import { getInstructorClassrooms, search_students, schedule, getClassroomDetail } from "./Instructor/classrooms.js"
import { classroom_members_add, getMembersClassroom, classroom_members_remove } from "./Instructor/classroomMembers.js"
import { getDate, getManualAttendance, saveManualAttendance } from "./Instructor/attendance.js"

const app = express();
const PORT = process.env.PORT || 4000;

// ----------------------------------------------------
// 💡 แก้ไข CORS: กำหนดค่า CORS ให้ใช้ Whitelist
// ----------------------------------------------------
const allowedOrigins = [
  'http://localhost:5173', // สำหรับการทดสอบในเครื่อง Local
  'https://magical-sprite-11874c.netlify.app' // **โดเมน Frontend ของคุณ**
];

const corsOptions = {
  origin: function (origin, callback) {
    // อนุญาตถ้า origin อยู่ใน Whitelist หรือไม่มี origin (เช่น การเรียกจาก Postman หรือ Server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // อนุญาต Methods ที่จำเป็น
  credentials: true // อนุญาตให้ส่ง Cookies/Authorization Headers
};

// ใช้ CORS Middleware พร้อมกำหนดค่า
app.use(cors(corsOptions));
// ----------------------------------------------------


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ให้เข้าถึงไฟล์อัปโหลดได้
app.use("/Image", express.static(path.resolve("Image")));


// -------------------------
//       AUTH
// -------------------------
app.post("/login", login);


// -------------------------
//       ROLES
// -------------------------
app.get("/roles", roles_index);


// -------------------------
//       FACULTIES
// -------------------------
app.get("/faculties", faculty_index);
app.post("/faculties_store", authRequired, faculty_store);
app.put("/faculties/:id", authRequired, faculty_update);
app.delete("/faculties/:id", authRequired, faculty_destroy);


// -------------------------
//       DEPARTMENTS
// -------------------------
app.get("/departments", department_index);
app.post("/departments", authRequired, department_store);
app.put("/departments/:id", authRequired, department_update);
app.delete("/departments/:id", authRequired, department_destroy);


// -------------------------
//       USERS (Admin Only)
// -------------------------
app.get("/users", authRequired, users_index);
app.post("/users", authRequired, users_store);
app.put("/users/:id", authRequired, users_update);
app.delete("/users/:id", authRequired, users_destroy);
app.get("/users/bulk", authRequired, users_bulk)

// -------------------------
//       PROFILE
// -------------------------

// ดึงข้อมูลของ userId (ADMIN หรือ เจ้าของบัญชีเข้าได้)
app.get("/getUserProfile/:id", authRequired, profile_show);

// อัปเดตโปรไฟล์ตัวเอง
app.put("/profile_update", authRequired, profile_update);

// อัปโหลดรูปโปรไฟล์
app.post(
  "/profile/upload_profile_photo",
  authRequired,
  upload.single("photo"),
  upload_profile_photo
);

//Course
app.get("/admin/courses", authRequired, courses_index);
app.post("/admin/courses", authRequired, courses_store);
app.delete("/admin/courses/:id", authRequired, courses_delete);
app.put("/admin/courses/:id", authRequired, course_update);
app.post("/admin/courses/bulk", authRequired, courses_bulk_store);
app.get("/admin/courses/:course_id", authRequired, courses_show);
app.get("/admin/getInstructor", authRequired, getInstructor);


// -------------------------
//       instructor
// -------------------------
app.get("/instructor/courses", authRequired, getInstructorCourses)
app.post("/instructor/classroom/create", authRequired, createClassroom)
app.get("/instructor/classrooms", authRequired, getInstructorClassrooms)
app.get("/instructor/students/search", authRequired, search_students)
app.post(
  "/instructor/classroom/:id/members/add",
  authRequired,
  classroom_members_add
);
app.get("/instructor/classroom/:classroom_id/members", authRequired, getMembersClassroom);
app.delete("/instructor/classroom/:classroom_id/members/:student_id", authRequired, classroom_members_remove);
app.put("/instructor/:id/schedule", authRequired, schedule)
app.get("/classrooms/:id", authRequired, getClassroomDetail)
app.get("/classroom/:id/attendance/dates", authRequired, getDate)
// -------------------------
//       ATTENDANCE (manual)
// -------------------------

// ดึงวันที่ที่เคยเช็คชื่อแล้วของห้องนี้
app.get(
  "/instructor/classroom/:classroomId/attendance/dates",
  authRequired,
  getDate
);

// ดึงรายชื่อ + attendance ของวันที่ระบุ
app.get(
  "/instructor/classroom/:classroomId/attendance",
  authRequired,
  getManualAttendance
);

// บันทึกการเช็คชื่อแบบ manual
app.put(
  "/instructor/classroom/:classroomId/attendance",
  authRequired,
  saveManualAttendance
);
// -------------------------
// START SERVER
// -------------------------
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
