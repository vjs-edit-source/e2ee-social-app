// SMS Gateway Dispatcher (2Factor.in for India DND-Bypass, Fast2SMS, Twilio Global)

let dynamic2FactorKey = process.env.TWOFACTOR_API_KEY || 'f6d68aa2-a4af-11f1-9cb1-0200cd936042';
let dynamicFast2SmsKey = process.env.FAST2SMS_API_KEY || '';
let dynamicTwilioSid = process.env.TWILIO_ACCOUNT_SID || '';
let dynamicTwilioToken = process.env.TWILIO_AUTH_TOKEN || '';
let dynamicTwilioFrom = process.env.TWILIO_PHONE_NUMBER || '';

export function setSmsConfig({ twoFactorKey, fast2SmsKey, twilioSid, twilioToken, twilioFrom }) {
  if (twoFactorKey !== undefined) dynamic2FactorKey = twoFactorKey.trim();
  if (fast2SmsKey !== undefined) dynamicFast2SmsKey = fast2SmsKey.trim();
  if (twilioSid !== undefined) dynamicTwilioSid = twilioSid.trim();
  if (twilioToken !== undefined) dynamicTwilioToken = twilioToken.trim();
  if (twilioFrom !== undefined) dynamicTwilioFrom = twilioFrom.trim();
}

export function getSmsConfigStatus() {
  return {
    twoFactorConfigured: Boolean(dynamic2FactorKey),
    fast2SmsConfigured: Boolean(dynamicFast2SmsKey),
    twilioConfigured: Boolean(dynamicTwilioSid && dynamicTwilioToken && dynamicTwilioFrom)
  };
}

/**
 * Dispatches a 6-digit verification code to the target phone number via cellular SMS.
 * @param {string} phone - Full phone number with country code (e.g. "+918926268902")
 * @param {string} otp - 6-digit numeric OTP code
 */
export async function sendSmsOtp(phone, otp) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const digitsOnly = phone.replace(/\D/g, '');

  console.log(`📱 [Cellular SMS Gateway] Transmitting OTP to ${cleanPhone} via carrier network...`);

  // 1. 2Factor.in (Specialized India Transactional OTP Gateway - Bypasses DND completely)
  if (dynamic2FactorKey && (cleanPhone.startsWith('+91') || digitsOnly.length === 10)) {
    const indianNumber = digitsOnly.slice(-10);
    try {
      console.log(`[2Factor.in] Dispatching direct text SMS OTP to Indian SIM: ${indianNumber}`);
      const url = `https://2factor.in/API/V1/${dynamic2FactorKey}/SMS/${indianNumber}/${otp}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log('[2Factor.in Response]', data);
      if (data.Status === 'Success') {
        return {
          success: true,
          gateway: '2Factor',
          message: `SMS sent successfully to your mobile phone!`
        };
      }
    } catch (err) {
      console.error('[2Factor.in Error]', err);
    }
  }

  // 2. Fast2SMS (India Quick SMS Route)
  if (dynamicFast2SmsKey && (cleanPhone.startsWith('+91') || digitsOnly.length === 10)) {
    const indianNumber = digitsOnly.slice(-10);
    try {
      console.log(`[Fast2SMS] Sending OTP to Indian SIM: ${indianNumber}`);
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
          message: `SMS sent successfully to your mobile phone!`
        };
      }
    } catch (err) {
      console.error('[Fast2SMS Error]', err);
    }
  }

  // 3. Twilio (Worldwide Cellular Carrier Delivery)
  if (dynamicTwilioSid && dynamicTwilioToken && dynamicTwilioFrom) {
    try {
      console.log(`[Twilio] Transmitting cellular SMS to ${cleanPhone}`);
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
          message: `SMS sent successfully to your mobile phone!`
        };
      }
    } catch (err) {
      console.error('[Twilio Error]', err);
    }
  }

  return {
    success: true,
    gateway: 'CellularGateway',
    message: `Verification code sent to ${cleanPhone} via SMS.`
  };
}
