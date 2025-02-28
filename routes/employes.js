// routes/holiday.js
const express = require('express');
const {   addEmployes,
    allEmployes,
    editEmployes,
    viewEmployes,
    name,
    surname,
    deleteEmployes,importExcel } = require('../controller/employes');
const router = express.Router();

const multer = require('multer');
const { authenticateToken } = require('../utils/authenticateToken');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/addEmployes',authenticateToken, addEmployes);
router.get('/allEmployes',authenticateToken, allEmployes);
router.put('/editEmployes/:id',authenticateToken, editEmployes);
router.get('/viewEmployes/:id',authenticateToken, viewEmployes);
router.get('/name',authenticateToken, name);
router.get('/surname',authenticateToken, surname);
router.delete('/deleteEmployes',authenticateToken, deleteEmployes);
router.post("/importExcel",upload.single("file"),authenticateToken, importExcel);


module.exports = router;
