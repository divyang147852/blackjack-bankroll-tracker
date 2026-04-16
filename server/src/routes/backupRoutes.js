const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/auth");
const config = require("../config");

const uploadDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });
const router = express.Router();
router.use(authMiddleware);

router.get("/download", (req, res) => {
  return res.download(config.dbPath, "blackjack_tracker_backup.db");
});

router.post("/restore", upload.single("backup"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No backup file uploaded" });
  }

  try {
    fs.copyFileSync(req.file.path, config.dbPath);
    fs.unlinkSync(req.file.path);
    return res.json({ message: "Database restored. Restart server to reload DB safely." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to restore backup" });
  }
});

module.exports = router;
