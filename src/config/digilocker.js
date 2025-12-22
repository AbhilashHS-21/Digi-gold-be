import dotenv from 'dotenv';
dotenv.config();

export const DIGILOCKER_CONFIG = {
    clientId: process.env.DIGILOCKER_CLIENT_ID,
    clientSecret: process.env.DIGILOCKER_CLIENT_SECRET,
    redirectUri: process.env.DIGILOCKER_REDIRECT_URI || 'http://localhost:3000/api/kyc/callback',
    authUrl: 'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize',
    tokenUrl: 'https://digilocker.meripehchaan.gov.in/public/oauth2/1/token',
    apiBaseUrl: 'https://api.digitallocker.gov.in/public/oauth2/1',
    scope: 'AADHAAR PAN'
};
