const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdminOrModerator = require('../middlewares/verifyAdminOrModerator');
const {
    getAllScholarships,
    getScholarshipFilters,
    getTopScholarships,
    getScholarshipById,
    createScholarship,
    updateScholarship,
    deleteScholarship,
} = require('../controllers/scholarship.controller');

const router = express.Router();

router.get('/', getAllScholarships);
router.get('/filters', getScholarshipFilters);
router.get('/top', getTopScholarships);
router.get('/:id', getScholarshipById);
router.post('/', verifyToken, verifyAdminOrModerator, createScholarship);
router.patch('/:id', verifyToken, verifyAdminOrModerator, updateScholarship);
router.delete('/:id', verifyToken, verifyAdminOrModerator, deleteScholarship);

module.exports = router;
