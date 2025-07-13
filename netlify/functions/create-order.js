import Razorpay from "razorpay";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

export async function handler(event) {
  if (event.httpMethod !== "POST")
    return { statusCode: 405 };

  const {
    cart        = [],
    address     = {},
    currency    = "INR",
    uid         = null,
  } = JSON.parse(event.body || "{}");

  try {
    // 1️⃣  Re-price every item on the server
    const items = await Promise.all(
      cart.map(async (it) => {
        const snap = await db.collection("products").doc(it.docId).get();
        if (!snap.exists)
          throw new Error("Product not found: " + it.docId);

        const priceUSD = snap.data().priceUSD;
        return { ...it, price: priceUSD };
      })
    );

    const subtotalUSD = items.reduce((s, i) => s + i.price, 0);
    const amount      = Math.round(subtotalUSD * 100);   // in paise/cents

    // 2️⃣  Create Razorpay order
    const order = await rzp.orders.create({
      amount,
      currency,
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    });

    // 3️⃣  Store provisional order in Firestore
    await db.collection("orders").doc(order.id).set({
      uid,
      cart     : items,
      address,
      amountUSD: subtotalUSD,
      amount,
      currency,
      status   : "INITIATED",
      createdAt: Timestamp.now(),
    });

    // 4️⃣  Respond to client
    return {
      statusCode: 200,
      body      : JSON.stringify({ order_id: order.id, amount }),
    };

  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
}
