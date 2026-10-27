const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const { getMyWishlist, addToWishlist, removeFromWishlist } = require('../controllers/wishlist.controller');

const router = express.Router();

router.get('/', verifyToken, getMyWishlist);
router.post('/', verifyToken, addToWishlist);
router.delete('/:scholarshipId', verifyToken, removeFromWishlist);

module.exports = router;
