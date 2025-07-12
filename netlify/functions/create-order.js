/* eslint-disable */
const Razorpay = require("razorpay");          // CommonJS works fine in Netlify
const rzp = new Razorpay({
  key_id    : process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

exports.handler = async (event) => {
  // allow browser POSTs from anywhere your site is served
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { amount, currency } = JSON.parse(event.body); // paise / cents
    const order = await rzp.orders.create({
      amount,                   // integer
      currency,                 // "USD" / "EUR" / …
      payment_capture: 1,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),               // { id, amount, currency, … }
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create order" }),
    };
  }
};
