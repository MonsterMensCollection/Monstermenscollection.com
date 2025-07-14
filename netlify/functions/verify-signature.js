// netlify/functions/verify-signature.js  (CJS version)

const admin     = require("firebase-admin");
const Razorpay  = require("razorpay");

/* ---------- initialise helpers ---------- */
admin.initializeApp();                            // uses the service-account env vars
const db  = admin.firestore();
const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* ---------- POST /verify-signature ---------- */
exports.handler = async (event) => {
  try {
    /* 1️⃣  grab payload sent from razorpay-success.html */
    const { payId, ordId, sign, cart, addr, uid, totals } = JSON.parse(event.body);

    /* 2️⃣  verify signature – NOTE the **rzp** utils object */
    rzp.utils.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign,
    });

    /* 3️⃣  lock stock atomically on the server side ---------------- */
    await finalizeOrderStockServerSide(cart);      // <- helper is inlined below

    /* 4️⃣  create the order document -------------------------------- */
    await db.collection("orders").add({
      uid,
      cart,
      ...addr,                                     // name, address, pin, phone
      totalUSD  : totals.usd,
      total     : totals.sel,
      currency  : totals.curr,
      paymentId : payId,
      paymentMode:"Razorpay",
      timestamp : admin.firestore.FieldValue.serverTimestamp(),
      orderNumber:`ORD-${Date.now()}`,
    });

    return { statusCode: 200 };
  } catch (err) {
    console.error("verify-signature failed:", err);
    return { statusCode: 400, body: err.message };
  }
};

/* ---------- helper: decrement sizes in a single batch ------------- */
async function finalizeOrderStockServerSide(cart) {
  const batch = db.batch();

  cart.forEach(({ docId, size }) => {
    if (!docId || !size) return;                   // safety check
    const ref = db.collection("products").doc(docId);
    batch.update(ref, {
      [`sizes.${size}`]: admin.firestore.FieldValue.increment(-1),
    });
  });

  await batch.commit();                            // throws if any path missing
}
