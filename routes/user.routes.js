const express = require('express');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdmin = require('../middlewares/verifyAdmin');
const {
    getAllUsers,
    getUserRole,
    createUser,
    updateUserRole,
    updateUserProfile,
    deleteUser,
} = require('../controllers/user.controller');

const router = express.Router();

router.get('/', verifyToken, verifyAdmin, getAllUsers);
router.get('/role/:email', verifyToken, getUserRole);
router.post('/', createUser);
router.patch('/profile/:email', verifyToken, updateUserProfile);
router.patch('/role/:id', verifyToken, verifyAdmin, updateUserRole);
router.delete('/:id', verifyToken, verifyAdmin, deleteUser);

module.exports = router;
