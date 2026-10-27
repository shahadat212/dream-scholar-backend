const { getDB } = require('../config/db');

const activityCollection = () => getDB().collection('activityLogs');

const ACTIVITY_TARGETS = ['scholarship', 'application', 'review', 'user'];

const logActivity = async (req, { action, targetType, targetId, summary }) => {
    try {
        await activityCollection().insertOne({
            actorEmail: req.decoded?.email,
            action,
            targetType,
            targetId: targetId ? String(targetId) : null,
            summary,
            createdAt: new Date().toISOString(),
        });
    } catch (error) {
        return null;
    }
};

const getActivity = async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const { targetType } = req.query;

    if (targetType && !ACTIVITY_TARGETS.includes(targetType)) {
        return res.status(400).send({ message: 'Invalid target type' });
    }

    try {
        const query = targetType ? { targetType } : {};
        const result = await activityCollection().find(query).sort({ createdAt: -1 }).limit(limit).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load activity log' });
    }
};

module.exports = { logActivity, getActivity };
