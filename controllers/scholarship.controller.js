const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { logActivity } = require('./activity.controller');

const scholarshipsCollection = () => getDB().collection('scholarships');
const reviewsCollection = () => getDB().collection('reviews');

const SCHOLARSHIP_CATEGORIES = ['Full fund', 'Partial fund', 'Self-fund'];
const KNOWN_SUBJECTS = ['Agriculture', 'Engineering', 'Computer Science', 'Business Administration', 'Medicine'];
const OTHER_SUBJECTS = 'others';
const SORT_OPTIONS = {
    newest: { scholarshipPostDate: -1, _id: -1 },
    deadline: { applicationDeadline: 1, _id: 1 },
    'fee-asc': { applicationFees: 1, _id: 1 },
    'fee-desc': { applicationFees: -1, _id: 1 },
    rank: { universityRank: 1, _id: 1 },
    rating: { rating: -1, reviewCount: -1, _id: 1 },
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const todayString = () => new Date().toISOString().split('T')[0];
const ratingValue = { $convert: { input: '$rating', to: 'double', onError: null, onNull: null } };

const withRatings = async (scholarships) => {
    if (scholarships.length === 0) return scholarships;

    const ids = scholarships.map((scholarship) => String(scholarship._id));
    const stats = await reviewsCollection().aggregate([
        { $match: { universityId: { $in: ids }, hidden: { $ne: true } } },
        { $group: { _id: '$universityId', average: { $avg: ratingValue }, count: { $sum: 1 } } },
    ]).toArray();

    const statsById = new Map(stats.map((stat) => [String(stat._id), stat]));
    return scholarships.map((scholarship) => {
        const stat = statsById.get(String(scholarship._id));
        return {
            ...scholarship,
            rating: stat ? Math.round(stat.average * 10) / 10 : null,
            reviewCount: stat ? stat.count : 0,
        };
    });
};

const DEGREE_LEVELS = ['Diploma', 'Bachelor', 'Masters', 'PhD'];
const BENEFITS = ['Tuition', 'Monthly stipend', 'Accommodation', 'Travel', 'Health insurance', 'Books & supplies'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;

const REQUIRED_ON_CREATE = [
    'scholarshipName', 'universityName', 'universityCountry', 'universityCity', 'universityRank',
    'subjectCategory', 'scholarshipCategory', 'applicationFees', 'serviceCharge', 'applicationDeadline', 'description',
];

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

const textList = (value, label) => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return { error: `${label} must be a list of text items` };
    }
    return { value: value.map((item) => item.trim()).filter(Boolean) };
};

