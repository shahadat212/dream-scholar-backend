const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { logActivity } = require('./activity.controller');
const { createNotification } = require('./notification.controller');

const applicationsCollection = () => getDB().collection('applications');
const scholarshipsCollection = () => getDB().collection('scholarships');
const paymentsCollection = () => getDB().collection('payments');

const STUDENT_EDITABLE_FIELDS = ['phoneNumber', 'address', 'gender'];
const STAFF_EDITABLE_FIELDS = ['applicationStatus', 'feedback'];
const APPLICATION_STATUSES = ['pending', 'processing', 'completed', 'rejected'];
const GENDERS = ['Male', 'Female', 'Other'];

const BULK_STATUSES = ['pending', 'processing', 'completed'];
const MY_APPLICATIONS_LINK = '/userDashboard/myApplication';

const todayString = () => new Date().toISOString().split('T')[0];

const historyEntry = (status, email, note) => ({
    status,
    at: new Date().toISOString(),
    by: email,
    ...(note ? { note } : {}),
});

const statusMessage = (status, scholarshipName) => {
    const name = scholarshipName || 'your scholarship';
    switch (status) {
        case 'processing':
            return { title: 'Application under review', message: `Your application for ${name} is now being reviewed.` };
        case 'completed':
            return { title: 'Application accepted', message: `Congratulations! Your application for ${name} was accepted.` };
        case 'rejected':
            return { title: 'Application not accepted', message: `Your application for ${name} was not accepted. Open it to read the feedback.` };
        default:
            return { title: 'Application pending', message: `Your application for ${name} is pending again.` };
    }
};

const notifyStatusChange = (application, status) => createNotification({
    userEmail: application.userEmail,
    ...statusMessage(status, application.scholarshipName),
    link: MY_APPLICATIONS_LINK,
});

const pickFields = (source, fields) => fields.reduce((picked, field) => {
    if (source?.[field] !== undefined) picked[field] = source[field];
    return picked;
}, {});
const usersCollection = () => getDB().collection('users');

const isStaff = async (email) => {
    const user = await usersCollection().findOne({ email });
    return user?.role === 'admin' || user?.role === 'moderator';
};

