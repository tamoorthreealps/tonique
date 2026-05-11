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

    // Click handler — drive variant picker radios/selects
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var optionValue = this.dataset.optionValue;

        // Try variant-radios first (button picker type)
        var picker = document.querySelector('variant-radios, variant-selects');
        if (picker) {
          // Radio buttons
          var matched = false;
          picker.querySelectorAll('input[type="radio"]').forEach(function (input) {
            if (!matched && input.value === optionValue) {
              input.checked = true;
              input.dispatchEvent(new Event('change', { bubbles: true }));
              matched = true;
            }
          });

          // Select fallback
          if (!matched) {
            picker.querySelectorAll('select').forEach(function (select) {
              var opt = select.querySelector('option[value="' + optionValue + '"]');
              if (opt) {
                select.value = optionValue;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
          }
        }

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
    initVideoPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
