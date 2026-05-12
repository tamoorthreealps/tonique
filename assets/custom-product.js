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

    // ── Event delegation — survives DOM replacement on re-render ─────────────

    document.addEventListener('change', function (e) {
      if (e.target.matches('.pp-sub-type-radio')) {
        var w = e.target.closest('.pp-sub-widget');
        if (w) setPurchaseType(w, e.target.value);
      } else if (e.target.matches('.pp-sub-delivery__select')) {
        var sellingPlanInput = document.getElementById('pp-selling-plan-' + sectionId);
        var subscribeOpt = document.querySelector('.pp-sub-option--subscribe');
        if (sellingPlanInput && subscribeOpt && subscribeOpt.classList.contains('is-selected')) {
          sellingPlanInput.value = e.target.value;
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

    // ── Purchase type helper ──────────────────────────────────────────────────

    function setPurchaseType(w, type) {
      var sid = w.dataset.sectionId;
      var subscribeOpt    = w.querySelector('.pp-sub-option--subscribe');
      var onetimeOpt      = w.querySelector('.pp-sub-option--onetime');
      var frequencySelect = w.querySelector('.pp-sub-delivery__select');
      var sellingPlanInput = document.getElementById('pp-selling-plan-' + sid);

      var isSub = type === 'subscribe';
      if (subscribeOpt) subscribeOpt.classList.toggle('is-selected', isSub);
      if (onetimeOpt)   onetimeOpt.classList.toggle('is-selected', !isSub);
      if (sellingPlanInput) {
        sellingPlanInput.disabled = !isSub;
        sellingPlanInput.value    = isSub && frequencySelect ? frequencySelect.value : '';
      }
    }

    // ── Re-render widget via Shopify sections API ─────────────────────────────

    function reRenderWidget(variantId) {
      var productInfo = document.querySelector('product-info');
      var productUrl  = (productInfo && productInfo.dataset.url) || window.location.pathname.split('?')[0];
      var url = productUrl + '?variant=' + variantId + '&sections=' + encodeURIComponent(sectionId);

      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var html = data[sectionId];
          if (!html) return;

          var parser = new DOMParser();
          var doc    = parser.parseFromString(html, 'text/html');

          // Swap JSON data blob
          var newDataEl = doc.getElementById('pp-sub-data-' + sectionId);
          var oldDataEl = document.getElementById('pp-sub-data-' + sectionId);
          if (oldDataEl && newDataEl) oldDataEl.replaceWith(newDataEl.cloneNode(true));

          // Swap selling_plan input
          var newInput = doc.getElementById('pp-selling-plan-' + sectionId);
          var oldInput = document.getElementById('pp-selling-plan-' + sectionId);
          if (oldInput && newInput) {
            oldInput.replaceWith(newInput.cloneNode(true));
          } else if (oldInput && !newInput) {
            oldInput.disabled = true;
            oldInput.value    = '';
          }

          // Swap widget div
          var newWidget = doc.getElementById('pp-sub-widget-' + sectionId);
          var oldWidget = document.getElementById('pp-sub-widget-' + sectionId);

          if (newWidget && oldWidget) {
            oldWidget.replaceWith(newWidget.cloneNode(true));
          } else if (newWidget && !oldWidget) {
            // Variant now has subscriptions — insert after the selling_plan input
            var inp = document.getElementById('pp-selling-plan-' + sectionId);
            if (inp) inp.after(newWidget.cloneNode(true));
          } else if (!newWidget && oldWidget) {
            oldWidget.remove();
          }

          // Re-apply default purchase type on the freshly swapped widget
          var w = document.getElementById('pp-sub-widget-' + sectionId);
          if (w) setPurchaseType(w, 'subscribe');
        })
        .catch(function () {});
    }

    // ── Trigger re-render on variant change ───────────────────────────────────

    var productInfo = document.querySelector('product-info');
    if (productInfo) {
      productInfo.addEventListener('variant:changed', function (e) {
        var variant = e.detail && e.detail.variant;
        if (variant) reRenderWidget(variant.id);
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
