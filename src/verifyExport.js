import { exportData } from './controllers/adminController.js';

// Mock Response object
const res = {
    setHeader: (key, value) => {
        console.log(`[Header] ${key}: ${value}`);
    },
    status: (code) => {
        console.log(`[Status] ${code}`);
        return res;
    },
    json: (data) => {
        console.log('[JSON Response]', data);
    },
    end: () => {
        console.log('[End] Response ended.');
    },
    write: (chunk) => {
        // Just simulate writing
    },
    on: (event, cb) => {
        // simulate event listener
    },
    once: (event, cb) => {

    },
    emit: (event) => {

    }
};

// Mock Prisma (partially, since we are importing the real one which might try to connect)
// If real prisma connects, it will need DB access.
// Let's see if we can run this. If prisma fails to connect, we might need to mock it.
// For now, let's try running it. If it connects to dev DB, that's fine.

async function runVerify() {
    console.log('Starting verification...');
    try {
        await exportData({}, res);
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

runVerify();
