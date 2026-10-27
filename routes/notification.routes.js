const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const {
    getMyNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} = require('../controllers/notification.controller');

const router = express.Router();

router.get('/', verifyToken, getMyNotifications);
router.patch('/read-all', verifyToken, markAllNotificationsRead);
router.patch('/:id/read', verifyToken, markNotificationRead);

module.exports = router;