const normalizeScholarship = (body, { isCreate }) => {
    const data = {};

    if (isCreate) {
        const missing = REQUIRED_ON_CREATE.filter((field) => isBlank(body[field]));
        if (missing.length) {
            return { error: `Missing required fields: ${missing.join(', ')}` };
        }
    }

    for (const field of ['scholarshipName', 'universityName', 'universityCountry', 'universityCity', 'subjectCategory', 'description']) {
        if (body[field] === undefined) continue;
        if (typeof body[field] !== 'string' || (field !== 'description' && !body[field].trim())) {
            return { error: `${field} must be non-empty text` };
        }
        data[field] = body[field].trim();
    }
    if (data.description !== undefined && data.description.length < 20) {
        return { error: 'Description must be at least 20 characters' };
    }

    if (body.scholarshipCategory !== undefined) {
        if (!SCHOLARSHIP_CATEGORIES.includes(body.scholarshipCategory)) {
            return { error: 'Funding type must be Full fund, Partial fund or Self-fund' };
        }
        data.scholarshipCategory = body.scholarshipCategory;
    }

    if (body.universityRank !== undefined) {
        const rank = Number(body.universityRank);
        if (!Number.isInteger(rank) || rank < 1) return { error: 'World rank must be a whole number of 1 or more' };
        data.universityRank = rank;
    }

    for (const field of ['tuitionFees', 'applicationFees', 'serviceCharge']) {
        if (body[field] === undefined) continue;
        const amount = isBlank(body[field]) ? 0 : Number(body[field]);
        if (!Number.isFinite(amount) || amount < 0) return { error: `${field} must be 0 or more` };
        data[field] = Math.round(amount * 100) / 100;
    }

    if (body.numberOfAwards !== undefined) {
        if (isBlank(body.numberOfAwards)) {
            data.numberOfAwards = null;
        } else {
            const awards = Number(body.numberOfAwards);
            if (!Number.isInteger(awards) || awards < 1) return { error: 'Number of awards must be a whole number of 1 or more' };
            data.numberOfAwards = awards;
        }
    }

    for (const field of ['universityImage', 'officialWebsite']) {
        if (body[field] === undefined) continue;
        if (isBlank(body[field])) {
            data[field] = '';
        } else if (typeof body[field] !== 'string' || !URL_PATTERN.test(body[field].trim())) {
            return { error: `${field === 'universityImage' ? 'Logo' : 'Website'} must be a valid http(s) link` };
        } else {
            data[field] = body[field].trim();
        }
    }

    if (body.applicationDeadline !== undefined) {
        if (typeof body.applicationDeadline !== 'string' || !DATE_PATTERN.test(body.applicationDeadline)) {
            return { error: 'Deadline must be a date (YYYY-MM-DD)' };
        }
        if (isCreate && body.applicationDeadline < todayString()) {
            return { error: 'Deadline cannot be in the past' };
        }
        data.applicationDeadline = body.applicationDeadline;
    }

    if (body.studyStartDate !== undefined) {
        if (isBlank(body.studyStartDate)) {
            data.studyStartDate = '';
        } else if (typeof body.studyStartDate !== 'string' || !DATE_PATTERN.test(body.studyStartDate)) {
            return { error: 'Study start must be a date (YYYY-MM-DD)' };
        } else {
            data.studyStartDate = body.studyStartDate;
        }
    }
    if (data.studyStartDate && data.applicationDeadline && data.studyStartDate <= data.applicationDeadline) {
        return { error: 'Study start must be after the application deadline' };
    }

    for (const [field, label] of [['eligibility', 'Eligibility'], ['requiredDocuments', 'Required documents']]) {
        if (body[field] === undefined) {
            if (isCreate) return { error: `${label} must list at least one item` };
            continue;
        }
        const list = textList(body[field], label);
        if (list.error) return list;
        if (list.value.length === 0) return { error: `${label} must list at least one item` };
        data[field] = list.value;
    }

    for (const [field, allowed, label] of [['degreeLevels', DEGREE_LEVELS, 'Degree levels'], ['benefits', BENEFITS, 'Benefits']]) {
        if (body[field] === undefined) continue;
        const list = textList(body[field], label);
        if (list.error) return list;
        if (list.value.some((item) => !allowed.includes(item))) {
            return { error: `${label} must be from: ${allowed.join(', ')}` };
        }
        data[field] = [...new Set(list.value)];
    }
    if (isCreate && (!data.degreeLevels || data.degreeLevels.length === 0)) {
        return { error: 'Pick at least one degree level' };
    }

    return { data };
};

const searchScholarships = async (req, res) => {
    const { search, subject, category, open, sort = 'newest' } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 9, 1), 50);

    if (!SORT_OPTIONS[sort]) {
        return res.status(400).send({ message: 'Invalid sort option' });
    }
    if (category && !SCHOLARSHIP_CATEGORIES.includes(category)) {
        return res.status(400).send({ message: 'Invalid scholarship category' });
    }

    const match = {};
    if (search && search.trim()) {
        const pattern = new RegExp(escapeRegex(search.trim()), 'i');
        match.$or = [
            { scholarshipName: pattern },
            { universityName: pattern },
            { subjectCategory: pattern },
            { universityCity: pattern },
            { universityCountry: pattern },
        ];
    }
    if (subject === OTHER_SUBJECTS) match.subjectCategory = { $nin: KNOWN_SUBJECTS };
    else if (subject) match.subjectCategory = subject;
    if (category) match.scholarshipCategory = category;
    if (open === 'true') match.applicationDeadline = { $gte: todayString() };

    try {
        const [result] = await scholarshipsCollection().aggregate([
            { $match: match },
            { $addFields: { scholarshipIdString: { $toString: '$_id' } } },
            {
                $lookup: {
                    from: 'reviews',
                    let: { scholarshipId: '$scholarshipIdString' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$universityId', '$$scholarshipId'] }, { $ne: ['$hidden', true] }] } } },
                        { $group: { _id: null, average: { $avg: ratingValue }, count: { $sum: 1 } } },
                    ],
                    as: 'ratingStats',
                },
            },
            {
                $addFields: {
                    rating: { $round: [{ $arrayElemAt: ['$ratingStats.average', 0] }, 1] },
                    reviewCount: { $ifNull: [{ $arrayElemAt: ['$ratingStats.count', 0] }, 0] },
                },
            },
            { $project: { ratingStats: 0, scholarshipIdString: 0 } },
            { $sort: SORT_OPTIONS[sort] },
            {
                $facet: {
                    items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                    total: [{ $count: 'count' }],
                },
            },
        ]).toArray();

        const total = result?.total?.[0]?.count || 0;
        res.send({
            items: result?.items || [],
            total,
            page,
            limit,
            totalPages: Math.max(Math.ceil(total / limit), 1),
        });
    } catch (error) {
        res.status(500).send({ message: 'Failed to search scholarships' });
    }
};

