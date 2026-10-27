const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { logActivity } = require('./activity.controller');
const { createNotification } = require('./notification.controller');

const usersCollection = () => getDB().collection('users');

const getAllUsers = async (req, res) => {
    try {
        const result = await usersCollection().find().toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load users' });
    }
};

const getUserRole = async (req, res) => {
    const email = req.params.email;

    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    try {
        const user = await usersCollection().findOne({ email });
        res.send({
            admin: user?.role === 'admin',
            moderator: user?.role === 'moderator',
        });
    } catch (error) {
        res.status(500).send({ message: 'Failed to load user role' });
    }
};

const createUser = async (req, res) => {
    const user = req.body;

    if (!user?.email) {
        return res.status(400).send({ message: 'Email is required' });
    }

    try {
        const existingUser = await usersCollection().findOne({ email: user.email });
        if (existingUser) {
            return res.send({ message: 'User already exists', insertedId: null });
        }

        const result = await usersCollection().insertOne({
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
            role: 'user',
        });
        res.send(result);
    } catch (error) {
        if (error?.code === 11000) {
            return res.send({ message: 'User already exists', insertedId: null });
        }
        res.status(500).send({ message: 'Failed to create user' });
    }
};

const updateUserRole = async (req, res) => {
    const id = req.params.id;
    const { role } = req.body;

    const allowedRoles = ['user', 'moderator', 'admin'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).send({ message: 'Invalid role' });
    }
    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user id' });
    }

    try {
        const user = await usersCollection().findOne({ _id: new ObjectId(id) });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        const previousRole = user.role || 'user';
        const result = await usersCollection().updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
        );

        if (previousRole !== role) {
            const roleName = role === 'user' ? 'student' : role;
            await createNotification({
                userEmail: user.email,
                title: 'Your role changed',
                message: `An admin changed your role to ${roleName}.`,
                link: '/dashboard',
            });
            await logActivity(req, {
                action: 'user.role',
                targetType: 'user',
                targetId: id,
                summary: `Changed ${user.name || user.email}'s role from ${previousRole} to ${role}`,
            });
        }

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update user role' });
    }
};

const updateUserProfile = async (req, res) => {
    const email = req.params.email;
    const { name, photoURL } = req.body || {};

    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
        return res.status(400).send({ message: 'Name must be 1 to 60 characters' });
    }

    if (typeof photoURL !== 'string' || !/^https?:\/\/\S+$/i.test(photoURL.trim())) {
        return res.status(400).send({ message: 'Photo URL must be a valid http(s) link' });
    }

    try {
        const result = await usersCollection().updateOne(
            { email },
            { $set: { name: name.trim(), photoURL: photoURL.trim() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'User not found' });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update profile' });
    }
};

const deleteUser = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user id' });
    }

    try {
        const user = await usersCollection().findOne({ _id: new ObjectId(id) });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }
        if (user.email === req.decoded.email) {
            return res.status(400).send({ message: 'You cannot delete your own account' });
        }

        const result = await usersCollection().deleteOne({ _id: new ObjectId(id) });
        await logActivity(req, {
            action: 'user.delete',
            targetType: 'user',
            targetId: id,
            summary: `Deleted user ${user.name || user.email} (${user.email})`,
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to delete user' });
    }
};

module.exports = {
    getAllUsers,
    getUserRole,
    createUser,
    updateUserRole,
    updateUserProfile,
    deleteUser,
};
