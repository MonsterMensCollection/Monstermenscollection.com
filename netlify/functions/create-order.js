const Razorpay = require('razorpay');

exports.handler = async (event) => {
  try {
    const { amountUSD = 0 } = JSON.parse(event.body);

    const raz = new Razorpay({
      key_id    : process.env.RZP_KEY,      // set in Netlify UI
      key_secret: process.env.RZP_SECRET
    });

    const order = await raz.orders.create({
      amount         : Math.round(amountUSD * 100), // smallest unit, e.g. 23.50 USD → 2350
      currency       : 'USD',                       // or 'EUR'
      payment_capture: 1
    });

    return { statusCode: 200, body: JSON.stringify(order) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
