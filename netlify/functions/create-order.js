const Razorpay = require("razorpay");

exports.handler = async (event) => {
  try {
    const { amount, currency } = JSON.parse(event.body || "{}");   // amount in *cents*
    const razorpay = new Razorpay({
      key_id    : process.env.RZP_KEY,
      key_secret: process.env.RZP_SECRET
    });

    const order = await razorpay.orders.create({
      amount,                    // e.g. $35.20  →  3520
      currency,                  // "USD"
      payment_capture: 1
    });

    return { statusCode: 200, body: JSON.stringify(order) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
