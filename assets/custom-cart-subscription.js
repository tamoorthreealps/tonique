/**
 * CartSubscriptionSelector
 * Custom element that handles changing a subscription selling plan from the cart drawer.
 * Shown only when a product has more than one available selling plan.
 *
 * Flow: remove line at index → add back with new selling_plan → refresh cart drawer items.
 */
class CartSubscriptionSelector extends HTMLElement {
  connectedCallback() {
    this._select = this.querySelector('select');
    if (this._select) {
      this._select.addEventListener('change', this._onChange.bind(this));
    }
  }

  async _onChange(event) {
    const newPlanId  = parseInt(event.target.value, 10);
    const lineIndex  = parseInt(this.dataset.lineIndex, 10);
    const variantId  = parseInt(this.dataset.variantId, 10);
    const quantity   = parseInt(this.dataset.quantity, 10);

    this.classList.add('cd-loading');
    this._select.disabled = true;

    try {
      // 1. Remove the existing line
      const removeRes = await fetch('/cart/change.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ line: lineIndex, quantity: 0 }),
      });
      if (!removeRes.ok) throw new Error('remove failed');

      // 2. Add back with the new selling plan
      const addRes = await fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: variantId, quantity, selling_plan: newPlanId }),
      });
      if (!addRes.ok) throw new Error('add failed');

      // 3. Refresh cart drawer items + footer
      const cartDrawerItems = document.querySelector('cart-drawer-items');
      if (cartDrawerItems && typeof cartDrawerItems.onCartUpdate === 'function') {
        await cartDrawerItems.onCartUpdate();
      }
    } catch (err) {
      console.error('[CartSubscriptionSelector] Plan change failed:', err);
      this._select.disabled = false;
      this.classList.remove('cd-loading');
    }
  }
}

customElements.define('cart-subscription-selector', CartSubscriptionSelector);
