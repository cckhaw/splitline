import Stripe from "stripe";

let stripeClient;

export function stripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set. See README.md for how to configure it.");
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}
