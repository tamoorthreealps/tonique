/**
 * CartSubscriptionSelector
 * Custom element that handles changing a subscription selling plan from the cart drawer.
 * Shown only when a product has more than one available selling plan.
 *
 * Flow: remove line at index → add back with new selling_plan → refresh cart drawer via Sections API.
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

      // 3. Re-render the cart drawer via Shopify Sections API
      await this._refreshCartDrawer();
    } catch (err) {
      console.error('[CartSubscriptionSelector] Plan change failed:', err);
      this._select.disabled = false;
      this.classList.remove('cd-loading');
    }
  }

  async _refreshCartDrawer() {
    // Read section ID that was embedded in the drawer HTML at render time
    const sectionIdEl = document.getElementById('CartDrawer-SectionId');
    const sectionId   = sectionIdEl ? sectionIdEl.dataset.sectionId : 'cart-drawer';

    const response = await fetch(`/?sections=${encodeURIComponent(sectionId)}`);
    if (!response.ok) throw new Error('section fetch failed');

    const json = await response.json();
    const html  = json[sectionId];
    if (!html) throw new Error(`section "${sectionId}" missing from response`);

    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Replace cart items
    const cartDrawerItems    = document.querySelector('cart-drawer-items');
    const newCartDrawerItems = doc.querySelector('cart-drawer-items');
    if (cartDrawerItems && newCartDrawerItems) {
      cartDrawerItems.innerHTML = newCartDrawerItems.innerHTML;
    }

    // Replace footer totals
    const footer    = document.querySelector('.cart-drawer__footer');
    const newFooter = doc.querySelector('.cart-drawer__footer');
    if (footer && newFooter) {
      footer.innerHTML = newFooter.innerHTML;
    }

    // Update item count badge in the header
    const count    = document.querySelector('.cd-drawer__count');
    const newCount = doc.querySelector('.cd-drawer__count');
    if (count && newCount) {
      count.innerHTML = newCount.innerHTML;
    }

    // Update reward pills / shipping bar
    const bar    = document.querySelector('.cd-shipping-bar');
    const newBar = doc.querySelector('.cd-shipping-bar');
    if (bar && newBar) {
      bar.innerHTML = newBar.innerHTML;
    } else if (!bar && newBar) {
      // Bar didn't exist (cart was empty?) — insert before cart-drawer-items
      cartDrawerItems && cartDrawerItems.before(newBar);
    }
  }
}

customElements.define('cart-subscription-selector', CartSubscriptionSelector);
