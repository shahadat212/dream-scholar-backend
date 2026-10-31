const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdminOrModerator = require('../middlewares/verifyAdminOrModerator');
const {
    getAllApplications,
    getApplicationsByEmail,
    getApplicationById,
    validateApplication,
    createApplication,
    updateApplication,
    bulkUpdateStatus,
    deleteApplication,
} = require('../controllers/application.controller');

const router = express.Router();

router.get('/', verifyToken, verifyAdminOrModerator, getAllApplications);
router.get('/email/:email', verifyToken, getApplicationsByEmail);
router.get('/:id', verifyToken, getApplicationById);
router.post('/validate', verifyToken, validateApplication);
router.post('/', verifyToken, createApplication);
router.patch('/bulk/status', verifyToken, verifyAdminOrModerator, bulkUpdateStatus);
router.patch('/:id', verifyToken, updateApplication);
router.delete('/:id', verifyToken, deleteApplication);

module.exports = router;
