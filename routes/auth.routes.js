const express = require('express');
const { issueToken } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/jwt', issueToken);

module.exports = router;
