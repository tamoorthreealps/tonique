/**
 * custom-product.js
 * Handles: Pack Size Cards variant selection + Video Popup
 */

(function () {
  'use strict';

  // ─── Money formatter ──────────────────────────────────────────────────────
  function formatMoney(cents) {
    var fmt = (window.Shopify && window.Shopify.money_format) || '${{amount}}';
    var amount = (cents / 100).toFixed(2);
    // Remove trailing .00 only if format uses {{amount}} (no decimal placeholder)
    return fmt.replace(/\{\{\s*amount\s*\}\}/g, amount)
              .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, Math.round(cents / 100))
              .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amount.replace('.', ','));
  }

  // ─── Pack Size Cards ──────────────────────────────────────────────────────
  function initPackSizeCards() {
    var cards = document.querySelectorAll('.pp-pack-card');
    if (!cards.length) return;

    // Click handler — trigger the hidden Dawn radio so variant-selects / product-info
    // fire exactly the same event flow as a real user interaction.
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var optionValue = this.dataset.optionValue;

        // The pack-size fieldset is hidden (.pp-hidden-option) but its Dawn-rendered
        // radio inputs carry data-option-value-id and data-product-url, which is what
        // variant-selects → product-info need. Calling .click() fires the native
        // click + change events even on display:none elements.
        var matched = false;
        document.querySelectorAll('.pp-hidden-option input[type="radio"]').forEach(function (input) {
          if (!matched && input.value === optionValue) {
            input.click();
            matched = true;
          }
        });

        // Update selected state visually
        cards.forEach(function (c) { c.classList.remove('is-selected'); });
        this.classList.add('is-selected');
      });
    });

    // Listen for Shopify variant change events to update prices on cards
    // Dawn dispatches `variant:changed` on the product-info element
    var productInfo = document.querySelector('product-info');
    if (productInfo) {
      productInfo.addEventListener('variant:changed', function (e) {
        updateCardsForVariant(e.detail && e.detail.variant);
      });
    }
    // Also listen on document (some themes/apps emit it there)
    document.addEventListener('variant:changed', function (e) {
      updateCardsForVariant(e.detail && e.detail.variant);
    });
  }

  function updateCardsForVariant(variant) {
    if (!variant) return;
    var cards = document.querySelectorAll('.pp-pack-card');

    // For each card, if the currently selected variant shares the same
    // pack-size option value, update the displayed price
    cards.forEach(function (card) {
      var optVal = card.dataset.optionValue;
      // Check if this variant uses the same pack size option
      if (variant.options && variant.options.indexOf(optVal) !== -1) {
        var packSize = parseInt(card.dataset.packSize, 10) || 1;
        var priceEl = card.querySelector('.pp-pack-card__price');
        var perUnitEl = card.querySelector('.pp-pack-card__per-unit');

        if (priceEl) priceEl.textContent = formatMoney(variant.price);
        if (perUnitEl) perUnitEl.textContent = formatMoney(Math.round(variant.price / packSize)) + '/pouch';

        // Mark this card selected if the variant's option matches
        if (String(variant.id) === String(card.dataset.variantId)) {
          document.querySelectorAll('.pp-pack-card').forEach(function (c) {
            c.classList.remove('is-selected');
          });
          card.classList.add('is-selected');
        }
      }
    });
  }

  // ─── Subscription Widget ─────────────────────────────────────────────────
  function initSubscriptionWidget() {
    var widget = document.querySelector('.pp-sub-widget');
    if (!widget) return;

    var sectionId        = widget.dataset.sectionId;
    var subscribeOpt     = widget.querySelector('.pp-sub-option--subscribe');
    var onetimeOpt       = widget.querySelector('.pp-sub-option--onetime');
    var frequencySelect  = widget.querySelector('.pp-sub-delivery__select');
    var sellingPlanInput = document.getElementById('pp-selling-plan-' + sectionId);

    var subData = null;
    var dataEl  = document.getElementById('pp-sub-data-' + sectionId);
    if (dataEl) {
      try { subData = JSON.parse(dataEl.textContent); } catch (e) {}
    }

    function setPurchaseType(type) {
      var isSub = type === 'subscribe';
      subscribeOpt.classList.toggle('is-selected', isSub);
      onetimeOpt.classList.toggle('is-selected', !isSub);
      if (sellingPlanInput) {
        sellingPlanInput.disabled = !isSub;
        sellingPlanInput.value    = isSub && frequencySelect ? frequencySelect.value : '';
      }
    }

    widget.querySelectorAll('.pp-sub-type-radio').forEach(function (radio) {
      radio.addEventListener('change', function () { setPurchaseType(this.value); });
    });

    [subscribeOpt, onetimeOpt].forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        if (e.target.closest('select')) return;
        var radio = opt.querySelector('.pp-sub-type-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    if (frequencySelect && sellingPlanInput) {
      frequencySelect.addEventListener('change', function () {
        if (subscribeOpt.classList.contains('is-selected')) {
          sellingPlanInput.value = this.value;
        }
      });
    }

    function updateSubPrices(variantId) {
      if (!subData || !subData.variants) return;
      var vData = subData.variants[String(variantId)];
      if (!vData) return;

      var hasAllocations = vData.allocations && vData.allocations.length > 0;

      // Hide widget and clear plan if variant has no subscription allocations
      widget.style.display = hasAllocations ? '' : 'none';
      if (sellingPlanInput) {
        sellingPlanInput.disabled = !hasAllocations;
        if (!hasAllocations) { sellingPlanInput.value = ''; return; }
      }

      var packSize = vData.pack_size || 1;
      var planId   = frequencySelect ? parseInt(frequencySelect.value, 10) : null;
      var alloc    = null;
      if (planId && vData.allocations) {
        for (var i = 0; i < vData.allocations.length; i++) {
          if (vData.allocations[i].selling_plan_id === planId) { alloc = vData.allocations[i]; break; }
        }
        if (!alloc) alloc = vData.allocations[0];
      }
      var subPriceEl   = widget.querySelector('.pp-sub-subscribe-price');
      var subPerUnitEl = widget.querySelector('.pp-sub-subscribe-per-unit');
      var otPriceEl    = widget.querySelector('.pp-sub-onetime-price');
      var otPerUnitEl  = widget.querySelector('.pp-sub-onetime-per-unit');
      if (alloc) {
        if (subPriceEl)   subPriceEl.textContent   = formatMoney(alloc.price);
        if (subPerUnitEl) subPerUnitEl.textContent = formatMoney(Math.round(alloc.price / packSize)) + '/pouch';
        if (sellingPlanInput && subscribeOpt.classList.contains('is-selected')) {
          sellingPlanInput.value = String(alloc.selling_plan_id);
        }
      }
      if (otPriceEl)   otPriceEl.textContent   = formatMoney(vData.price);
      if (otPerUnitEl) otPerUnitEl.textContent = formatMoney(Math.round(vData.price / packSize)) + '/pouch';
    }

    if (window.subscribe && window.PUB_SUB_EVENTS) {
      window.subscribe(window.PUB_SUB_EVENTS.optionValueSelectionChange, function () {
        var obs = new MutationObserver(function () {
          var el = document.querySelector('variant-selects [data-selected-variant]');
          if (el) { try { var v = JSON.parse(el.textContent); if (v) updateSubPrices(v.id); } catch (e) {} }
          obs.disconnect();
        });
        obs.observe(document.querySelector('variant-selects') || document.body, { childList: true, subtree: true });
      });
    }

    setPurchaseType('subscribe');
  }

  // ─── Video Popup ──────────────────────────────────────────────────────────
  function initVideoPopup() {
    var modal = document.getElementById('pp-video-modal');
    if (!modal) return;

    var overlay = modal.querySelector('.pp-video-modal__overlay');
    var closeBtn = modal.querySelector('.pp-video-modal__close');
    var iframe = modal.querySelector('#pp-video-iframe');
    var videoEl = modal.querySelector('#pp-video-el');

    function openModal(url) {
      if (iframe) {
        var embedUrl = toEmbedUrl(url);
        iframe.src = embedUrl + (embedUrl.indexOf('?') !== -1 ? '&' : '?') + 'autoplay=1';
      } else if (videoEl) {
        videoEl.src = url;
        videoEl.play();
      }
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      modal.setAttribute('hidden', '');
      document.body.style.overflow = '';
      if (iframe) iframe.src = '';
      if (videoEl) { videoEl.pause(); videoEl.src = ''; }
    }

    // Open via play buttons
    document.querySelectorAll('.pp-video-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(this.dataset.videoUrl);
      });
    });

    // Close triggers
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
    });
  }

  function toEmbedUrl(url) {
    // YouTube long-form: youtube.com/watch?v=ID
    var ytLong = url.match(/[?&]v=([^&]+)/);
    if (ytLong) return 'https://www.youtube.com/embed/' + ytLong[1];

    // YouTube short: youtu.be/ID or youtube.com/embed/ID
    var ytShort = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/)([^?&/]+)/);
    if (ytShort) return 'https://www.youtube.com/embed/' + ytShort[1];

    // Vimeo
    var vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return 'https://player.vimeo.com/video/' + vimeo[1];

    // Direct video file — use video element (handled in HTML)
    return url;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    initPackSizeCards();
    initSubscriptionWidget();
    initVideoPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
