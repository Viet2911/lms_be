import twilio from 'twilio';

// Twilio config from environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Generate Twilio access token for browser
export const getToken = async (req, res, next) => {
    try {
        if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET) {
            return res.json({
                success: true,
                data: { token: null, message: 'Twilio not configured' }
            });
        }

        const identity = `user_${req.user.id}`;

        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: TWILIO_TWIML_APP_SID,
            incomingAllow: true
        });

        const token = new AccessToken(
            TWILIO_ACCOUNT_SID,
            TWILIO_API_KEY,
            TWILIO_API_SECRET,
            { identity: identity }
        );

        token.addGrant(voiceGrant);

        res.json({
            success: true,
            data: { token: token.toJwt() }
        });
    } catch (error) {
        console.error('Twilio token error:', error);
        res.json({ success: true, data: { token: null } });
    }
};

// Get call config
export const getConfig = async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: {
                from_number: TWILIO_PHONE_NUMBER || null,
                configured: !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY)
            }
        });
    } catch (error) {
        next(error);
    }
};

// TwiML endpoint for outbound calls
export const twiml = async (req, res, next) => {
    try {
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const response = new VoiceResponse();

        const to = req.body.To || req.query.To;

        if (to) {
            const dial = response.dial({
                callerId: TWILIO_PHONE_NUMBER
            });
            dial.number(to);
        } else {
            response.say('No phone number provided');
        }

        res.type('text/xml');
        res.send(response.toString());
    } catch (error) {
        next(error);
    }
};