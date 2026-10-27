const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdminOrModerator = require('../middlewares/verifyAdminOrModerator');
const {
    getAllReviews,
    getReviewsForStaff,
    getReviewsByEmail,
    createReview,
    updateReview,
    setReviewVisibility,
    deleteReview,
} = require('../controllers/review.controller');

const router = express.Router();

router.get('/', getAllReviews);
router.get('/manage', verifyToken, verifyAdminOrModerator, getReviewsForStaff);
router.get('/email/:email', verifyToken, getReviewsByEmail);
router.post('/', verifyToken, createReview);
router.patch('/:id/visibility', verifyToken, verifyAdminOrModerator, setReviewVisibility);
router.patch('/:id', verifyToken, updateReview);
router.delete('/:id', verifyToken, deleteReview);

module.exports = router;