const getAllScholarships = async (req, res) => {
    if (req.query.page !== undefined) {
        return searchScholarships(req, res);
    }

    try {
        const result = await scholarshipsCollection().find().sort({ scholarshipPostDate: -1 }).toArray();
        res.send(await withRatings(result));
    } catch (error) {
        res.status(500).send({ message: 'Failed to load scholarships' });
    }
};

const getScholarshipFilters = async (req, res) => {
    try {
        const counts = await scholarshipsCollection().aggregate([
            { $group: { _id: '$subjectCategory', count: { $sum: 1 } } },
        ]).toArray();
        const countFor = (name) => counts.find((entry) => entry._id === name)?.count || 0;
        const othersCount = counts
            .filter((entry) => !KNOWN_SUBJECTS.includes(entry._id))
            .reduce((sum, entry) => sum + entry.count, 0);

        res.send({
            subjects: KNOWN_SUBJECTS.map((name) => ({ value: name, label: name, count: countFor(name) })),
            others: { value: OTHER_SUBJECTS, label: 'Others', count: othersCount },
            categories: SCHOLARSHIP_CATEGORIES,
        });
    } catch (error) {
        res.status(500).send({ message: 'Failed to load filters' });
    }
};

const getTopScholarships = async (req, res) => {
    try {
        const result = await scholarshipsCollection()
            .find()
            .sort({ applicationFees: 1, scholarshipPostDate: -1 })
            .limit(6)
            .toArray();
        res.send(await withRatings(result));
    } catch (error) {
        res.status(500).send({ message: 'Failed to load top scholarships' });
    }
};

const getScholarshipById = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    try {
        const result = await scholarshipsCollection().findOne({ _id: new ObjectId(id) });
        if (!result) {
            return res.status(404).send({ message: 'Scholarship not found' });
        }
        const [rated] = await withRatings([result]);
        res.send(rated);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load scholarship' });
    }
};

const createScholarship = async (req, res) => {
    const scholarship = req.body;

    const { data, error: validationError } = normalizeScholarship(scholarship || {}, { isCreate: true });
    if (validationError) {
        return res.status(400).send({ message: validationError });
    }

    try {
        const result = await scholarshipsCollection().insertOne({
            tuitionFees: 0,
            universityImage: '',
            officialWebsite: '',
            eligibility: [],
            requiredDocuments: [],
            benefits: [],
            numberOfAwards: null,
            studyStartDate: '',
            ...data,
            postedEmail: req.decoded.email,
            scholarshipPostDate: todayString(),
        });
        await logActivity(req, {
            action: 'scholarship.create',
            targetType: 'scholarship',
            targetId: result.insertedId,
            summary: `Added scholarship "${scholarship.scholarshipName}"`,
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to create scholarship' });
    }
};

const updateScholarship = async (req, res) => {
    const id = req.params.id;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    const { data: allowedUpdates, error: validationError } = normalizeScholarship(updates || {}, { isCreate: false });
    if (validationError) {
        return res.status(400).send({ message: validationError });
    }
    if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).send({ message: 'No editable fields were provided' });
    }

    try {
        const result = await scholarshipsCollection().updateOne(
            { _id: new ObjectId(id) },
            { $set: allowedUpdates }
        );
        if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'Scholarship not found' });
        }
        await logActivity(req, {
            action: 'scholarship.update',
            targetType: 'scholarship',
            targetId: id,
            summary: `Updated scholarship "${allowedUpdates.scholarshipName || id}"`,
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to update scholarship' });
    }
};

const deleteScholarship = async (req, res) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    try {
        const scholarship = await scholarshipsCollection().findOne({ _id: new ObjectId(id) });
        if (!scholarship) {
            return res.status(404).send({ message: 'Scholarship not found' });
        }
        const result = await scholarshipsCollection().deleteOne({ _id: new ObjectId(id) });
        await logActivity(req, {
            action: 'scholarship.delete',
            targetType: 'scholarship',
            targetId: id,
            summary: `Deleted scholarship "${scholarship.scholarshipName}"`,
        });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to delete scholarship' });
    }
};

module.exports = {
    getAllScholarships,
    getScholarshipFilters,
    getTopScholarships,
    getScholarshipById,
    createScholarship,
    updateScholarship,
    deleteScholarship,
};
