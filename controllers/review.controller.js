const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { logActivity } = require('./activity.controller');
const { createNotification } = require('./notification.controller');

const reviewsCollection = () => getDB().collection('reviews');
const usersCollection = () => getDB().collection('users');

const validateReviewInput = ({ rating, comment }) => {
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return { error: 'Rating must be a whole number from 1 to 5' };
    }
    if (typeof comment !== 'string' || !comment.trim()) {
        return { error: 'Comment is required' };
    }
    return { rating: numericRating, comment: comment.trim() };
};

const isStaff = async (email) => {
    const user = await usersCollection().findOne({ email });
    return user?.role === 'admin' || user?.role === 'moderator';
};

const getAllReviews = async (req, res) => {
    const { universityId } = req.query;

    try {
        const query = universityId ? { universityId, hidden: { $ne: true } } : { hidden: { $ne: true } };
        const result = await reviewsCollection().find(query).sort({ date: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load reviews' });
    }
};

const getReviewsForStaff = async (req, res) => {
    try {
        const result = await reviewsCollection().find().sort({ date: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load reviews' });
    }
};

const setReviewVisibility = async (req, res) => {
    const id = req.params.id;
    const { hidden } = req.body || {};

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid review id' });
    }
    if (typeof hidden !== 'boolean') {
        return res.status(400).send({ message: 'Hidden must be true or false' });
    }

    try {
        const review = await reviewsCollection().findOne({ _id: new ObjectId(id) });
        if (!review) {
            return res.status(404).send({ message: 'Review not found' });
        }

        const wasHidden = Boolean(review.hidden);
        const result = await reviewsCollection().updateOne(
            { _id: new ObjectId(id) },
            { $set: { hidden, hiddenBy: hidden ? req.decoded.email : null, hiddenAt: hidden ? new Date().toISOString() : null } }
        );

        if (wasHidden !== hidden) {
            await createNotification({
                userEmail: review.userEmail,
                title: hidden ? 'Review hidden' : 'Review visible again',
                message: hidden
                    ? `Your review of ${review.scholarshipName} was hidden by a moderator.`
                    : `Your review of ${review.scholarshipName} is visible again.`,
                link: '/userDashboard/myReviews',
            });
            await logActivity(req, {
                action: hidden ? 'review.hide' : 'review.unhide',
                targetType: 'review',
                targetId: id,
                summary: `${hidden ? 'Hid' : 'Restored'} ${review.userName || review.userEmail}'s review of "${review.scholarshipName}"`,
            });
        }

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update review' });
    }
};

const getReviewsByEmail = async (req, res) => {
    const email = req.params.email;

    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    try {
        const result = await reviewsCollection().find({ userEmail: email }).sort({ date: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load reviews' });
    }
};

const createReview = async (req, res) => {
    const review = req.body;

    if (review?.userEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    const validated = validateReviewInput(review);
    if (validated.error) {
        return res.status(400).send({ message: validated.error });
    }

    try {
        const { _id, ...rest } = review;
        const result = await reviewsCollection().insertOne({
            ...rest,
            rating: validated.rating,
            comment: validated.comment,
            date: new Date().toISOString().split('T')[0],
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to submit review' });
    }
};

const updateReview = async (req, res) => {
    const id = req.params.id;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid review id' });
    }

    const validated = validateReviewInput(updates || {});
    if (validated.error) {
        return res.status(400).send({ message: validated.error });
    }

    try {
        const review = await reviewsCollection().findOne({ _id: new ObjectId(id) });
        if (!review) {
            return res.status(404).send({ message: 'Review not found' });
        }

        if (review.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        const result = await reviewsCollection().updateOne(
            { _id: new ObjectId(id) },
            { $set: { rating: validated.rating, comment: validated.comment } }
        );
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update review' });
    }
};

const deleteReview = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid review id' });
    }

    try {
        const review = await reviewsCollection().findOne({ _id: new ObjectId(id) });
        if (!review) {
            return res.status(404).send({ message: 'Review not found' });
        }

        const staff = await isStaff(req.decoded.email);
        if (!staff && review.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        const result = await reviewsCollection().deleteOne({ _id: new ObjectId(id) });
        if (staff && review.userEmail !== req.decoded.email) {
            await logActivity(req, {
                action: 'review.delete',
                targetType: 'review',
                targetId: id,
                summary: `Deleted ${review.userName || review.userEmail}'s review of "${review.scholarshipName}"`,
            });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to delete review' });
    }
};

module.exports = {
    getAllReviews,
    getReviewsForStaff,
    getReviewsByEmail,
    createReview,
    updateReview,
    setReviewVisibility,
    deleteReview,
};
