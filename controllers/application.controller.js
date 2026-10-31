const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { logActivity } = require('./activity.controller');
const { createNotification, notifyStaff } = require('./notification.controller');

const applicationsCollection = () => getDB().collection('applications');
const scholarshipsCollection = () => getDB().collection('scholarships');
const paymentsCollection = () => getDB().collection('payments');

const STUDENT_EDITABLE_FIELDS = [
    'applicantPhoto', 'userName', 'dateOfBirth', 'gender', 'nationality', 'phoneNumber',
    'addressLine', 'city', 'postalCode', 'country', 'degree', 'currentInstitution',
    'sscResult', 'sscYear', 'hscResult', 'hscYear', 'bachelorCgpa', 'studyGap',
    'englishTest', 'englishScore', 'statementOfPurpose', 'certificates',
];
const STAFF_EDITABLE_FIELDS = ['applicationStatus', 'feedback'];
const APPLICATION_STATUSES = ['pending', 'processing', 'completed', 'rejected'];
const GENDERS = ['Male', 'Female', 'Other'];

const BULK_STATUSES = ['pending', 'processing', 'completed'];
const DEGREE_LEVELS = ['Diploma', 'Bachelor', 'Masters', 'PhD'];
const STUDY_GAPS = ['No study gap', '1 Year', '2 Years', '3+ Years'];
const ENGLISH_TESTS = {
    IELTS: { min: 0, max: 9 },
    'TOEFL iBT': { min: 0, max: 120 },
    Duolingo: { min: 10, max: 160 },
    None: null,
};
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;

const cleanText = (value, label, min, max) => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
        return { error: `${label} must be ${min} to ${max} characters` };
    }
    return { value: value.trim().replace(/\s+/g, ' ') };
};

const numberInRange = (value, label, min, max) => {
    const number = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(number) || number < min || number > max) {
        return { error: `${label} must be between ${min} and ${max}` };
    }
    return { value: number };
};

const ageOn = (dateString) => {
    const birth = new Date(`${dateString}T00:00:00Z`);
    const now = new Date();
    const age = now.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
        || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
    return beforeBirthday ? age - 1 : age;
};

