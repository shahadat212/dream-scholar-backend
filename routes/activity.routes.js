const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdmin = require('../middlewares/verifyAdmin');
const { getActivity } = require('../controllers/activity.controller');

const router = express.Router();

router.get('/', verifyToken, verifyAdmin, getActivity);

module.exports = router;
