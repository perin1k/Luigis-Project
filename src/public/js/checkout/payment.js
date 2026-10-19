// UI boundary only. A future, separately approved provider adapter replaces this.
// No card data, payment requests, order submission, or success simulation.
export async function openSecureCheckout() {
  throw new Error('We couldn’t open secure checkout. Your selections are still here. Please try again.');
}
