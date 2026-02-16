const KEY = "food_cart_v1";

export function getCart() {
  if (typeof window === "undefined") return { restaurantId: null, items: [] };
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { restaurantId: null, items: [] };
  } catch {
    return { restaurantId: null, items: [] };
  }
}

export function saveCart(cart) {
  localStorage.setItem(KEY, JSON.stringify(cart));
}

export function clearCart() {
  localStorage.removeItem(KEY);
}

export function addToCart({ restaurantId, item }) {
  const cart = getCart();

  // Only allow items from one restaurant (like Swiggy/Zomato)
  if (cart.restaurantId && cart.restaurantId !== restaurantId) {
    return { ok: false, message: "Cart has items from another restaurant. Clear cart first." };
  }

  cart.restaurantId = restaurantId;

  const found = cart.items.find((x) => x.id === item.id);
  if (found) found.qty += 1;
  else cart.items.push({ ...item, qty: 1 });

  saveCart(cart);
  return { ok: true };
}

export function updateQty(itemId, qty) {
  const cart = getCart();
  cart.items = cart.items
    .map((x) => (x.id === itemId ? { ...x, qty } : x))
    .filter((x) => x.qty > 0);

  if (cart.items.length === 0) cart.restaurantId = null;

  saveCart(cart);
  return cart;
}

export function cartTotal(cart) {
  return (cart.items || []).reduce((sum, x) => sum + Number(x.price) * Number(x.qty), 0);
}
