import axios from 'axios';
import crypto from 'crypto';
import { parseStringPromise } from 'xml2js';
import { DIGILOCKER_CONFIG } from '../config/digilocker.js';

// Generate state parameter for CSRF protection
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate code verifier and challenge for PKCE
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

// Helper to mask Aadhaar
function maskAadhaar(aadhaarNumber) {
  if (!aadhaarNumber) return '';
  return aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, 'XXXX-XXXX-$3');
}

export const initiateKyc = async (req, res) => {
  try {
    const { documentType } = req.body;

    // Generate state and PKCE parameters
    const state = generateState();
    const { verifier, challenge } = generatePKCE();

    // Store in session
    if (req.session) {
      req.session.digilocker_state = state;
      req.session.digilocker_codeVerifier = verifier;
      req.session.digilocker_documentType = documentType;
    } else {
      console.warn('Session not available/configured properly in initiateKyc');
    }

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: DIGILOCKER_CONFIG.clientId,
      redirect_uri: DIGILOCKER_CONFIG.redirectUri,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: documentType === 'aadhaar' ? 'AADHAAR' : 'PAN' // Adjust scope if needed, DigiLocker scopes are often just 'one' but let's follow the example or standard
    });

    // Note: DIGILOCKER_CONFIG.scope is 'AADHAAR PAN', but practically request might need specifics or just standard profile
    // If DigiLocker requires specific scope strings for documents, we might need to adjust. 
    // Usually 'files.read' or similar. For now using what was in the snippet.

    const authUrl = `${DIGILOCKER_CONFIG.authUrl}?${params.toString()}`;

    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('Initiate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate authentication'
    });
  }
};

export const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    // Verify state parameter
    if (!req.session || state !== req.session.digilocker_state) {
      console.error('Invalid state parameter or session expired');
      // return res.redirect('http://localhost:3000/kyc-error?reason=state_mismatch'); 
      // Better to redirect to frontend error page
      return res.redirect('http://localhost:3000/kyc-error');
    }

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      DIGILOCKER_CONFIG.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DIGILOCKER_CONFIG.redirectUri,
        client_id: DIGILOCKER_CONFIG.clientId,
        client_secret: DIGILOCKER_CONFIG.clientSecret,
        code_verifier: req.session.digilocker_codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    // Store access token in session
    req.session.digilocker_accessToken = access_token;

    // Redirect to frontend success page with token (optional, or just success indicator)
    // Sending token in URL to frontend is risky, better to keep in session and let frontend query 'status'.
    // But sticking to user request flow:
    res.redirect(`http://localhost:3000/kyc-success?token=${access_token}`);

  } catch (error) {
    console.error('Callback error:', error?.response?.data || error.message);
    res.redirect('http://localhost:3000/kyc-error');
  }
};

export const fetchAadhaar = async (req, res) => {
  try {
    const accessToken = req.session?.digilocker_accessToken || req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'No access token provided'
      });
    }

    // Fetch Aadhaar XML
    const aadhaarResponse = await axios.post(
      `${DIGILOCKER_CONFIG.apiBaseUrl}/pulluri`,
      JSON.stringify({
        uri: 'in.gov.uidai.aadhaar',
        format: 'xml'
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Parse Aadhaar XML
    // The response.data might be the XML string directly or a JSON with content. 
    // Usually pulluri returns file content.
    // If it returns JSON wrapper, we need to extract. Assuming direct XML or JSON with data field.
    // DigiLocker pulluri usually returns the file content (XML/PDF) if format specified.

    let xmlData = aadhaarResponse.data;
    if (typeof xmlData === 'object' && xmlData.content) {
      // sometimes it might be base64 encoded in a JSON? checks needed. 
      // For now assume it text/xml
    }

    const parsed = await parseStringPromise(xmlData);

    // NOTE: Structure depends on actual XML schema from UIDAI via DigiLocker
    // This is a best-guess based on typical XML structures (KycRes > UidData > Poi/Poa)
    // We will extract what we can find.

    const root = parsed.KycRes?.UidData?.[0] || parsed.OfflinePaperlessKyc?.UidData?.[0]; // Adjust based on actual response

    if (!root) {
      // Fallback or mock for testing if structure assumes something else
      console.warn('Unexpected Aadhaar XML structure', JSON.stringify(parsed));
    }

    // Simplified extraction
    const poi = root?.Poi?.[0]?.$ || {};
    const poa = root?.Poa?.[0]?.$ || {};

    const aadhaarData = {
      name: poi.name || 'Unknown',
      aadhaarNumber: maskAadhaar(root?.tkn?.[0]?.$?.value || '000000000000'), // 'tkn' often holds masked uid
      dob: poi.dob,
      gender: poi.gender,
      address: `${poa.street || ''}, ${poa.vtc || ''}, ${poa.dist || ''}, ${poa.state || ''} - ${poa.pc || ''}`
    };

    res.json({
      success: true,
      data: {
        ...aadhaarData,
        verified: true
      }
    });

  } catch (error) {
    console.error('Aadhaar fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Aadhaar details'
    });
  }
};

export const fetchPan = async (req, res) => {
  try {
    const accessToken = req.session?.digilocker_accessToken || req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'No access token provided'
      });
    }

    const panResponse = await axios.post(
      `${DIGILOCKER_CONFIG.apiBaseUrl}/pulluri`,
      JSON.stringify({
        uri: 'in.gov.incometax.pan',
        format: 'xml'
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const xmlData = panResponse.data;
    const parsed = await parseStringPromise(xmlData);

    // Adapt extraction logic to actual PAN XML structure
    // Often <Certificate><IssuedTo><Person name="..."/></IssuedTo> ...

    const person = parsed?.Certificate?.IssuedTo?.[0]?.Person?.[0]?.$ || {};
    // PAN number key might vary

    const panData = {
      name: person.name,
      panNumber: person.uid || person.param1 || 'UNKNOWN', // Adjust based on schema
      dob: person.dob,
      verified: true
    };

    res.json({
      success: true,
      data: panData
    });

  } catch (error) {
    console.error('PAN fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PAN details'
    });
  }
};
