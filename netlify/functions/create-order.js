// netlify/functions/create-order.js
const Razorpay = require("razorpay");

/* ── 1. instantiate the SDK once ─────────────────────────────── */
const rzp = new Razorpay({
  key_id: process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* ── 2. Lambda entry-point ───────────────────────────────────── */
exports.handler = async (event) => {
  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { amount, currency } = JSON.parse(event.body || "{}");

    /* create the Razorpay order (amount is in the *smallest* unit) */
    const order = await rzp.orders.create({
      amount,
      currency,
      payment_capture: 1, // auto-capture
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ id: order.id }),
    };
  } catch (err) {
    console.error("create-order failed:", err);
    return { statusCode: 500, body: err.message };
  }
};
