const express = require("express");
const authMiddleware = require("../middleware/auth");
const { buildDashboard } = require("../services/statsService");

const router = express.Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  const dashboard = buildDashboard(req.user.id);
  return res.json(dashboard);
});

module.exports = router;
