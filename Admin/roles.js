// Admin/role.js
import { query } from "../db.js";
export const roles_index = async (req, res) => {
  try {
    const r = await query("SELECT role_id, role_name FROM roles ORDER BY role_id ASC");
    res.status(200).json({ message: "success", data: r.rows });
  } catch (e) {
    console.error(e); res.status(500).json({ message: "Server error" });
  }
};
