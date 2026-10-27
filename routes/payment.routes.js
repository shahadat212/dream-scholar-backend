const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdminOrModerator = require('../middlewares/verifyAdminOrModerator');
const { getAllPayments, createPaymentIntent, createPayment } = require('../controllers/payment.controller');

const router = express.Router();

router.get('/', verifyToken, verifyAdminOrModerator, getAllPayments);
router.post('/create-intent', verifyToken, createPaymentIntent);
router.post('/', verifyToken, createPayment);

module.exports = router;
