const express = require("express");
const authMiddleware = require("../middleware/auth");
const { buildDashboard } = require("../services/statsService");

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const dashboard = await buildDashboard(req.user.id);
  return res.json(dashboard);
});

module.exports = router;
