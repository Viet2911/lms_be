import { RestClient } from '@signalwire/compatibility-api';

// SignalWire config from environment
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL;
const SIGNALWIRE_PHONE_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER;

// Initialize SignalWire client
const getClient = () => {
    if (!SIGNALWIRE_PROJECT_ID || !SIGNALWIRE_API_TOKEN || !SIGNALWIRE_SPACE_URL) {
        return null;
    }
    return RestClient(SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, { signalwireSpaceUrl: SIGNALWIRE_SPACE_URL });
};

// Get call config
export const getConfig = async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: {
                from_number: SIGNALWIRE_PHONE_NUMBER || null,
                configured: !!(SIGNALWIRE_PROJECT_ID && SIGNALWIRE_API_TOKEN && SIGNALWIRE_SPACE_URL)
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get token for browser (SignalWire uses different approach - we'll use REST API for calls)
export const getToken = async (req, res, next) => {
    try {
        // SignalWire browser calling requires different setup
        // For now, return config status - calls will be made via backend API
        res.json({
            success: true,
            data: {
                configured: !!(SIGNALWIRE_PROJECT_ID && SIGNALWIRE_API_TOKEN),
                useBackendCall: true // Flag to tell frontend to use backend API for calls
            }
        });
    } catch (error) {
        console.error('SignalWire config error:', error);
        res.json({ success: true, data: { configured: false } });
    }
};

// Make outbound call via backend
export const makeCall = async (req, res, next) => {
    try {
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({ success: false, message: 'Số điện thoại không được để trống' });
        }

        const client = getClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'SignalWire chưa được cấu hình' });
        }

        // Format phone number
        let formattedTo = to.replace(/[^0-9+]/g, '');
        if (formattedTo.startsWith('0')) {
            formattedTo = '+84' + formattedTo.substring(1);
        } else if (!formattedTo.startsWith('+')) {
            formattedTo = '+' + formattedTo;
        }

        const call = await client.calls.create({
            url: `https://${req.get('host')}/api/call/twiml?To=${encodeURIComponent(formattedTo)}`,
            to: formattedTo,
            from: SIGNALWIRE_PHONE_NUMBER
        });

        res.json({
            success: true,
            data: {
                callSid: call.sid,
                status: call.status,
                to: formattedTo
            }
        });
    } catch (error) {
        console.error('SignalWire call error:', error);
        res.status(500).json({ success: false, message: error.message || 'Lỗi khi gọi điện' });
    }
};

// TwiML endpoint for calls (SignalWire compatible)
export const twiml = async (req, res, next) => {
    try {
        const to = req.body.To || req.query.To;

        let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

        if (to) {
            xml += `<Dial callerId="${SIGNALWIRE_PHONE_NUMBER}"><Number>${to}</Number></Dial>`;
        } else {
            xml += '<Say language="vi-VN">Không có số điện thoại</Say>';
        }

        xml += '</Response>';

        res.type('text/xml');
        res.send(xml);
    } catch (error) {
        next(error);
    }
};

// Get call status
export const getCallStatus = async (req, res, next) => {
    try {
        const { callSid } = req.params;

        const client = getClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'SignalWire chưa được cấu hình' });
        }

        const call = await client.calls(callSid).fetch();

        res.json({
            success: true,
            data: {
                status: call.status,
                duration: call.duration
            }
        });
    } catch (error) {
        console.error('Get call status error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};