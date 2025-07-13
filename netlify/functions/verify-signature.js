/* /netlify/functions/verify-signature.js */
const Razorpay = require("razorpay");

/* Netlify gives you env vars via process.env */
const razorpay = new Razorpay({
  key_id    : process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { payId, ordId, sign } = JSON.parse(event.body);

    razorpay.utils.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign
    });

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    return { statusCode: 400, body: "Signature mismatch" };
  }
};
