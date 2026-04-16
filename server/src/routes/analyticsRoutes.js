const express = require("express");
const authMiddleware = require("../middleware/auth");
const { buildAnalytics } = require("../services/statsService");

const router = express.Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  const analytics = buildAnalytics(req.user.id);
  return res.json(analytics);
});

module.exports = router;
