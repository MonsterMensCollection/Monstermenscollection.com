// netlify/functions/verify-signature.js
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

exports.handler = async (event) => {
  try {
    const { payId, ordId, sign } = JSON.parse(event.body);

    razorpay.utils.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign,
    });

    return { statusCode: 200 };
  } catch (err) {
    return { statusCode: 400 };
  }
};
