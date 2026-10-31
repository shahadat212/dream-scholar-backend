const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const notificationsCollection = () => getDB().collection('notifications');

const createNotification = async ({ userEmail, title, message, link }) => {
    if (!userEmail) return null;
    try {
        await notificationsCollection().insertOne({
            userEmail,
            title,
            message,
            link: link || null,
            read: false,
            createdAt: new Date().toISOString(),
        });
    } catch (error) {
        return null;
    }
};

const notifyStaff = async ({ title, message, link }) => {
    try {
        const staff = await getDB().collection('users').find({ role: { $in: ['admin', 'moderator'] } }).toArray();
        const createdAt = new Date().toISOString();
        const docs = staff
            .filter((member) => member?.email)
            .map((member) => ({ userEmail: member.email, title, message, link: link || null, read: false, createdAt }));
        if (docs.length) await notificationsCollection().insertMany(docs);
    } catch (error) {
        return null;
    }
};

const getMyNotifications = async (req, res) => {
    const email = req.decoded.email;

    try {
        const [items, unreadCount] = await Promise.all([
            notificationsCollection().find({ userEmail: email }).sort({ createdAt: -1 }).limit(30).toArray(),
            notificationsCollection().countDocuments({ userEmail: email, read: false }),
        ]);
        res.send({ items, unreadCount });
    } catch (error) {
        res.status(500).send({ message: 'Failed to load notifications' });
    }
};

const markNotificationRead = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid notification id' });
    }

    try {
        const result = await notificationsCollection().updateOne(
            { _id: new ObjectId(id), userEmail: req.decoded.email },
            { $set: { read: true } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'Notification not found' });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update notification' });
    }
};

const markAllNotificationsRead = async (req, res) => {
    try {
        const result = await notificationsCollection().updateMany(
            { userEmail: req.decoded.email, read: false },
            { $set: { read: true } }
        );
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update notifications' });
    }
};

module.exports = {
    createNotification,
    notifyStaff,
    getMyNotifications,
    markNotificationRead,
    markAllNotificationsRead,
};
