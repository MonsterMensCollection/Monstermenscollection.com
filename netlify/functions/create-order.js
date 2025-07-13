import Razorpay from "razorpay";

const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET
});

export async function handler(event) {
  const { amount, currency } = JSON.parse(event.body);

  try {
    const order = await rzp.orders.create({
      amount,
      currency,
      payment_capture: 1
    });
    return {
      statusCode: 200,
      body      : JSON.stringify({ id: order.id })
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
}