const normalizeApplication = (body, scholarship) => {
    const currentYear = new Date().getUTCFullYear();
    const data = {};
    const take = (field, result) => {
        if (result.error) throw new Error(result.error);
        data[field] = result.value;
    };

    try {
        if (typeof body.applicantPhoto !== 'string' || !URL_PATTERN.test(body.applicantPhoto.trim())) {
            throw new Error('A photo of the applicant is required');
        }
        data.applicantPhoto = body.applicantPhoto.trim();

        take('userName', cleanText(body.userName, 'Full name', 2, 80));

        if (typeof body.dateOfBirth !== 'string' || !DATE_PATTERN.test(body.dateOfBirth) || isNaN(new Date(body.dateOfBirth))) {
            throw new Error('Date of birth must be a valid date');
        }
        const age = ageOn(body.dateOfBirth);
        if (age < 14 || age > 70) throw new Error('Applicants must be between 14 and 70 years old');
        data.dateOfBirth = body.dateOfBirth;

        if (!GENDERS.includes(body.gender)) throw new Error('Choose a gender');
        data.gender = body.gender;
        take('nationality', cleanText(body.nationality, 'Nationality', 2, 60));

        if (typeof body.phoneNumber !== 'string' || !PHONE_PATTERN.test(body.phoneNumber.trim())) {
            throw new Error('Enter a valid phone number, including the country code');
        }
        data.phoneNumber = body.phoneNumber.trim();

        take('addressLine', cleanText(body.addressLine, 'Street address', 5, 150));
        take('city', cleanText(body.city, 'City', 2, 60));
        take('country', cleanText(body.country, 'Country', 2, 60));
        if (body.postalCode !== undefined && String(body.postalCode).trim() !== '') {
            take('postalCode', cleanText(String(body.postalCode), 'Postal code', 2, 12));
        } else {
            data.postalCode = '';
        }
        data.address = [data.addressLine, data.city, data.postalCode, data.country].filter(Boolean).join(', ');

        const allowedDegrees = scholarship.degreeLevels?.length ? scholarship.degreeLevels : DEGREE_LEVELS;
        if (!allowedDegrees.includes(body.degree)) {
            throw new Error(`This scholarship accepts: ${allowedDegrees.join(', ')}`);
        }
        data.degree = body.degree;

        take('currentInstitution', cleanText(body.currentInstitution, 'Current or last institution', 2, 120));
        take('sscResult', numberInRange(body.sscResult, 'SSC GPA', 1, 5));
        take('sscYear', numberInRange(body.sscYear, 'SSC passing year', 1970, currentYear));
        take('hscResult', numberInRange(body.hscResult, 'HSC GPA', 1, 5));
        take('hscYear', numberInRange(body.hscYear, 'HSC passing year', 1970, currentYear));
        if (!Number.isInteger(data.sscYear) || !Number.isInteger(data.hscYear)) {
            throw new Error('Passing years must be whole years');
        }
        if (data.hscYear <= data.sscYear) throw new Error('HSC passing year must be after the SSC passing year');

        if (data.degree === 'Masters' || data.degree === 'PhD') {
            take('bachelorCgpa', numberInRange(body.bachelorCgpa, "Bachelor's CGPA", 0, 4));
        } else {
            data.bachelorCgpa = null;
        }

        if (!STUDY_GAPS.includes(body.studyGap)) throw new Error('Choose your study gap');
        data.studyGap = body.studyGap;

        if (!Object.prototype.hasOwnProperty.call(ENGLISH_TESTS, body.englishTest)) {
            throw new Error('Choose your English test, or None');
        }
        data.englishTest = body.englishTest;
        const range = ENGLISH_TESTS[body.englishTest];
        data.englishScore = range ? numberInRange(body.englishScore, `${body.englishTest} score`, range.min, range.max) : { value: null };
        if (data.englishScore.error) throw new Error(data.englishScore.error);
        data.englishScore = data.englishScore.value;

        const certificates = body.certificates && typeof body.certificates === 'object' ? body.certificates : {};
        const certificateUrl = (key, label, required) => {
            const value = certificates[key];
            if (typeof value === 'string' && URL_PATTERN.test(value.trim())) return value.trim();
            if (required) throw new Error(`Upload your ${label}`);
            return null;
        };
        data.certificates = {
            ssc: certificateUrl('ssc', 'SSC / O-Level certificate', true),
            hsc: certificateUrl('hsc', 'HSC / A-Level certificate', true),
            bachelor: certificateUrl('bachelor', "Bachelor's certificate or transcript", data.degree === 'Masters' || data.degree === 'PhD'),
            english: certificateUrl('english', `${data.englishTest} score report`, data.englishTest !== 'None'),
        };
        if (data.degree !== 'Masters' && data.degree !== 'PhD') data.certificates.bachelor = null;
        if (data.englishTest === 'None') data.certificates.english = null;

        take('statementOfPurpose', (() => {
            if (typeof body.statementOfPurpose !== 'string') return { error: 'Personal statement is required' };
            const text = body.statementOfPurpose.trim();
            if (text.length < 150 || text.length > 3000) return { error: 'Personal statement must be 150 to 3000 characters' };
            return { value: text };
        })());

        if (body.eligibilityConfirmed !== true || body.documentsConfirmed !== true || body.declarationAccepted !== true) {
            throw new Error('Please confirm the eligibility, documents and declaration statements');
        }
        data.declarations = {
            eligibility: true,
            documents: true,
            accuracy: true,
            acceptedAt: new Date().toISOString(),
        };
    } catch (error) {
        return { error: error.message };
    }

    return { data };
};

const loadScholarshipForApplication = async (scholarShipId, email) => {
    if (!ObjectId.isValid(scholarShipId)) {
        return { status: 400, message: 'Invalid scholarship id' };
    }
    const scholarship = await scholarshipsCollection().findOne({ _id: new ObjectId(scholarShipId) });
    if (!scholarship) {
        return { status: 404, message: 'Scholarship not found' };
    }
    if (scholarship.applicationDeadline && scholarship.applicationDeadline < todayString()) {
        return { status: 400, message: 'The application deadline for this scholarship has passed' };
    }
    const existing = await applicationsCollection().findOne({ userEmail: email, scholarShipId: String(scholarShipId) });
    if (existing) {
        return { status: 409, message: 'You have already applied to this scholarship' };
    }
    return { scholarship };
};
const MY_APPLICATIONS_LINK = '/userDashboard/myApplication';
const STAFF_APPLICATIONS_LINK = '/adminDashboard/manageApplications';

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

