// routes/holiday.js
const express = require('express');
const { holiday, getHolidays,birthday } = require('../controller/Calendar');
const multer = require('multer');
const { authenticateToken } = require('../utils/authenticateToken');
const router = express.Router();

const upload = multer({ dest: 'uploads/' });
router.post('/holiday',authenticateToken, upload.single('file'), holiday);
router.get('/holidays',authenticateToken, getHolidays);
router.get('/birthday',authenticateToken, birthday);

module.exports = router;