const getAllApplications = async (req, res) => {
    try {
        const result = await applicationsCollection().find().sort({ currentDate: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load applications' });
    }
};

const getApplicationsByEmail = async (req, res) => {
    const email = req.params.email;

    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    try {
        const result = await applicationsCollection().find({ userEmail: email }).sort({ currentDate: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load applications' });
    }
};

const getApplicationById = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid application id' });
    }

    try {
        const application = await applicationsCollection().findOne({ _id: new ObjectId(id) });
        if (!application) {
            return res.status(404).send({ message: 'Application not found' });
        }

        const staff = await isStaff(req.decoded.email);
        if (!staff && application.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        res.send(application);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load application' });
    }
};

const createApplication = async (req, res) => {
    const application = req.body;

    if (application?.userEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    if (!ObjectId.isValid(application?.scholarShipId)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    try {
        const scholarship = await scholarshipsCollection().findOne({ _id: new ObjectId(application.scholarShipId) });
        if (!scholarship) {
            return res.status(404).send({ message: 'Scholarship not found' });
        }

        if (scholarship.applicationDeadline && scholarship.applicationDeadline < todayString()) {
            return res.status(400).send({ message: 'The application deadline for this scholarship has passed' });
        }

        const existing = await applicationsCollection().findOne({
            userEmail: req.decoded.email,
            scholarShipId: String(application.scholarShipId),
        });
        if (existing) {
            return res.status(409).send({ message: 'You have already applied to this scholarship' });
        }

        const payment = await paymentsCollection().findOne({
            studentEmail: req.decoded.email,
            scholarshipId: String(application.scholarShipId),
        });
        if (!payment) {
            return res.status(402).send({ message: 'Please complete the payment before submitting your application' });
        }

        const { _id, feedback, ...rest } = application;
        const result = await applicationsCollection().insertOne({
            ...rest,
            scholarShipId: String(application.scholarShipId),
            applicationStatus: 'pending',
            currentDate: todayString(),
            statusHistory: [historyEntry('pending', req.decoded.email)],
        });
        res.send(result);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).send({ message: 'You have already applied to this scholarship' });
        }
        res.status(500).send({ message: 'Failed to submit application' });
    }
};

const updateApplication = async (req, res) => {
    const id = req.params.id;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid application id' });
    }

    try {
        const application = await applicationsCollection().findOne({ _id: new ObjectId(id) });
        if (!application) {
            return res.status(404).send({ message: 'Application not found' });
        }

        const staff = await isStaff(req.decoded.email);
        if (!staff && application.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        let allowedUpdates;
        if (staff) {
            allowedUpdates = pickFields(updates, STAFF_EDITABLE_FIELDS);
            if (allowedUpdates.applicationStatus !== undefined && !APPLICATION_STATUSES.includes(allowedUpdates.applicationStatus)) {
                return res.status(400).send({ message: 'Invalid application status' });
            }
            if (allowedUpdates.feedback !== undefined) {
                if (typeof allowedUpdates.feedback !== 'string' || !allowedUpdates.feedback.trim()) {
                    return res.status(400).send({ message: 'Feedback must be a non-empty text' });
                }
                allowedUpdates.feedback = allowedUpdates.feedback.trim();
            }
        } else {
            if (application.applicationStatus !== 'pending') {
                return res.status(403).send({ message: 'Only pending applications can be edited' });
            }
            allowedUpdates = pickFields(updates, STUDENT_EDITABLE_FIELDS);
            for (const field of ['phoneNumber', 'address']) {
                if (allowedUpdates[field] !== undefined) {
                    if (typeof allowedUpdates[field] !== 'string' || !allowedUpdates[field].trim()) {
                        return res.status(400).send({ message: `${field === 'phoneNumber' ? 'Phone number' : 'Address'} is required` });
                    }
                    allowedUpdates[field] = allowedUpdates[field].trim();
                }
            }
            if (allowedUpdates.gender !== undefined && !GENDERS.includes(allowedUpdates.gender)) {
                return res.status(400).send({ message: 'Invalid gender' });
            }
        }

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).send({ message: 'No editable fields were provided' });
        }

        const statusChanged = staff
            && allowedUpdates.applicationStatus !== undefined
            && allowedUpdates.applicationStatus !== application.applicationStatus;

        const updateDoc = { $set: allowedUpdates };
        if (statusChanged) {
            updateDoc.$push = { statusHistory: historyEntry(allowedUpdates.applicationStatus, req.decoded.email, allowedUpdates.feedback) };
        }

        const result = await applicationsCollection().updateOne({ _id: new ObjectId(id) }, updateDoc);

        if (staff) {
            if (statusChanged) {
                await notifyStatusChange(application, allowedUpdates.applicationStatus);
            } else if (allowedUpdates.feedback !== undefined) {
                await createNotification({
                    userEmail: application.userEmail,
                    title: 'New feedback',
                    message: `You have new feedback on your application for ${application.scholarshipName}.`,
                    link: MY_APPLICATIONS_LINK,
                });
            }
            await logActivity(req, {
                action: statusChanged ? 'application.status' : 'application.feedback',
                targetType: 'application',
                targetId: id,
                summary: statusChanged
                    ? `Changed ${application.userName || application.userEmail}'s application for "${application.scholarshipName}" from ${application.applicationStatus} to ${allowedUpdates.applicationStatus}`
                    : `Sent feedback on ${application.userName || application.userEmail}'s application for "${application.scholarshipName}"`,
            });
        }

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update application' });
    }
};

const bulkUpdateStatus = async (req, res) => {
    const { ids, status } = req.body || {};

    if (!BULK_STATUSES.includes(status)) {
        return res.status(400).send({ message: 'Bulk status must be pending, processing or completed' });
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
        return res.status(400).send({ message: 'Select between 1 and 100 applications' });
    }
    if (ids.some((id) => !ObjectId.isValid(id))) {
        return res.status(400).send({ message: 'One or more application ids are invalid' });
    }

    try {
        const objectIds = [...new Set(ids.map(String))].map((id) => new ObjectId(id));
        const applications = await applicationsCollection().find({ _id: { $in: objectIds } }).toArray();
        const toChange = applications.filter((application) => application.applicationStatus !== status);

        for (const application of toChange) {
            await applicationsCollection().updateOne(
                { _id: application._id },
                {
                    $set: { applicationStatus: status },
                    $push: { statusHistory: historyEntry(status, req.decoded.email) },
                }
            );
            await notifyStatusChange(application, status);
        }

        if (toChange.length > 0) {
            await logActivity(req, {
                action: 'application.bulk-status',
                targetType: 'application',
                targetId: null,
                summary: `Marked ${toChange.length} application${toChange.length === 1 ? '' : 's'} as ${status}`,
            });
        }

        res.send({ matched: applications.length, modified: toChange.length });
    } catch (error) {
        res.status(500).send({ message: 'Failed to update applications' });
    }
};

const deleteApplication = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid application id' });
    }

    try {
        const application = await applicationsCollection().findOne({ _id: new ObjectId(id) });
        if (!application) {
            return res.status(404).send({ message: 'Application not found' });
        }

        const staff = await isStaff(req.decoded.email);
        if (!staff && application.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        const result = await applicationsCollection().deleteOne({ _id: new ObjectId(id) });
        if (staff && application.userEmail !== req.decoded.email) {
            await logActivity(req, {
                action: 'application.delete',
                targetType: 'application',
                targetId: id,
                summary: `Deleted ${application.userName || application.userEmail}'s application for "${application.scholarshipName}"`,
            });
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to delete application' });
    }
};

module.exports = {
    getAllApplications,
    getApplicationsByEmail,
    getApplicationById,
    createApplication,
    updateApplication,
    bulkUpdateStatus,
    deleteApplication,
};
