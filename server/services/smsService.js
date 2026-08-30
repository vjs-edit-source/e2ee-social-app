// SMS Gateway Dispatcher (Fast2SMS for India, Twilio for Global)

let dynamicFast2SmsKey = process.env.FAST2SMS_API_KEY || '';
let dynamicTwilioSid = process.env.TWILIO_ACCOUNT_SID || '';
let dynamicTwilioToken = process.env.TWILIO_AUTH_TOKEN || '';
let dynamicTwilioFrom = process.env.TWILIO_PHONE_NUMBER || '';

export function setSmsConfig({ fast2SmsKey, twilioSid, twilioToken, twilioFrom }) {
  if (fast2SmsKey !== undefined) dynamicFast2SmsKey = fast2SmsKey.trim();
  if (twilioSid !== undefined) dynamicTwilioSid = twilioSid.trim();
  if (twilioToken !== undefined) dynamicTwilioToken = twilioToken.trim();
  if (twilioFrom !== undefined) dynamicTwilioFrom = twilioFrom.trim();
}

export function getSmsConfigStatus() {
  return {
    fast2SmsConfigured: Boolean(dynamicFast2SmsKey),
    twilioConfigured: Boolean(dynamicTwilioSid && dynamicTwilioToken && dynamicTwilioFrom)
  };
}

/**
 * Dispatches a 6-digit verification code to the target phone number.
 * @param {string} phone - Full phone number with country code (e.g. "+918926258602")
 * @param {string} otp - 6-digit numeric OTP code
 */
export async function sendSmsOtp(phone, otp) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const digitsOnly = phone.replace(/\D/g, '');

  console.log(`📱 [SMS Gateway] Dispatching OTP [${otp}] to ${cleanPhone}...`);

  // 1. Fast2SMS (Preferred for India +91)
  if (dynamicFast2SmsKey && (cleanPhone.startsWith('+91') || digitsOnly.length === 10)) {
    const indianNumber = digitsOnly.slice(-10);
    try {
      console.log(`[Fast2SMS] Sending OTP to 10-digit Indian number: ${indianNumber}`);
      const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': dynamicFast2SmsKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variables_values: otp,
          route: 'otp',
          numbers: indianNumber
        })
      });

      const data = await res.json();
      console.log('[Fast2SMS Response]', data);
      if (data.return === true || data.status_code === 200) {
        return {
          success: true,
          gateway: 'Fast2SMS',
          message: 'SMS sent successfully to your mobile phone!'
        };
      } else {
        console.warn('[Fast2SMS Warning]', data.message);
      }
    } catch (err) {
      console.error('[Fast2SMS Error]', err);
    }
  }

  // 2. Twilio (Global carrier fallback)
  if (dynamicTwilioSid && dynamicTwilioToken && dynamicTwilioFrom) {
    try {
      console.log(`[Twilio] Sending OTP via Twilio to ${cleanPhone}`);
      const body = new URLSearchParams({
        To: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
        From: dynamicTwilioFrom,
        Body: `Your SadiSocial verification code is: ${otp}. Valid for 5 minutes. Do not share.`
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${dynamicTwilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${dynamicTwilioSid}:${dynamicTwilioToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const twilioData = await res.json();
      if (res.ok && !twilioData.error_code) {
        return {
          success: true,
          gateway: 'Twilio',
          message: 'SMS sent successfully to your mobile phone!'
        };
      } else {
        console.warn('[Twilio Warning]', twilioData.message);
      }
    } catch (err) {
      console.error('[Twilio Error]', err);
    }
  }

  // 3. Fallback: Instant delivery simulation / dev mode
  return {
    success: true,
    gateway: 'DevGateway',
    isDevPreview: true,
    testOtp: otp,
    message: `Verification code generated for ${cleanPhone}.`
  };
}
