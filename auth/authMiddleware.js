// authMiddleware.js
import jwt from "jsonwebtoken";

export const authRequired = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");

  if (!token || type !== "Bearer") {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_secret_key"
    );
    // attach user info ไว้ที่ req.user
    req.user = decoded;
    next();
  } catch (e) {
    console.error(e);
    return res.status(401).json({ message: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
};
