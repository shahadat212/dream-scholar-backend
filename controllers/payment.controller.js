const { ObjectId } = require('mongodb');
const Stripe = require('stripe');
const { getDB } = require('../config/db');

const paymentsCollection = () => getDB().collection('payments');
const scholarshipsCollection = () => getDB().collection('scholarships');
const applicationsCollection = () => getDB().collection('applications');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_MINIMUM_CENTS = 50;

const todayString = () => new Date().toISOString().split('T')[0];
const totalCents = (scholarship) => Math.round(((Number(scholarship.applicationFees) || 0) + (Number(scholarship.serviceCharge) || 0)) * 100);

const findScholarship = async (scholarshipId) => {
    if (!ObjectId.isValid(scholarshipId)) {
        return { status: 400, message: 'Invalid scholarship id' };
    }
    const scholarship = await scholarshipsCollection().findOne({ _id: new ObjectId(scholarshipId) });
    if (!scholarship) {
        return { status: 404, message: 'Scholarship not found' };
    }
    return { scholarship };
};

const getAllPayments = async (req, res) => {
    try {
        const result = await paymentsCollection().find().sort({ date: -1 }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to load payments' });
    }
};

const createPaymentIntent = async (req, res) => {
    const scholarshipId = req.body?.scholarshipId;

    try {
        const found = await findScholarship(scholarshipId);
        if (found.status) {
            return res.status(found.status).send({ message: found.message });
        }
        const { scholarship } = found;

        if (scholarship.applicationDeadline && scholarship.applicationDeadline < todayString()) {
            return res.status(400).send({ message: 'The application deadline for this scholarship has passed' });
        }

        const existing = await applicationsCollection().findOne({ userEmail: req.decoded.email, scholarShipId: String(scholarshipId) });
        if (existing) {
            return res.status(409).send({ message: 'You have already applied to this scholarship' });
        }

        const amount = totalCents(scholarship);
        if (amount === 0) {
            return res.send({ free: true, amount: 0 });
        }
        if (amount < STRIPE_MINIMUM_CENTS) {
            return res.status(400).send({ message: 'The total fee is below the minimum card payment of $0.50' });
        }
        if (!stripe) {
            return res.status(503).send({ message: 'Card payments are not configured on the server' });
        }

        const intent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            payment_method_types: ['card'],
            description: `Application for ${scholarship.scholarshipName}`,
            metadata: {
                scholarshipId: String(scholarship._id),
                userEmail: req.decoded.email,
            },
        });

        res.send({ clientSecret: intent.client_secret, amount: amount / 100 });
    } catch (error) {
        res.status(500).send({ message: 'Could not start the payment' });
    }
};

const createPayment = async (req, res) => {
    const { scholarshipId, paymentIntentId } = req.body || {};

    try {
        const found = await findScholarship(scholarshipId);
        if (found.status) {
            return res.status(found.status).send({ message: found.message });
        }
        const { scholarship } = found;
        const expectedCents = totalCents(scholarship);

        if (!paymentIntentId) {
            if (expectedCents !== 0) {
                return res.status(400).send({ message: 'A completed card payment is required' });
            }
            const result = await paymentsCollection().insertOne({
                studentEmail: req.decoded.email,
                scholarshipId: String(scholarship._id),
                scholarshipName: scholarship.scholarshipName,
                amount: 0,
                transactionId: `free-${new ObjectId()}`,
                date: todayString(),
            });
            return res.send(result);
        }

        if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
            return res.status(400).send({ message: 'Invalid payment reference' });
        }
        if (!stripe) {
            return res.status(503).send({ message: 'Card payments are not configured on the server' });
        }

        const recorded = await paymentsCollection().findOne({ transactionId: paymentIntentId });
        if (recorded) {
            if (recorded.studentEmail !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            return res.send({ insertedId: recorded._id, alreadyRecorded: true });
        }

        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'succeeded') {
            return res.status(400).send({ message: 'This payment has not been completed' });
        }
        if (intent.metadata?.userEmail !== req.decoded.email || intent.metadata?.scholarshipId !== String(scholarship._id)) {
            return res.status(403).send({ message: 'This payment does not belong to this application' });
        }
        if (intent.amount !== expectedCents || intent.currency !== 'usd') {
            return res.status(400).send({ message: 'The paid amount does not match the application fee' });
        }

        const result = await paymentsCollection().insertOne({
            studentEmail: req.decoded.email,
            scholarshipId: String(scholarship._id),
            scholarshipName: scholarship.scholarshipName,
            amount: intent.amount / 100,
            transactionId: intent.id,
            date: todayString(),
        });
        res.send(result);
    } catch (error) {
        if (error?.code === 11000) {
            return res.send({ alreadyRecorded: true });
        }
        if (error?.type === 'StripeInvalidRequestError') {
            return res.status(400).send({ message: 'Payment reference not found' });
        }
        res.status(500).send({ message: 'Failed to record payment' });
    }
};

module.exports = { getAllPayments, createPaymentIntent, createPayment };
