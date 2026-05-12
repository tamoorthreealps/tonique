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
    // Resolve sectionId from widget or from the hidden selling_plan input
    var sectionId = null;
    var initWidget = document.querySelector('.pp-sub-widget');
    if (initWidget) {
      sectionId = initWidget.dataset.sectionId;
    } else {
      var initInput = document.querySelector('input[id^="pp-selling-plan-"]');
      if (initInput) sectionId = initInput.id.replace('pp-selling-plan-', '');
    }
    if (!sectionId) return;

    // Load the embedded per-variant JSON (all variants, all allocations)
    var subData = null;
    var dataEl  = document.getElementById('pp-sub-data-' + sectionId);
    if (dataEl) { try { subData = JSON.parse(dataEl.textContent); } catch (e) {} }

    // ── Event delegation — all handlers on document survive DOM changes ───────

    document.addEventListener('change', function (e) {
      if (e.target.matches('.pp-sub-type-radio')) {
        var w = e.target.closest('.pp-sub-widget');
        if (w) setPurchaseType(w, e.target.value);
      } else if (e.target.matches('.pp-sub-delivery__select')) {
        var inp = document.getElementById('pp-selling-plan-' + sectionId);
        var subOpt = document.querySelector('.pp-sub-option--subscribe');
        if (inp && subOpt && subOpt.classList.contains('is-selected')) {
          inp.value = e.target.value;
        }
      }
    });

    document.addEventListener('click', function (e) {
      var opt = e.target.closest('.pp-sub-option');
      if (!opt) return;
      if (e.target.closest('select')) return;
      var radio = opt.querySelector('.pp-sub-type-radio');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // ── Purchase type ─────────────────────────────────────────────────────────

    function setPurchaseType(w, type) {
      var sid             = w.dataset.sectionId;
      var subscribeOpt    = w.querySelector('.pp-sub-option--subscribe');
      var onetimeOpt      = w.querySelector('.pp-sub-option--onetime');
      var frequencySelect = w.querySelector('.pp-sub-delivery__select');
      var sellingPlanInput = document.getElementById('pp-selling-plan-' + sid);

      var isSub = type === 'subscribe';
      if (subscribeOpt) subscribeOpt.classList.toggle('is-selected', isSub);
      if (onetimeOpt)   onetimeOpt.classList.toggle('is-selected', !isSub);

      if (sellingPlanInput) {
        if (isSub) {
          sellingPlanInput.disabled = false;
          // Only override value when there's a multi-plan dropdown; otherwise
          // keep the plan ID already written by Liquid.
          if (frequencySelect) sellingPlanInput.value = frequencySelect.value;
        } else {
          sellingPlanInput.disabled = true;
          sellingPlanInput.value    = '';
        }
      }
    }

    // ── Update widget prices from embedded JSON (no network request) ──────────

    function updateWidget(variantId) {
      if (!subData || !subData.variants) return;
      var vData = subData.variants[String(variantId)];
      if (!vData) return;

      var w                = document.querySelector('.pp-sub-widget');
      var sellingPlanInput = document.getElementById('pp-selling-plan-' + sectionId);
      var hasAlloc         = vData.allocations && vData.allocations.length > 0;

      // Show or hide the whole widget
      if (w) w.style.display = hasAlloc ? '' : 'none';
      if (sellingPlanInput && !hasAlloc) {
        sellingPlanInput.disabled = true;
        sellingPlanInput.value    = '';
        return;
      }
      if (!hasAlloc) return;

      // Pick the allocation matching the currently selected frequency (or first)
      var frequencySelect = w && w.querySelector('.pp-sub-delivery__select');
      var planId          = frequencySelect ? parseInt(frequencySelect.value, 10) : null;
      var alloc           = vData.allocations[0];
      if (planId) {
        for (var i = 0; i < vData.allocations.length; i++) {
          if (vData.allocations[i].selling_plan_id === planId) { alloc = vData.allocations[i]; break; }
        }
      }

      var packSize = vData.pack_size || 1;

      // Update subscribe prices
      var subPriceEl   = w && w.querySelector('.pp-sub-subscribe-price');
      var subPerUnitEl = w && w.querySelector('.pp-sub-subscribe-per-unit');
      var otPriceEl    = w && w.querySelector('.pp-sub-onetime-price');
      var otPerUnitEl  = w && w.querySelector('.pp-sub-onetime-per-unit');
      var savingsBanner = w && w.querySelector('.pp-sub-savings-banner');
      var savingsText   = w && w.querySelector('.pp-sub-savings-banner__text');

      if (alloc) {
        if (subPriceEl)   subPriceEl.textContent   = formatMoney(alloc.price);
        if (subPerUnitEl) subPerUnitEl.textContent = formatMoney(Math.round(alloc.price / packSize)) + '/pouch';

        var savings = alloc.compare_at_price - alloc.price;
        if (savingsBanner) {
          if (savings > 0) {
            var pct = Math.round(savings * 100 / alloc.compare_at_price);
            if (savingsText) savingsText.textContent = 'Save ' + pct + '% (' + formatMoney(savings) + ' off)';
            savingsBanner.style.display = '';
          } else {
            savingsBanner.style.display = 'none';
          }
        }
      }
      if (otPriceEl)   otPriceEl.textContent   = formatMoney(vData.price);
      if (otPerUnitEl) otPerUnitEl.textContent = formatMoney(Math.round(vData.price / packSize)) + '/pouch';

      // Update selling_plan input based on currently selected purchase type
      var subscribeOpt = w && w.querySelector('.pp-sub-option--subscribe');
      var isSubSelected = subscribeOpt && subscribeOpt.classList.contains('is-selected');
      if (sellingPlanInput) {
        sellingPlanInput.disabled = !isSubSelected;
        if (isSubSelected && alloc) sellingPlanInput.value = String(alloc.selling_plan_id);
      }
    }

    // ── Listen for variant changes ────────────────────────────────────────────
    // Primary: Dawn explicitly sets input[name="id"] value and dispatches a
    // bubbling "change" event in updateVariantInputs() — fires for every
    // variant change including pack size card clicks.
    // Backup: PUB_SUB_EVENTS.variantChange publishes the full variant object.

    var lastVariantId = null;

    function onVariantChange(variantId) {
      var id = String(variantId);
      if (!id || id === lastVariantId) return;
      lastVariantId = id;
      updateWidget(id);
    }

    document.addEventListener('change', function (e) {
      if (e.target.name === 'id' && e.target.closest('#product-form-' + sectionId)) {
        onVariantChange(e.target.value);
      }
    });

    if (window.subscribe && window.PUB_SUB_EVENTS) {
      window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (pubSubData) {
        var variant = pubSubData && pubSubData.data && pubSubData.data.variant;
        if (variant) onVariantChange(variant.id);
      });
    }

    // ── On submit: enforce selling_plan based on our widget state ─────────────
    // Recharge injects its own enabled selling_plan input into the form even
    // when its UI is hidden. We intercept submit and disable every selling_plan
    // input in the form when the user has chosen one-time.

    var productForm = document.getElementById('product-form-' + sectionId);
    if (productForm) {
      productForm.addEventListener('submit', function () {
        var w = document.querySelector('.pp-sub-widget');
        var subscribeOpt = w && w.querySelector('.pp-sub-option--subscribe');
        var isSubSelected = subscribeOpt && subscribeOpt.classList.contains('is-selected');

        productForm.querySelectorAll('[name="selling_plan"]').forEach(function (inp) {
          if (!isSubSelected) {
            inp.disabled = true;
            inp.value    = '';
          } else if (inp === document.getElementById('pp-selling-plan-' + sectionId)) {
            // Our own input — keep it enabled with its value
            inp.disabled = false;
          }
        });
      });
    }

    // ── Initialise default purchase type ─────────────────────────────────────

    var w = document.querySelector('.pp-sub-widget');
    if (w) setPurchaseType(w, 'subscribe');
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
