const express = require("express");
const { showApplicationLeave,addApplicationLeave,editApplicationAdmin,showOneApplicationLeave,deleteApplication,leaveConfirm} = require("../controller/Leave");
const { authenticateToken } = require("../utils/authenticateToken");
const router = express.Router();

router.post("/showApplicationLeave",authenticateToken, showApplicationLeave);
router.get("/showOneApplicationLeave/:id", authenticateToken,  showOneApplicationLeave);
router.post("/addApplicationLeave", authenticateToken,  addApplicationLeave);
router.put("/leaveConfirm/:id", authenticateToken,  leaveConfirm);
router.put("/editApplicationAdmin/:id", authenticateToken,  editApplicationAdmin);
router.delete("/deleteApplication", authenticateToken, deleteApplication)

module.exports = router;