const validateApplication = async (req, res) => {
    const application = req.body || {};

    try {
        const found = await loadScholarshipForApplication(application.scholarShipId, req.decoded.email);
        if (found.status) {
            return res.status(found.status).send({ message: found.message });
        }
        const { error } = normalizeApplication(application, found.scholarship);
        if (error) {
            return res.status(400).send({ message: error });
        }
        res.send({ valid: true });
    } catch (error) {
        res.status(500).send({ message: 'Failed to check the application' });
    }
};

const createApplication = async (req, res) => {
    const application = req.body || {};

    try {
        const found = await loadScholarshipForApplication(application.scholarShipId, req.decoded.email);
        if (found.status) {
            return res.status(found.status).send({ message: found.message });
        }
        const { scholarship } = found;

        const { data, error } = normalizeApplication(application, scholarship);
        if (error) {
            return res.status(400).send({ message: error });
        }

        const payment = await paymentsCollection().findOne({
            studentEmail: req.decoded.email,
            scholarshipId: String(application.scholarShipId),
        });
        if (!payment) {
            return res.status(402).send({ message: 'Please complete the payment before submitting your application' });
        }

        const result = await applicationsCollection().insertOne({
            ...data,
            userEmail: req.decoded.email,
            scholarShipId: String(scholarship._id),
            scholarshipName: scholarship.scholarshipName,
            university: scholarship.universityName,
            category: scholarship.scholarshipCategory,
            subject: scholarship.subjectCategory,
            applicationFees: Number(scholarship.applicationFees) || 0,
            serviceCharge: Number(scholarship.serviceCharge) || 0,
            applicationStatus: 'pending',
            currentDate: todayString(),
            statusHistory: [historyEntry('pending', req.decoded.email)],
        });
        await notifyStaff({
            title: 'New application',
            message: `${data.userName} applied for ${scholarship.scholarshipName}.`,
            link: STAFF_APPLICATIONS_LINK,
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
        let isResubmission = false;
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
            isResubmission = application.applicationStatus === 'rejected' && updates?.resubmit === true;
            if (application.applicationStatus === 'rejected' && !isResubmission) {
                return res.status(403).send({ message: 'Use resubmit to send a rejected application again' });
            }
            if (application.applicationStatus !== 'pending' && !isResubmission) {
                return res.status(403).send({ message: 'Only pending applications can be edited' });
            }
            const changes = pickFields(updates, STUDENT_EDITABLE_FIELDS);
            if (Object.keys(changes).length === 0) {
                return res.status(400).send({ message: 'No editable fields were provided' });
            }
            const scholarship = ObjectId.isValid(application.scholarShipId)
                ? await scholarshipsCollection().findOne({ _id: new ObjectId(application.scholarShipId) })
                : null;
            const { data, error } = normalizeApplication({
                ...pickFields(application, STUDENT_EDITABLE_FIELDS),
                ...changes,
                eligibilityConfirmed: true,
                documentsConfirmed: true,
                declarationAccepted: true,
            }, scholarship || {});
            if (error) {
                return res.status(400).send({ message: error });
            }
            allowedUpdates = pickFields(data, [...STUDENT_EDITABLE_FIELDS, 'address']);
            if (isResubmission) {
                allowedUpdates.applicationStatus = 'pending';
                allowedUpdates.feedback = '';
                allowedUpdates.resubmittedAt = new Date().toISOString();
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
        if (isResubmission) {
            updateDoc.$push = {
                statusHistory: historyEntry('pending', req.decoded.email, application.feedback ? `Resubmitted after feedback: ${application.feedback}` : 'Resubmitted'),
            };
            updateDoc.$inc = { resubmissionCount: 1 };
        }

        const result = await applicationsCollection().updateOne({ _id: new ObjectId(id) }, updateDoc);

        if (isResubmission) {
            await notifyStaff({
                title: 'Application resubmitted',
                message: `${allowedUpdates.userName || application.userName} corrected and resubmitted their application for ${application.scholarshipName}.`,
                link: STAFF_APPLICATIONS_LINK,
            });
        }

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
    validateApplication,
    createApplication,
    updateApplication,
    bulkUpdateStatus,
    deleteApplication,
};
