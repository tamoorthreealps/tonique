/**
 * custom-product.js
 * Handles: Pack Size Cards variant selection + Subscription Widget + Video Popup
 */

(function () {
  'use strict';

  function formatMoney(cents) {
    var fmt = (window.Shopify && window.Shopify.money_format) || '${{amount}}';
    var amount = (cents / 100).toFixed(2);

    return fmt
      .replace(/\{\{\s*amount\s*\}\}/g, amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, Math.round(cents / 100))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amount.replace('.', ','));
  }

  // ─── Pack Size Cards ──────────────────────────────────────────────────────
  function initPackSizeCards() {
    var cards = document.querySelectorAll('.pp-pack-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      if (card.dataset.ppPackBound === 'true') return;
      card.dataset.ppPackBound = 'true';

      card.addEventListener('click', function () {
        var optionValue = this.dataset.optionValue;
        var matched = false;

        document.querySelectorAll('.pp-hidden-option input[type="radio"]').forEach(function (input) {
          if (!matched && input.value === optionValue) {
            input.click();
            matched = true;
          }
        });

        cards.forEach(function (c) {
          c.classList.remove('is-selected');
        });

        this.classList.add('is-selected');
      });
    });

    var productInfo = document.querySelector('product-info');

    if (productInfo && productInfo.dataset.ppPackVariantBound !== 'true') {
      productInfo.dataset.ppPackVariantBound = 'true';

      productInfo.addEventListener('variant:changed', function (e) {
        updateCardsForVariant(e.detail && e.detail.variant);
      });
    }

    if (document.documentElement.dataset.ppPackDocVariantBound !== 'true') {
      document.documentElement.dataset.ppPackDocVariantBound = 'true';

      document.addEventListener('variant:changed', function (e) {
        updateCardsForVariant(e.detail && e.detail.variant);
      });
    }
  }

  function updateCardsForVariant(variant) {
    if (!variant) return;

    var cards = document.querySelectorAll('.pp-pack-card');

    cards.forEach(function (card) {
      var optVal = card.dataset.optionValue;

      if (variant.options && variant.options.indexOf(optVal) !== -1) {
        var packSize = parseInt(card.dataset.packSize, 10) || 1;
        var priceEl = card.querySelector('.pp-pack-card__price');
        var perUnitEl = card.querySelector('.pp-pack-card__per-unit');

        if (priceEl) priceEl.textContent = formatMoney(variant.price);
        if (perUnitEl) perUnitEl.textContent = formatMoney(Math.round(variant.price / packSize)) + '/pouch';

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
    bindSubscriptionGlobalHandlers();

    var sectionId = getActiveSubscriptionSectionId();
    if (!sectionId) return;

    var widget = getSubscriptionWidget(sectionId);

    if (widget) {
      var checked = widget.querySelector('.pp-sub-type-radio:checked');
      setPurchaseType(widget, checked ? checked.value : 'subscribe');
    }

    bindSubscriptionSubmitHandler(sectionId);
  }

  function bindSubscriptionGlobalHandlers() {
    if (window.__ppSubGlobalHandlersBound) return;
    window.__ppSubGlobalHandlersBound = true;

    document.addEventListener('change', function (e) {
      if (e.target.matches('.pp-sub-type-radio')) {
        var widget = e.target.closest('.pp-sub-widget');
        if (widget) setPurchaseType(widget, e.target.value);
        return;
      }

      if (e.target.matches('.pp-sub-delivery__select')) {
        var widgetForSelect = e.target.closest('.pp-sub-widget');
        if (widgetForSelect) {
          updateSubscriptionPriceForSelectedPlan(widgetForSelect);
          syncSellingPlanInput(widgetForSelect);
        }
        return;
      }

      var sectionId = getActiveSubscriptionSectionId();

      if (
        sectionId &&
        e.target.name === 'id' &&
        e.target.closest('#product-form-' + sectionId)
      ) {
        updateSubscriptionWidgetForVariant(sectionId, e.target.value);
      }
    });

    document.addEventListener('click', function (e) {
      var option = e.target.closest('.pp-sub-option');
      if (!option) return;
      if (e.target.closest('select')) return;

      var radio = option.querySelector('.pp-sub-type-radio');

      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    if (window.subscribe && window.PUB_SUB_EVENTS) {
      window.subscribe(window.PUB_SUB_EVENTS.variantChange, function (pubSubData) {
        var sectionId = getActiveSubscriptionSectionId();
        var variant = pubSubData && pubSubData.data && pubSubData.data.variant;

        if (sectionId && variant) {
          updateSubscriptionWidgetForVariant(sectionId, variant.id);
        }
      });
    }
  }

  function getActiveSubscriptionSectionId() {
    var widget = document.querySelector('.pp-sub-widget');
    if (widget && widget.dataset.sectionId) return widget.dataset.sectionId;

    var input = document.querySelector('input[id^="pp-selling-plan-"]');
    if (input) return input.id.replace('pp-selling-plan-', '');

    return null;
  }

  function getSubscriptionWidget(sectionId) {
    return document.getElementById('pp-sub-widget-' + sectionId) || document.querySelector('.pp-sub-widget');
  }

  function getSubData(sectionId) {
    var dataEl = document.getElementById('pp-sub-data-' + sectionId);
    if (!dataEl) return null;

    try {
      return JSON.parse(dataEl.textContent);
    } catch (error) {
      console.error('[pp-sub] JSON parse failed:', error);
      return null;
    }
  }

  function getCurrentVariantId(sectionId) {
    var input = document.querySelector('#product-form-' + sectionId + ' input[name="id"]');
    return input ? input.value : null;
  }

  function getVariantData(sectionId, variantId) {
    var subData = getSubData(sectionId);
    if (!subData || !subData.variants) return null;

    return subData.variants[String(variantId)] || null;
  }

  function setPurchaseType(widget, type) {
    if (!widget) return;

    var subscribeOption = widget.querySelector('.pp-sub-option--subscribe');
    var onetimeOption = widget.querySelector('.pp-sub-option--onetime');
    var isSubscription = type === 'subscribe';

    if (subscribeOption) subscribeOption.classList.toggle('is-selected', isSubscription);
    if (onetimeOption) onetimeOption.classList.toggle('is-selected', !isSubscription);

    syncSellingPlanInput(widget);
  }

  function syncSellingPlanInput(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var input = document.getElementById('pp-selling-plan-' + sectionId);
    var checkedRadio = widget.querySelector('.pp-sub-type-radio:checked');
    var select = widget.querySelector('.pp-sub-delivery__select');
    var isSubscription = checkedRadio && checkedRadio.value === 'subscribe';
    var planId = (isSubscription && select && select.value) ? select.value : '';

    // Sync the subscription-widget's own scoped input (linked to the product form)
    if (input) {
      if (planId) {
        input.disabled = false;
        input.value = planId;
      } else {
        input.disabled = true;
        input.value = '';
      }
    }

    // Also sync any standalone selling-plan input the merchant added manually
    // (e.g. <input type="hidden" name="selling_plan" id="selling-plan-input">)
    var customInput = document.getElementById('selling-plan-input');
    if (customInput) {
      customInput.value = planId;
      customInput.disabled = !planId;
    }
  }

  function rebuildPlanDropdown(widget, allocations) {
    var select = widget && widget.querySelector('.pp-sub-delivery__select');
    if (!select) return;

    var previousValue = select.value;
    select.innerHTML = '';

    allocations.forEach(function (allocation, index) {
      var option = document.createElement('option');

      option.value = String(allocation.selling_plan_id);
      option.textContent = allocation.name || allocation.selling_plan_name || 'Subscription plan ' + (index + 1);

      if (String(allocation.selling_plan_id) === String(previousValue)) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    if (!select.value && select.options.length) {
      select.options[0].selected = true;
    }
  }

  function getSelectedAllocation(widget, variantData) {
    if (!widget || !variantData || !variantData.allocations || !variantData.allocations.length) return null;

    var select = widget.querySelector('.pp-sub-delivery__select');
    var selectedPlanId = select ? String(select.value) : null;
    var selectedAllocation = variantData.allocations[0];

    if (selectedPlanId) {
      variantData.allocations.forEach(function (allocation) {
        if (String(allocation.selling_plan_id) === selectedPlanId) {
          selectedAllocation = allocation;
        }
      });
    }

    return selectedAllocation;
  }

  function updateSubscriptionPriceForSelectedPlan(widget) {
    if (!widget) return;

    var sectionId = widget.dataset.sectionId;
    var variantId = getCurrentVariantId(sectionId);
    var variantData = getVariantData(sectionId, variantId);

    if (!variantData) return;

    var allocation = getSelectedAllocation(widget, variantData);
    if (!allocation) return;

    updateSubscriptionPrices(widget, variantData, allocation);
    syncSellingPlanInput(widget);
  }

  function clearAllSellingPlanInputs(sectionId) {
    var input = document.getElementById('pp-selling-plan-' + sectionId);
    if (input) { input.disabled = true; input.value = ''; }

    var customInput = document.getElementById('selling-plan-input');
    if (customInput) { customInput.value = ''; customInput.disabled = true; }
  }

  function updateSubscriptionWidgetForVariant(sectionId, variantId) {
    var widget = getSubscriptionWidget(sectionId);
    var variantData = getVariantData(sectionId, variantId);

    // If JSON failed to parse, still clear the selling_plan so a stale
    // plan ID from the previous variant is not accidentally submitted.
    if (!variantData) {
      if (widget) widget.style.display = 'none';
      clearAllSellingPlanInputs(sectionId);
      return;
    }

    var allocations = variantData.allocations || [];
    var hasSubscription = allocations.length > 0;

    if (widget) widget.style.display = hasSubscription ? '' : 'none';

    if (!hasSubscription) {
      clearAllSellingPlanInputs(sectionId);
      return;
    }

    rebuildPlanDropdown(widget, allocations);

    var allocation = getSelectedAllocation(widget, variantData) || allocations[0];

    updateSubscriptionPrices(widget, variantData, allocation);
    syncSellingPlanInput(widget);
  }

  function updateSubscriptionPrices(widget, variantData, allocation) {
    if (!widget || !variantData || !allocation) return;

    var packSize = parseInt(variantData.pack_size, 10) || 1;

    var subPriceEl = widget.querySelector('.pp-sub-subscribe-price');
    var subPerUnitEl = widget.querySelector('.pp-sub-subscribe-per-unit');
    var onetimePriceEl = widget.querySelector('.pp-sub-onetime-price');
    var onetimePerUnitEl = widget.querySelector('.pp-sub-onetime-per-unit');
    var savingsBanner = widget.querySelector('.pp-sub-savings-banner');
    var savingsText = widget.querySelector('.pp-sub-savings-banner__text');
    var comparePriceEl = widget.querySelector('.pp-sub-option__price-compare');

    if (subPriceEl) subPriceEl.textContent = formatMoney(allocation.price);
    if (subPerUnitEl) subPerUnitEl.textContent = formatMoney(Math.round(allocation.price / packSize)) + '/pouch';

    if (onetimePriceEl) onetimePriceEl.textContent = formatMoney(variantData.price);
    if (onetimePerUnitEl) onetimePerUnitEl.textContent = formatMoney(Math.round(variantData.price / packSize)) + '/pouch';

    var compareAtPrice = allocation.compare_at_price || variantData.price;
    var savings = compareAtPrice - allocation.price;

    if (comparePriceEl) {
      if (compareAtPrice > allocation.price) {
        comparePriceEl.textContent = formatMoney(compareAtPrice);
        comparePriceEl.style.display = '';
      } else {
        comparePriceEl.style.display = 'none';
      }
    }

    if (savingsBanner) {
      if (savings > 0) {
        var pct = Math.round((savings * 100) / compareAtPrice);
        if (savingsText) savingsText.textContent = 'Save ' + pct + '% (' + formatMoney(savings) + ' off)';
        savingsBanner.style.display = '';
      } else {
        savingsBanner.style.display = 'none';
      }
    }
  }

  function bindSubscriptionSubmitHandler(sectionId) {
    var productForm = document.getElementById('product-form-' + sectionId);
    if (!productForm || productForm.dataset.ppSubSubmitBound === 'true') return;

    productForm.dataset.ppSubSubmitBound = 'true';

    productForm.addEventListener('submit', function () {
      var currentSectionId = getActiveSubscriptionSectionId();
      var widget = currentSectionId && getSubscriptionWidget(currentSectionId);
      var checkedRadio = widget && widget.querySelector('.pp-sub-type-radio:checked');
      var select = widget && widget.querySelector('.pp-sub-delivery__select');
      var ourInput = currentSectionId && document.getElementById('pp-selling-plan-' + currentSectionId);
      var isSubscription = checkedRadio && checkedRadio.value === 'subscribe';

      productForm.querySelectorAll('[name="selling_plan"]').forEach(function (input) {
        input.disabled = true;
        input.value = '';
      });

      if (isSubscription && ourInput && select && select.value) {
        ourInput.disabled = false;
        ourInput.value = select.value;
      }
    }, true);
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

      if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
      }
    }

    document.querySelectorAll('.pp-video-btn').forEach(function (btn) {
      if (btn.dataset.ppVideoBound === 'true') return;
      btn.dataset.ppVideoBound = 'true';

      btn.addEventListener('click', function () {
        openModal(this.dataset.videoUrl);
      });
    });

    if (closeBtn && closeBtn.dataset.ppVideoBound !== 'true') {
      closeBtn.dataset.ppVideoBound = 'true';
      closeBtn.addEventListener('click', closeModal);
    }

    if (overlay && overlay.dataset.ppVideoBound !== 'true') {
      overlay.dataset.ppVideoBound = 'true';
      overlay.addEventListener('click', closeModal);
    }

    if (document.documentElement.dataset.ppVideoEscBound !== 'true') {
      document.documentElement.dataset.ppVideoEscBound = 'true';

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
      });
    }
  }

  function toEmbedUrl(url) {
    var ytLong = url.match(/[?&]v=([^&]+)/);
    if (ytLong) return 'https://www.youtube.com/embed/' + ytLong[1];

    var ytShort = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/)([^?&/]+)/);
    if (ytShort) return 'https://www.youtube.com/embed/' + ytShort[1];

    var vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return 'https://player.vimeo.com/video/' + vimeo[1];

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