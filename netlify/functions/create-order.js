const Razorpay = require("razorpay");

const rzp = new Razorpay({
  key_id:     process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // amount comes from the SPA in *USD cents*
    const { amount } = JSON.parse(event.body || "{}");

    const order = await rzp.orders.create({
      amount,                 // 1234 = USD 12.34
      currency: "USD",        // PayPal wallet insists on USD
      receipt : `rcpt_${Date.now()}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        id:       order.id,
        amount:   order.amount,
        currency: order.currency,   // → "USD"
      }),
    };
  } catch (err) {
    console.error("create‑order failed:", err);
    return { statusCode: 500, body: err.message };
  }
};
