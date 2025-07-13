// /netlify/functions/verify-signature.js
const crypto  = require("crypto");
const admin   = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function verify({ payId, ordId, sign }) {
  return (
    crypto
      .createHmac("sha256", process.env.RZP_KEY_SECRET)
      .update(`${ordId}|${payId}`)
      .digest("hex") === sign
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405 };

  const { payId, ordId, sign } = JSON.parse(event.body || "{}");
  if (!verify({ payId, ordId, sign }))
    return { statusCode: 400, body: "Bad signature" };

  const ref = db.collection("orders").doc(ordId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Order not found");
    if (snap.data().status === "PAID") return;     // idempotent

    for (const { docId, size } of snap.data().cart) {
      tx.update(db.collection("products").doc(docId), {
        [`sizes.${size}`]: FieldValue.increment(-1),
      });
    }
    tx.update(ref, {
      status    : "PAID",
      payment_id: payId,
      paidAt    : FieldValue.serverTimestamp(),
    });
  });

  return { statusCode: 200, body: "OK" };
};

